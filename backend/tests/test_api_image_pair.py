"""HTTP contract for the image real/imaginary PNG workflow."""

import io
import zipfile

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


def _pair(client, image, backend="numpy"):
    response = client.post(
        "/api/image/encrypt",
        files={"file": ("source.png", _png(image), "image/png")},
        data={"passphrase": "pair test", "backend": backend},
    )
    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        return archive.read("cipher-real.png"), archive.read("cipher-imaginary.png")


@pytest.mark.parametrize("backend", ["numpy", "custom"])
def test_encrypt_returns_two_png_components_and_decrypts(backend):
    image = _source()
    with TestClient(create_app()) as client:
        real, imaginary = _pair(client, image, backend)
        decrypted = client.post(
            "/api/image/decrypt",
            files={
                "real_file": ("cipher-real.png", real, "image/png"),
                "imaginary_file": ("cipher-imaginary.png", imaginary, "image/png"),
            },
            data={"passphrase": "pair test", "backend": backend},
        )
    assert decrypted.status_code == 200
    assert metrics.psnr(image, image_io.load_image(io.BytesIO(decrypted.content))[0]) > 40


def test_pair_endpoints_reject_incomplete_or_mismatched_inputs():
    image = _source()
    with TestClient(create_app()) as client:
        real, imaginary = _pair(client, image)
        incomplete = client.post(
            "/api/image/decrypt",
            files={"real_file": ("real.png", real, "image/png")},
            data={"passphrase": "pair test"},
        )
        mismatch_response = client.post(
            "/api/image/decrypt",
            files={
                "real_file": ("real.png", real, "image/png"),
                "imaginary_file": ("imaginary.png", real, "image/png"),
            },
            data={"passphrase": "pair test"},
        )
    assert incomplete.status_code == 422
    assert mismatch_response.status_code == 400


def test_spectrum_and_attack_report_accept_a_pair():
    image = _source()
    with TestClient(create_app()) as client:
        real, imaginary = _pair(client, image)
        spectrum = client.post(
            "/api/image/spectrum",
            files={
                "real_file": ("real.png", real, "image/png"),
                "imaginary_file": ("imaginary.png", imaginary, "image/png"),
            },
        )
        report = client.post(
            "/api/analysis/attack-report",
            files={
                "real_file": ("real.png", real, "image/png"),
                "imaginary_file": ("imaginary.png", imaginary, "image/png"),
                "original": ("source.png", _png(image), "image/png"),
            },
            data={"passphrase": "pair test"},
        )
    assert spectrum.status_code == 200
    assert spectrum.headers["content-type"] == "image/png"
    assert report.status_code == 200
    assert report.json()["kind"] == "image"
