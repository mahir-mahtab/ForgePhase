"""Padding and framing."""

import numpy as np
import pytest

from phaseforge.core import framing, padding


def test_next_power_of_two():
    assert padding.next_power_of_two(1) == 1
    assert padding.next_power_of_two(5) == 8
    assert padding.next_power_of_two(64) == 64
    assert padding.next_power_of_two(65) == 128


def test_pad_unpad_round_trip():
    rng = np.random.default_rng(0)
    image = rng.random((3, 100, 70))
    padded, shape = padding.pad_to_power_of_two(image)
    assert padded.shape == (3, 128, 128)
    assert np.array_equal(padding.unpad(padded, shape), image)


def test_pad_leaves_power_of_two_untouched():
    image = np.ones((1, 64, 32))
    padded, shape = padding.pad_to_power_of_two(image)
    assert padded.shape == image.shape
    assert shape == image.shape


@pytest.mark.parametrize("length", [1000, 4096, 7777])
def test_stft_istft_round_trip(length):
    rng = np.random.default_rng(1)
    signal = rng.normal(size=length) * 0.1
    spectra, meta = framing.stft(signal)
    assert np.allclose(framing.istft(spectra, meta), signal)


def test_stft_rejects_non_power_of_two_frame():
    with pytest.raises(ValueError, match="power of two"):
        framing.stft(np.zeros(500), frame_length=1000)


def test_hann_is_periodic():
    window = framing.hann(8)
    assert window[0] == 0.0
    assert np.isclose(window[4], 1.0)
