"""Regression tests for the hardening findings of an earlier security audit.

Each test names the finding it guards, so a failure points straight at the
behaviour that came back.
"""

import io
import json
import struct
import threading

import anyio
import numpy as np
import pytest
import soundfile as sf
from fastapi.testclient import TestClient

from phaseforge import cli
from phaseforge.analysis import metrics
from phaseforge.api import support
from phaseforge.api.app import create_app
from phaseforge.audio import denoise, drpe as audio_drpe, enhance
from phaseforge.image import drpe as image_drpe
from phaseforge.image import freq_edit, watermark
from phaseforge.io import audio_cipher, audio_io, image_io
from phaseforge.keys import derive

PASSPHRASE = "hardening passphrase"
FAST = 1000


@pytest.fixture(scope="module")
def client():
    with TestClient(create_app()) as test_client:
        yield test_client


def png_bytes(array):
    buffer = io.BytesIO()
    image_io.save_image(buffer, array, format="PNG")
    return buffer.getvalue()


def wav_bytes(array, sample_rate=16000):
    buffer = io.BytesIO()
    audio_io.save_audio(buffer, array, sample_rate, subtype="FLOAT", format="WAV")
    return buffer.getvalue()


@pytest.fixture
def tone():
    t = np.linspace(0, 0.5, 8000, endpoint=False)
    return (0.4 * np.sin(2 * np.pi * 220 * t))[None, :]


# -- Finding 9: modules handle arbitrary lengths ----------------------------

def test_modules_run_on_odd_carriers():
    rng = np.random.default_rng(0)
    image = rng.random((1, 63, 65)) * 0.5
    mark = rng.random(watermark.mark_shape(image.shape))
    low = freq_edit.apply_filter(image, "low", cutoff=0.3, filter_shape="ideal")
    high = freq_edit.apply_filter(image, "high", cutoff=0.3, filter_shape="ideal")
    recovered = watermark.extract(image, watermark.embed(image, mark))
    assert np.allclose(low + high, image)
    assert np.max(np.abs(recovered[0] - mark)) < 1e-8


# -- Finding 3: work runs off the event loop ----------------------------------

def test_run_job_executes_in_a_worker_thread():
    async def main():
        loop_thread = threading.get_ident()
        job_thread = await support.run_job(threading.get_ident)
        return loop_thread, job_thread

    loop_thread, job_thread = anyio.run(main)
    assert loop_thread != job_thread


# -- Findings 4 and 5: watermark geometry -------------------------------------

@pytest.mark.parametrize("shape", [(64, 64), (65, 65), (64, 65), (65, 64), (63, 97), (3, 3), (4, 5)])
def test_watermark_round_trip_every_parity(shape):
    rng = np.random.default_rng(sum(shape))
    image = rng.random((3, *shape)) * 0.5 + 0.1
    mark = rng.random(watermark.mark_shape(image.shape))  # asymmetric on purpose
    recovered = watermark.extract(image, watermark.embed(image, mark))
    assert np.max(np.abs(recovered - mark)) < 1e-8


# -- Finding 6: zero-energy channels and zero strength ------------------------

def test_black_channel_does_not_poison_extraction():
    rng = np.random.default_rng(3)
    image = rng.random((3, 64, 64))
    image[1] = 0.0
    mark = rng.random((16, 16))
    recovered = watermark.extract(image, watermark.embed(image, mark))
    assert np.isfinite(recovered).all()
    for plane in recovered:
        assert metrics.normalized_correlation(mark, plane) > 0.999


def test_fully_black_carrier_is_rejected_cleanly():
    image = np.zeros((1, 64, 64))
    with pytest.raises(ValueError, match="no spectral energy"):
        watermark.extract(image, image)


@pytest.mark.parametrize("strength", [0.0, -1.0, float("nan"), float("inf")])
def test_invalid_strength_rejected(strength):
    image = np.random.default_rng(4).random((1, 64, 64))
    with pytest.raises(ValueError, match="strength"):
        watermark.embed(image, np.ones((8, 8)), strength)


def test_watermark_api_round_trip_on_odd_image(client):
    rng = np.random.default_rng(5)
    carrier = rng.random((3, 65, 81)) * 0.6 + 0.2
    mark = np.zeros((1, 16, 20))  # the block size for 65 x 81
    mark[0, 4:12, 5:15] = 1.0
    embedded = client.post(
        "/api/image/watermark/embed",
        files={"file": ("c.png", png_bytes(carrier)), "watermark_file": ("m.png", png_bytes(mark))})
    assert embedded.status_code == 200
    extracted = client.post(
        "/api/image/watermark/extract",
        files={"original": ("c.png", png_bytes(carrier)),
               "marked": ("w.png", embedded.content)})
    assert extracted.status_code == 200
    recovered = image_io.load_image(io.BytesIO(extracted.content))[0].mean(axis=0)
    assert metrics.normalized_correlation(mark[0], recovered) > 0.9


# -- Finding 2: resource limits -----------------------------------------------

@pytest.mark.parametrize("block_size", [1 << 30, 32, 100])
def test_audio_block_size_bounded(client, tone, block_size):
    response = client.post("/api/audio/encrypt",
                           files={"file": ("in.wav", wav_bytes(tone))},
                           data={"passphrase": PASSPHRASE, "block_size": str(block_size)})
    assert response.status_code == 400


def test_kdf_iterations_bounded():
    with pytest.raises(ValueError, match="iterations"):
        derive.derive_key("x", b"0" * 16, derive.MAX_ITERATIONS + 1)
    with pytest.raises(ValueError, match="iterations"):
        derive.derive_key("x", b"0" * 16, 0)


def test_cipher_with_huge_iterations_rejected(client, tone):
    cipher, meta = audio_drpe.encrypt(tone, PASSPHRASE, 16000, iterations=FAST)
    meta["iterations"] = 2_000_000_000
    response = client.post("/api/audio/decrypt",
                           files={"file": ("c.wav", audio_cipher.encode(cipher, meta))},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400


# -- Finding 7: malformed ciphertexts are client errors -----------------------

def _tampered_wav(cipher, meta, edit):
    """A cipher WAV whose stored metadata has been passed through ``edit``."""
    wav = audio_cipher.encode(cipher, meta)
    stored = json.loads(audio_cipher._find_chunk(wav, audio_cipher.CHUNK_ID))
    edit(stored)
    body_end = wav.index(audio_cipher.CHUNK_ID)
    plain = b"RIFF" + struct.pack("<I", body_end - 8) + wav[8:body_end]
    return audio_cipher._append_chunk(plain, audio_cipher.CHUNK_ID,
                                      json.dumps(stored).encode())


@pytest.mark.parametrize("field", ["salt", "iterations", "sample_rate", "length", "scale"])
def test_cipher_missing_metadata_is_400(client, tone, field):
    cipher, meta = audio_drpe.encrypt(tone, PASSPHRASE, 16000, iterations=FAST)
    response = client.post("/api/audio/decrypt",
                           files={"file": ("c.wav", _tampered_wav(
                               cipher, meta, lambda stored: stored.pop(field)))},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400
    assert "metadata" in response.json()["detail"]


def test_cipher_length_mismatch_is_400(client, tone):
    cipher, meta = audio_drpe.encrypt(tone, PASSPHRASE, 16000, iterations=FAST)
    response = client.post("/api/audio/decrypt",
                           files={"file": ("c.wav", _tampered_wav(
                               cipher, meta, lambda stored: stored.update(length=80_000)))},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400


def test_plain_wav_is_not_a_cipher(client, tone):
    response = client.post("/api/audio/decrypt",
                           files={"file": ("plain.wav", wav_bytes(tone))},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400
    assert "cipher WAV" in response.json()["detail"]


def test_cipher_with_garbage_metadata_is_400(client, tone):
    wav = audio_cipher._append_chunk(wav_bytes(tone), audio_cipher.CHUNK_ID, b"not json")
    response = client.post("/api/audio/decrypt",
                           files={"file": ("c.wav", wav)},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400


def test_cipher_wav_round_trips_through_codec(tone):
    cipher, meta = audio_drpe.encrypt(tone, PASSPHRASE, 16000, iterations=FAST)
    wav = audio_cipher.encode(cipher, meta)
    info = sf.info(io.BytesIO(wav))
    assert info.channels == 1 and info.frames == 2 * cipher.size
    decoded, decoded_meta = audio_cipher.decode(wav)
    assert decoded_meta["salt"] == meta["salt"]
    np.testing.assert_allclose(decoded, cipher, atol=1e-6)


# -- Finding 8: DSP parameters ------------------------------------------------

def test_zero_noise_frames_rejected(client, tone):
    response = client.post("/api/audio/denoise",
                           files={"file": ("in.wav", wav_bytes(tone))},
                           data={"noise_frames": "0"})
    assert response.status_code == 400


@pytest.mark.parametrize("kwargs", [
    {"reduction_db": float("nan")},
    {"smoothing": float("inf")},
    {"smoothing": 1.0},
    {"noise_frames": -3},
])
def test_denoise_rejects_invalid_parameters(kwargs):
    with pytest.raises(ValueError):
        denoise.denoise(np.zeros(4096), **kwargs)


@pytest.mark.parametrize("kwargs", [
    {"reduction_db": float("nan")},
    {"harmonics": -1.0},
    {"clarity_db": float("nan")},
])
def test_enhance_rejects_invalid_parameters(kwargs):
    with pytest.raises(ValueError):
        enhance.enhance(np.zeros(4096), 16000, **kwargs)


def test_denoise_and_enhance_endpoints(client, tone):
    noisy = tone + np.random.default_rng(6).normal(scale=0.02, size=tone.shape)
    for route, data in (("denoise", {"noise_frames": "3", "reduction_db": "12"}),
                        ("enhance", {"clarity_db": "6", "harmonics": "0.8",
                                     "normalize": "false"})):
        response = client.post(f"/api/audio/{route}",
                               files={"file": ("in.wav", wav_bytes(noisy))}, data=data)
        assert response.status_code == 200, response.text
        out = audio_io.load_audio(io.BytesIO(response.content))[0]
        assert out.shape == noisy.shape
        assert np.isfinite(out).all()


# -- Filter validation -------------------------------------------

@pytest.mark.parametrize("data", [
    {"kind": "band", "cutoff": "0.3", "high_cutoff": "0.2"},
    {"kind": "band", "cutoff": "0.3", "high_cutoff": "5"},
    {"filter_shape": "butterworth", "order": "0"},
    {"kind": "sideways"},
    {"cutoff": "nan"},
])
def test_filter_rejects_invalid_parameters(client, data):
    image = png_bytes(np.random.default_rng(7).random((1, 32, 32)))
    response = client.post("/api/image/filter", files={"file": ("i.png", image)}, data=data)
    assert response.status_code in (400, 422)



# -- Analysis ------------------------------------------------------------------

def test_attack_report_rejects_mismatched_original(client):
    image = np.random.default_rng(9).random((3, 32, 32))
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image))},
                            data={"passphrase": PASSPHRASE})
    other = png_bytes(np.random.default_rng(10).random((3, 40, 40)))
    response = client.post("/api/analysis/attack-report",
                           files={"ciphertext": ("cipher.png", encrypted.content),
                                  "original": ("o.png", other)},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400
    assert "does not match" in response.json()["detail"]


def test_attack_report_accepts_colour_original_for_greyscale_cipher(client):
    image = np.random.default_rng(11).random((3, 32, 32))
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image))},
                            data={"passphrase": PASSPHRASE, "greyscale": "true"})
    response = client.post("/api/analysis/attack-report",
                           files={"ciphertext": ("cipher.png", encrypted.content),
                                  "original": ("o.png", png_bytes(image))},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 200
    json.loads(response.text)


def test_key_reuse_demo_returns_viewable_images(client):
    body = client.post("/api/analysis/key-reuse-demo", json={"size": 32}).json()
    assert body["correlation"] > 0.999
    for key in ("secret", "ciphertext", "recovered"):
        assert body["images"][key].startswith("data:image/png;base64,")


# -- Image decryption validates metadata --------------------------------------

def test_image_decrypt_requires_metadata_fields():
    image = np.random.default_rng(12).random((1, 16, 16))
    cipher, meta = image_drpe.encrypt(image, PASSPHRASE, iterations=FAST)
    del meta["salt"]
    with pytest.raises(ValueError, match="salt"):
        image_drpe.decrypt(cipher, PASSPHRASE, meta)


# -- CLI -----------------------------------------------------------------------

def test_cli_reports_user_errors_without_traceback(tmp_path, capsys):
    source = tmp_path / "in.wav"
    audio_io.save_audio(source, np.zeros((1, 2048)), 16000)
    code = cli.main(["denoise", str(source), str(tmp_path / "out.wav"), "--noise-frames", "0"])
    assert code == 1
    assert "noise_frames" in capsys.readouterr().err
