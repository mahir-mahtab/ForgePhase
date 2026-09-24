"""HTTP contract for the single noise-PNG image cipher workflow."""

import io

import numpy as np
import pytest
from fastapi.testclient import TestClient

from phaseforge.analysis import metrics
from phaseforge.api.app import create_app
from phaseforge.io import image_io


def _png(array):
    buffer = io.BytesIO()
    image_io.save_image(buffer, array, format="PNG")
    return buffer.getvalue()


def _source():
    y, x = np.mgrid[0:17, 0:19] / 17
    return np.stack([x, y, np.full_like(x, 0.5)])


def _encrypt(client, image):
    response = client.post(
        "/api/image/encrypt",
        files={"file": ("source.png", _png(image), "image/png")},
        data={"passphrase": "cipher test"},
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    return response.content


def test_encrypt_returns_one_png_that_decrypts_with_the_passphrase():
    image = _source()
    with TestClient(create_app()) as client:
        cipher = _encrypt(client, image)
        decrypted = client.post(
            "/api/image/decrypt",
            files={"file": ("cipher.png", cipher, "image/png")},
            data={"passphrase": "cipher test"},
        )
    assert decrypted.status_code == 200
    assert metrics.psnr(image, image_io.load_image(io.BytesIO(decrypted.content))[0]) > 40


def test_decrypt_requires_the_cipher_file():
    with TestClient(create_app()) as client:
        missing = client.post("/api/image/decrypt", data={"passphrase": "cipher test"})
    assert missing.status_code == 422


def test_spectrum_and_attack_report_accept_the_cipher_png():
    image = _source()
    with TestClient(create_app()) as client:
        cipher = _encrypt(client, image)
        spectrum = client.post(
            "/api/image/spectrum",
            files={"file": ("cipher.png", cipher, "image/png")},
        )
        report = client.post(
            "/api/analysis/attack-report",
            files={
                "ciphertext": ("cipher.png", cipher, "image/png"),
                "original": ("source.png", _png(image), "image/png"),
            },
            data={"passphrase": "cipher test"},
        )
    assert spectrum.status_code == 200
    assert spectrum.headers["content-type"] == "image/png"
    assert report.status_code == 200
    assert report.json()["kind"] == "image"
