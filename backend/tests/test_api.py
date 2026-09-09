"""HTTP layer: uploads in, files out, limits enforced."""

import io
import json
import zipfile

import numpy as np
import pytest
from fastapi.testclient import TestClient

from phaseforge.analysis import metrics
from phaseforge.api import support
from phaseforge.api.app import create_app
from phaseforge.io import audio_io, image_io

PASSPHRASE = "api test passphrase"


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


def read_png(payload):
    return image_io.load_image(io.BytesIO(payload))[0]


def read_wav(payload):
    return audio_io.load_audio(io.BytesIO(payload))[0]


@pytest.fixture
def image():
    y, x = np.mgrid[0:64, 0:64] / 64
    picture = np.stack([x, y, np.full_like(x, 0.5)])
    picture[:, 20:40, 20:40] = 1.0
    return picture


@pytest.fixture
def signal():
    t = np.linspace(0, 0.5, 8000, endpoint=False)
    return (0.4 * np.sin(2 * np.pi * 220 * t))[None, :]


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_info_reports_defaults_and_limits(client):
    body = client.get("/api/info").json()
    assert body["transform"]["backend"] == "numpy"
    assert "numpy" in body["transform"]["available"]
    assert body["limits"]["max_image_pixels"] > 0
    assert body["defaults"]["audio_block_size"] == 4096
    assert "gaussian" in body["defaults"]["filter_shapes"]


def test_image_encrypt_decrypt_round_trip(client, image):
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image), "image/png")},
                            data={"passphrase": PASSPHRASE})
    assert encrypted.status_code == 200
    assert encrypted.headers["content-type"] == "application/octet-stream"
    assert "cipher.npz" in encrypted.headers["content-disposition"]

    decrypted = client.post("/api/image/decrypt",
                            files={"file": ("cipher.npz", encrypted.content)},
                            data={"passphrase": PASSPHRASE})
    assert decrypted.status_code == 200
    assert metrics.psnr(image, read_png(decrypted.content)) > 40


def test_image_wrong_passphrase_returns_noise(client, image):
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image), "image/png")},
                            data={"passphrase": PASSPHRASE})
    decrypted = client.post("/api/image/decrypt",
                            files={"file": ("cipher.npz", encrypted.content)},
                            data={"passphrase": "the wrong one"})

    assert decrypted.status_code == 200  # DRPE has no integrity check to fail on
    assert abs(metrics.normalized_correlation(image, read_png(decrypted.content))) < 0.1


def test_audio_encrypt_decrypt_round_trip(client, signal):
    encrypted = client.post("/api/audio/encrypt",
                            files={"file": ("in.wav", wav_bytes(signal), "audio/wav")},
                            data={"passphrase": PASSPHRASE})
    assert encrypted.status_code == 200

    decrypted = client.post("/api/audio/decrypt",
                            files={"file": ("cipher.npz", encrypted.content)},
                            data={"passphrase": PASSPHRASE})
    assert decrypted.status_code == 200
    recovered = read_wav(decrypted.content)
    assert recovered.shape == signal.shape
    assert metrics.snr(signal, recovered) > 30


def test_audio_block_size_must_be_power_of_two(client, signal):
    response = client.post("/api/audio/encrypt",
                           files={"file": ("in.wav", wav_bytes(signal), "audio/wav")},
                           data={"passphrase": PASSPHRASE, "block_size": 3000})
    assert response.status_code == 400
    assert "power of two" in response.json()["detail"]


def test_container_kind_is_enforced(client, image, signal):
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image), "image/png")},
                            data={"passphrase": PASSPHRASE})
    response = client.post("/api/audio/decrypt",
                           files={"file": ("cipher.npz", encrypted.content)},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400
    assert "expected a audio container" in response.json()["detail"]


def test_spectrum_of_image(client, image):
    response = client.post("/api/image/spectrum",
                           files={"file": ("in.png", png_bytes(image), "image/png")})
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"


def test_spectrum_of_ciphertext_is_noise(client, image):
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image), "image/png")},
                            data={"passphrase": PASSPHRASE})
    response = client.post("/api/image/spectrum",
                           files={"file": ("cipher.npz", encrypted.content)})
    assert response.status_code == 200
    assert abs(metrics.normalized_correlation(image, read_png(response.content))) < 0.2


@pytest.mark.parametrize("kind", ["low", "high"])
def test_filter(client, image, kind):
    response = client.post("/api/image/filter",
                           files={"file": ("in.png", png_bytes(image), "image/png")},
                           data={"kind": kind, "cutoff": 0.2})
    assert response.status_code == 200
    assert read_png(response.content).shape == image.shape


def test_filter_rejects_unknown_kind(client, image):
    response = client.post("/api/image/filter",
                           files={"file": ("in.png", png_bytes(image), "image/png")},
                           data={"kind": "sideways"})
    assert response.status_code == 400
    assert "kind must be" in response.json()["detail"]


def test_band_pass_requires_ordered_cutoffs(client, image):
    response = client.post("/api/image/filter",
                           files={"file": ("in.png", png_bytes(image), "image/png")},
                           data={"kind": "band", "cutoff": 0.4, "high_cutoff": 0.2})
    assert response.status_code == 400


def test_watermark_embed_and_extract(client, image):
    mark = np.zeros((16, 16))
    mark[4:12, 4:12] = 1.0

    embedded = client.post(
        "/api/image/watermark/embed",
        files={"file": ("in.png", png_bytes(image), "image/png"),
               "watermark_file": ("mark.png", png_bytes(mark[None, :, :]), "image/png")},
        data={"strength": 0.3})
    assert embedded.status_code == 200

    extracted = client.post(
        "/api/image/watermark/extract",
        files={"original": ("in.png", png_bytes(image), "image/png"),
               "marked": ("marked.png", embedded.content, "image/png")},
        data={"height": 16, "width": 16, "strength": 0.3})
    assert extracted.status_code == 200

    recovered = read_png(extracted.content)[0]
    assert metrics.normalized_correlation(mark, recovered) > 0.9


def test_watermark_extract_rejects_mismatched_sizes(client, image):
    small = np.zeros((1, 32, 32))
    response = client.post(
        "/api/image/watermark/extract",
        files={"original": ("a.png", png_bytes(image), "image/png"),
               "marked": ("b.png", png_bytes(small), "image/png")},
        data={"height": 8, "width": 8})
    assert response.status_code == 400
    assert "same dimensions" in response.json()["detail"]


def test_oversized_watermark_rejected(client, image):
    big = np.ones((1, 60, 60))
    response = client.post(
        "/api/image/watermark/embed",
        files={"file": ("in.png", png_bytes(image), "image/png"),
               "watermark_file": ("mark.png", png_bytes(big), "image/png")},
        data={"strength": 0.2})
    assert response.status_code == 400
    assert "too large" in response.json()["detail"]


def test_denoise_and_enhance(client):
    rng = np.random.default_rng(0)
    t = np.linspace(0, 1.0, 16000, endpoint=False)
    noisy = (0.3 * np.sin(2 * np.pi * 300 * t) + rng.normal(scale=0.05, size=len(t)))[None, :]

    denoised = client.post("/api/audio/denoise",
                           files={"file": ("noisy.wav", wav_bytes(noisy), "audio/wav")})
    assert denoised.status_code == 200

    enhanced = client.post("/api/audio/enhance",
                           files={"file": ("clean.wav", denoised.content, "audio/wav")})
    assert enhanced.status_code == 200
    assert read_wav(enhanced.content).shape[1] == noisy.shape[1]


def test_denoise_rejects_bad_parameters(client, signal):
    response = client.post("/api/audio/denoise",
                           files={"file": ("in.wav", wav_bytes(signal), "audio/wav")},
                           data={"over_subtraction": 0.1})
    assert response.status_code == 400


def test_attack_report(client, image):
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image), "image/png")},
                            data={"passphrase": PASSPHRASE})
    response = client.post(
        "/api/analysis/attack-report",
        files={"ciphertext": ("cipher.npz", encrypted.content),
               "original": ("in.png", png_bytes(image), "image/png")},
        data={"passphrase": PASSPHRASE})

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "image"
    assert "noise_5pct" in body["report"]
    # Infinities must be serialized as strings, not bare JSON constants.
    json.loads(response.text, parse_constant=lambda c: pytest.fail(f"bad constant {c}"))


def test_attack_report_on_audio(client, signal):
    encrypted = client.post("/api/audio/encrypt",
                            files={"file": ("in.wav", wav_bytes(signal), "audio/wav")},
                            data={"passphrase": PASSPHRASE})
    response = client.post(
        "/api/analysis/attack-report",
        files={"ciphertext": ("cipher.npz", encrypted.content),
               "original": ("in.wav", wav_bytes(signal), "audio/wav")},
        data={"passphrase": PASSPHRASE})

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "audio"
    assert "snr_db" in body["report"]["none"]


def test_kpa_demo(client):
    response = client.post("/api/analysis/kpa-demo", json={"size": 32})
    assert response.status_code == 200
    body = response.json()
    assert body["probes_used"] == 2
    assert body["correlation"] > 0.999
    assert body["max_absolute_error"] < 1e-8


def test_kpa_demo_rejects_non_power_of_two(client):
    assert client.post("/api/analysis/kpa-demo", json={"size": 33}).status_code == 400


def test_kpa_demo_rejects_out_of_range_size(client):
    assert client.post("/api/analysis/kpa-demo", json={"size": 4096}).status_code == 422


def test_empty_upload_rejected(client):
    response = client.post("/api/image/spectrum", files={"file": ("empty.png", b"")})
    assert response.status_code == 400


def test_non_image_upload_rejected(client):
    response = client.post("/api/image/spectrum",
                           files={"file": ("notes.txt", b"this is not an image")})
    assert response.status_code == 400
    assert "image" in response.json()["detail"]


def test_oversized_image_rejected(client):
    big = np.zeros((1, 1200, 1200))
    response = client.post("/api/image/spectrum",
                           files={"file": ("big.png", png_bytes(big), "image/png")})
    assert response.status_code == 413
    assert "limit" in response.json()["detail"]


def test_corrupt_container_rejected(client):
    response = client.post("/api/image/decrypt",
                           files={"file": ("cipher.npz", b"not a zip at all")},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400
    assert "container" in response.json()["detail"]


def test_foreign_npz_rejected(client):
    buffer = io.BytesIO()
    np.savez(buffer, unrelated=np.zeros(4))
    response = client.post("/api/image/decrypt",
                           files={"file": ("cipher.npz", buffer.getvalue())},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400


def test_zip_bomb_rejected(client, monkeypatch):
    """A small archive that expands hugely is refused before it is decompressed.

    The real threshold is lowered rather than building a genuine multi-gigabyte
    bomb, so this exercises the actual guard cheaply.
    """
    monkeypatch.setattr(support, "MAX_DECOMPRESSED_BYTES", 1024 * 1024)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("data.npy", b"\0" * (4 * 1024 * 1024))
    payload = buffer.getvalue()

    assert len(payload) < 64 * 1024  # tiny on the wire, large once expanded

    response = client.post("/api/image/decrypt",
                           files={"file": ("bomb.npz", payload)},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 413
    assert "expands" in response.json()["detail"]


def test_passphrase_is_required(client, image):
    response = client.post("/api/image/encrypt",
                           files={"file": ("in.png", png_bytes(image), "image/png")})
    assert response.status_code == 422


def test_cors_headers_present(client, image):
    response = client.post("/api/image/spectrum",
                           files={"file": ("in.png", png_bytes(image), "image/png")},
                           headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "Content-Disposition" in response.headers["access-control-expose-headers"]
