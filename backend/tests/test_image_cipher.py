"""Real/imaginary PNG ciphertext codec tests."""

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


def test_round_trip_grayscale_and_colour_components():
    for shape in ((1, 7, 9), (3, 8, 10)):
        rng = np.random.default_rng(4)
        ciphertext = rng.normal(size=shape) + 1j * rng.normal(size=shape)
        real_png, imaginary_png = image_cipher.encode_pair(ciphertext, _metadata(shape))

        recovered, metadata = image_cipher.decode_pair(real_png, imaginary_png)

        assert recovered.shape == shape
        assert metadata["salt"] == b"0123456789abcdef"
        assert np.max(np.abs(recovered - ciphertext)) < 1e-4


def test_constant_component_round_trips():
    shape = (1, 4, 5)
    ciphertext = np.full(shape, 2.5 + 0j)
    real_png, imaginary_png = image_cipher.encode_pair(ciphertext, _metadata(shape))
    recovered, _ = image_cipher.decode_pair(real_png, imaginary_png)
    np.testing.assert_allclose(recovered, ciphertext)


def test_png_is_16_bit_and_contains_metadata():
    shape = (1, 3, 4)
    real_png, _ = image_cipher.encode_pair(np.ones(shape, complex), _metadata(shape))
    with Image.open(io.BytesIO(real_png)) as image:
        assert image.format == "PNG"
        assert image.mode == "I;16"
        assert "phaseforge" in image.info


def test_mismatched_pair_is_rejected():
    shape = (1, 4, 4)
    real_png, imaginary_png = image_cipher.encode_pair(
        np.ones(shape, complex), _metadata(shape))
    other_real, _ = image_cipher.encode_pair(
        np.ones(shape, complex), _metadata(shape))
    with pytest.raises(ValueError, match="metadata mismatch"):
        image_cipher.decode_pair(other_real, imaginary_png)


def test_duplicate_component_is_rejected():
    shape = (1, 4, 4)
    real_png, _ = image_cipher.encode_pair(np.ones(shape, complex), _metadata(shape))
    with pytest.raises(ValueError, match="expected imaginary"):
        image_cipher.decode_pair(real_png, real_png)


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


def test_pair_component_is_not_a_single_cipher():
    shape = (1, 4, 4)
    real_png, _ = image_cipher.encode_pair(np.ones(shape, complex), _metadata(shape))
    with pytest.raises(ValueError, match="expected complex"):
        image_cipher.decode(real_png)
