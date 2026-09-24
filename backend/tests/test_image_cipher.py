"""Cipher PNG codec tests."""

import io

import numpy as np
import pytest
from PIL import Image

from phaseforge.io import image_cipher


def _metadata(shape=(3, 8, 10)):
    return {
        "kind": "image",
        "salt": b"0123456789abcdef",
        "iterations": 1000,
        "original_shape": list(shape),
        "padded_shape": list(shape),
        "mode": "RGB" if shape[0] == 3 else "L",
    }


def test_constant_planes_round_trip():
    shape = (1, 4, 5)
    ciphertext = np.full(shape, 2.5 + 0j)
    recovered, _ = image_cipher.decode(image_cipher.encode(ciphertext, _metadata(shape)))
    np.testing.assert_allclose(recovered, ciphertext)


def test_single_png_round_trip():
    for shape in ((1, 7, 9), (3, 8, 10)):
        rng = np.random.default_rng(5)
        ciphertext = rng.normal(size=shape) + 1j * rng.normal(size=shape)
        png = image_cipher.encode(ciphertext, _metadata(shape))

        assert image_cipher.is_cipher_png(png)
        with Image.open(io.BytesIO(png)) as image:
            assert image.mode == "I;16"
            assert image.size == (shape[2], 2 * shape[0] * shape[1])

        recovered, metadata = image_cipher.decode(png)
        assert recovered.shape == shape
        assert metadata["mode"] == _metadata(shape)["mode"]
        assert np.max(np.abs(recovered - ciphertext)) < 1e-3
