"""HTTP layer: uploads in, files out, limits enforced."""

import io
import json

import numpy as np
import pytest
from PIL import Image
from fastapi.testclient import TestClient

from phaseforge.analysis import metrics
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
    assert body["limits"]["max_image_pixels"] > 0
    assert body["defaults"]["audio_block_size"] == 4096
    assert "gaussian" in body["defaults"]["filter_shapes"]


def test_image_encrypt_decrypt_round_trip(client, image):
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image), "image/png")},
                            data={"passphrase": PASSPHRASE})
    assert encrypted.status_code == 200
    assert encrypted.headers["content-type"] == "image/png"
    assert "cipher.png" in encrypted.headers["content-disposition"]
    # The ciphertext itself is one ordinary-looking PNG with no trace of the image.
    assert abs(metrics.normalized_correlation(
        image[0], image_io.load_image(io.BytesIO(encrypted.content))[0][0, :64, :64])) < 0.1

    decrypted = client.post("/api/image/decrypt",
                            files={"file": ("cipher.png", encrypted.content)},
                            data={"passphrase": PASSPHRASE})
    assert decrypted.status_code == 200
    assert metrics.psnr(image, read_png(decrypted.content)) > 40


def test_image_wrong_passphrase_returns_noise(client, image):
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image), "image/png")},
                            data={"passphrase": PASSPHRASE})
    decrypted = client.post("/api/image/decrypt",
                            files={"file": ("cipher.png", encrypted.content)},
                            data={"passphrase": "the wrong one"})

    assert decrypted.status_code == 200  # DRPE has no integrity check to fail on
    assert abs(metrics.normalized_correlation(image, read_png(decrypted.content))) < 0.1


def test_audio_encrypt_decrypt_round_trip(client, signal):
    encrypted = client.post("/api/audio/encrypt",
                            files={"file": ("in.wav", wav_bytes(signal), "audio/wav")},
                            data={"passphrase": PASSPHRASE})
    assert encrypted.status_code == 200
    assert encrypted.headers["content-type"] == "audio/wav"
    assert "cipher.wav" in encrypted.headers["content-disposition"]
    # The cipher is itself a playable WAV that sounds like noise.
    noise = read_wav(encrypted.content)
    assert noise.shape[0] == signal.shape[0]
    assert abs(metrics.normalized_correlation(signal, noise[:, :signal.shape[1]])) < 0.1

    decrypted = client.post("/api/audio/decrypt",
                            files={"file": ("cipher.wav", encrypted.content)},
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
                           files={"file": ("cipher.png", encrypted.content)},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400
    assert "cipher WAV" in response.json()["detail"]


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
    mark = np.zeros((16, 16))  # a quarter of the 64 x 64 image: no resizing
    mark[4:12, 4:12] = 1.0

    embedded = client.post(
        "/api/image/watermark/embed",
        files={"file": ("in.png", png_bytes(image), "image/png"),
               "watermark_file": ("mark.png", png_bytes(mark[None, :, :]), "image/png")})
    assert embedded.status_code == 200

    extracted = client.post(
        "/api/image/watermark/extract",
        files={"original": ("in.png", png_bytes(image), "image/png"),
               "marked": ("marked.png", embedded.content, "image/png")})
    assert extracted.status_code == 200

    recovered = read_png(extracted.content)
    assert recovered.shape == (3, 16, 16)
    assert metrics.normalized_correlation(mark, recovered.mean(axis=0)) > 0.9


def test_watermark_keeps_colour(client, image):
    mark = np.zeros((3, 16, 16))
    mark[0, 4:12, 4:12] = 1.0  # a red square
    mark[2, :, :8] = 1.0       # a blue left half

    embedded = client.post(
        "/api/image/watermark/embed",
        files={"file": ("in.png", png_bytes(image), "image/png"),
               "watermark_file": ("mark.png", png_bytes(mark), "image/png")})
    assert embedded.status_code == 200

    extracted = client.post(
        "/api/image/watermark/extract",
        files={"original": ("in.png", png_bytes(image), "image/png"),
               "marked": ("marked.png", embedded.content, "image/png")})
    assert extracted.status_code == 200

    recovered = read_png(extracted.content)
    assert recovered.shape == (3, 16, 16)
    for channel in (0, 2):
        assert metrics.normalized_correlation(mark[channel], recovered[channel]) > 0.9


def test_watermark_extract_rejects_mismatched_sizes(client, image):
    small = np.zeros((1, 32, 32))
    response = client.post(
        "/api/image/watermark/extract",
        files={"original": ("a.png", png_bytes(image), "image/png"),
               "marked": ("b.png", png_bytes(small), "image/png")})
    assert response.status_code == 400
    assert "same dimensions" in response.json()["detail"]


def test_large_watermark_is_resized(client, image):
    big = np.ones((1, 300, 200))
    response = client.post(
        "/api/image/watermark/embed",
        files={"file": ("in.png", png_bytes(image), "image/png"),
               "watermark_file": ("mark.png", png_bytes(big), "image/png")})
    assert response.status_code == 200
    assert read_png(response.content).shape == image.shape


def test_audio_watermark_embed_and_extract(client, signal):
    t = np.arange(1500) / 16000
    clip = (0.6 * np.sin(2 * np.pi * 500 * t))[None, :]

    embedded = client.post(
        "/api/audio/watermark/embed",
        files={"file": ("in.wav", wav_bytes(signal), "audio/wav"),
               "watermark_file": ("mark.wav", wav_bytes(clip), "audio/wav")})
    assert embedded.status_code == 200

    extracted = client.post(
        "/api/audio/watermark/extract",
        files={"original": ("in.wav", wav_bytes(signal), "audio/wav"),
               "marked": ("marked.wav", embedded.content, "audio/wav")})
    assert extracted.status_code == 200

    recovered = read_wav(extracted.content)[0]
    n = min(recovered.size, clip.shape[-1])
    assert metrics.normalized_correlation(clip[0, :n], recovered[:n]) > 0.99


def test_audio_watermark_extract_rejects_mismatch(client, signal):
    response = client.post(
        "/api/audio/watermark/extract",
        files={"original": ("a.wav", wav_bytes(signal), "audio/wav"),
               "marked": ("b.wav", wav_bytes(signal[:, :4000]), "audio/wav")})
    assert response.status_code == 400


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
                           data={"reduction_db": 0})
    assert response.status_code == 400


def test_attack_report(client, image):
    encrypted = client.post("/api/image/encrypt",
                            files={"file": ("in.png", png_bytes(image), "image/png")},
                            data={"passphrase": PASSPHRASE})
    response = client.post(
        "/api/analysis/attack-report",
        files={"ciphertext": ("cipher.png", encrypted.content),
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
        files={"ciphertext": ("cipher.wav", encrypted.content),
               "original": ("in.wav", wav_bytes(signal), "audio/wav")},
        data={"passphrase": PASSPHRASE})

    assert response.status_code == 200
    body = response.json()
    assert body["kind"] == "audio"
    assert "snr_db" in body["report"]["none"]


def test_key_reuse_demo(client):
    response = client.post("/api/analysis/key-reuse-demo", json={"size": 32})
    assert response.status_code == 200
    body = response.json()
    assert body["probes_used"] == 2
    assert body["correlation"] > 0.999
    assert body["max_absolute_error"] < 1e-8


def test_key_reuse_demo_rejects_non_power_of_two(client):
    assert client.post("/api/analysis/key-reuse-demo", json={"size": 33}).status_code == 400


def test_key_reuse_demo_rejects_out_of_range_size(client):
    assert client.post("/api/analysis/key-reuse-demo", json={"size": 4096}).status_code == 422


def test_empty_upload_rejected(client):
    response = client.post("/api/image/filter", files={"file": ("empty.png", b"")})
    assert response.status_code == 400


def test_non_image_upload_rejected(client):
    response = client.post("/api/image/filter",
                           files={"file": ("notes.txt", b"this is not an image")})
    assert response.status_code == 400
    assert "image" in response.json()["detail"]


def test_oversized_image_rejected_for_encryption(client):
    big = np.zeros((1, 1200, 1200))
    response = client.post("/api/image/encrypt",
                           files={"file": ("big.png", png_bytes(big), "image/png")},
                           data={"passphrase": "pw"})
    assert response.status_code == 413
    assert "limit" in response.json()["detail"]


def test_operations_without_padding_take_larger_images(client):
    # Over the encryption limit, but filtering does not pad to a power of two.
    tall = np.zeros((1, 2133, 1200))
    response = client.post("/api/image/filter",
                           files={"file": ("tall.png", png_bytes(tall), "image/png")})
    assert response.status_code == 200

    huge = np.zeros((1, 2100, 2100))
    response = client.post("/api/image/filter",
                           files={"file": ("huge.png", png_bytes(huge), "image/png")})
    assert response.status_code == 413


def test_corrupt_cipher_rejected(client):
    response = client.post("/api/image/decrypt",
                           files={"file": ("cipher.png", b"not a png")},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400
    assert "cipher" in response.json()["detail"] or "PNG" in response.json()["detail"]


def test_foreign_npz_rejected(client):
    buffer = io.BytesIO()
    np.savez(buffer, unrelated=np.zeros(4))
    response = client.post("/api/image/decrypt",
                           files={"file": ("foreign.png", buffer.getvalue())},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400


def test_plain_image_is_not_a_cipher(client, image):
    response = client.post("/api/image/decrypt",
                           files={"file": ("in.png", png_bytes(image))},
                           data={"passphrase": PASSPHRASE})
    assert response.status_code == 400


def test_passphrase_is_required(client, image):
    response = client.post("/api/image/encrypt",
                           files={"file": ("in.png", png_bytes(image), "image/png")})
    assert response.status_code == 422


def test_cors_headers_present(client, image):
    response = client.post("/api/image/filter",
                           files={"file": ("in.png", png_bytes(image), "image/png")},
                           headers={"Origin": "http://localhost:5173"})
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "Content-Disposition" in response.headers["access-control-expose-headers"]


def test_image_encrypt_and_decrypt_with_image_key(client, image):
    key_img = np.random.default_rng(77).random((1, 16, 16))
    key_bytes = png_bytes(key_img)

    enc_res = client.post("/api/image/encrypt",
                          files={"file": ("in.png", png_bytes(image), "image/png"),
                                 "key_file": ("key.png", key_bytes, "image/png")},
                          data={"key_mode": "image"})
    assert enc_res.status_code == 200

    dec_res = client.post("/api/image/decrypt",
                          files={"file": ("cipher.png", enc_res.content, "image/png"),
                                 "key_file": ("key.png", key_bytes, "image/png")},
                          data={"key_mode": "image"})
    assert dec_res.status_code == 200
    recovered, _ = image_io.load_image(io.BytesIO(dec_res.content))
    assert np.allclose(recovered, image, atol=1e-2)


def test_audio_encrypt_and_decrypt_with_image_key(client, signal):
    key_img = np.random.default_rng(88).random((1, 16, 16))
    key_bytes = png_bytes(key_img)

    enc_res = client.post("/api/audio/encrypt",
                          files={"file": ("in.wav", wav_bytes(signal), "audio/wav"),
                                 "key_file": ("key.png", key_bytes, "image/png")},
                          data={"key_mode": "image"})
    assert enc_res.status_code == 200

    dec_res = client.post("/api/audio/decrypt",
                          files={"file": ("cipher.wav", enc_res.content, "audio/wav"),
                                 "key_file": ("key.png", key_bytes, "image/png")},
                          data={"key_mode": "image"})
    assert dec_res.status_code == 200


def test_missing_key_file_gives_422(client, image):
    res = client.post("/api/image/encrypt",
                      files={"file": ("in.png", png_bytes(image), "image/png")},
                      data={"key_mode": "image"})
    assert res.status_code == 422



def test_unsupported_image_key_rejected(client, image):
    buffer = io.BytesIO()
    Image.fromarray(np.full((16, 16, 3), 128, np.uint8)).save(buffer, format="WEBP")
    res = client.post("/api/image/encrypt",
                      files={"file": ("in.png", png_bytes(image), "image/png"),
                             "key_file": ("key.webp", buffer.getvalue(), "image/webp")},
                      data={"key_mode": "image"})
    assert res.status_code == 400
    assert "PNG, JPEG, BMP or TIFF" in res.json()["detail"]


def test_jpeg_image_key_round_trips(client, image):
    buffer = io.BytesIO()
    Image.fromarray(np.random.default_rng(5).integers(0, 256, (16, 16, 3), np.uint8)).save(
        buffer, format="JPEG")
    key = ("key.jpg", buffer.getvalue(), "image/jpeg")
    enc = client.post("/api/image/encrypt",
                      files={"file": ("in.png", png_bytes(image), "image/png"), "key_file": key},
                      data={"key_mode": "image"})
    assert enc.status_code == 200
    dec = client.post("/api/image/decrypt",
                      files={"file": ("cipher.png", enc.content, "image/png"), "key_file": key},
                      data={"key_mode": "image"})
    assert dec.status_code == 200
    recovered, _ = image_io.load_image(io.BytesIO(dec.content))
    assert np.allclose(recovered, image, atol=1e-2)


@pytest.mark.parametrize("view", ["hybrid", "distance", "low", "high"])
def test_hybrid_views(client, image, view):
    response = client.post(
        "/api/image/hybrid",
        files={"near": ("near.png", png_bytes(image)), "far": ("far.png", png_bytes(image[::-1]))},
        data={"view": view},
    )
    assert response.status_code == 200, response.text
    result = read_png(response.content)
    if view == "distance":
        assert result.shape[-1] > image.shape[-1]
    else:
        assert result.shape == image.shape


def test_hybrid_rejects_unknown_view(client, image):
    response = client.post(
        "/api/image/hybrid",
        files={"near": ("near.png", png_bytes(image)), "far": ("far.png", png_bytes(image))},
        data={"view": "sideways"},
    )
    assert response.status_code == 400
