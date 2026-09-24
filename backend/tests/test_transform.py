"""Transform conformance: the normalization contract in ``core.transform``."""

import numpy as np

from phaseforge.core import transform


def naive_dft(x):
    """Direct O(N^2) evaluation of the definition, as an independent reference."""
    x = np.asarray(x, dtype=complex)
    n = len(x)
    k = np.arange(n)
    return np.array([np.sum(x * np.exp(-2j * np.pi * k * i / n)) for i in range(n)])


def test_matches_definition():
    rng = np.random.default_rng(0)
    x = rng.normal(size=16)
    assert np.allclose(transform.fft(x), naive_dft(x))


def test_round_trip_1d():
    rng = np.random.default_rng(1)
    x = rng.normal(size=256)
    assert np.allclose(transform.ifft(transform.fft(x)), x)


def test_round_trip_2d():
    rng = np.random.default_rng(2)
    x = rng.normal(size=(32, 64))
    assert np.allclose(transform.ifft2(transform.fft2(x)), x)


def test_linearity():
    rng = np.random.default_rng(3)
    a, b = rng.normal(size=64), rng.normal(size=64)
    combined = transform.fft(2.0 * a + 3.0 * b)
    separate = 2.0 * transform.fft(a) + 3.0 * transform.fft(b)
    assert np.allclose(combined, separate)


def test_parseval():
    rng = np.random.default_rng(4)
    x = rng.normal(size=128)
    spectrum = transform.fft(x)
    assert np.isclose(np.sum(np.abs(x) ** 2), np.sum(np.abs(spectrum) ** 2) / len(x))


def test_normalization_contract():
    """Forward is unnormalized: the DC bin is the plain sum of the samples."""
    x = np.arange(8, dtype=float)
    assert np.isclose(transform.fft(x)[0], x.sum())


def test_2d_is_separable():
    rng = np.random.default_rng(5)
    x = rng.normal(size=(16, 32))
    rows_then_cols = transform.fft(transform.fft(x, axis=-1), axis=-2)
    assert np.allclose(transform.fft2(x), rows_then_cols)


def test_batched_leading_axis():
    """Modules pass (channels, h, w) arrays, so batch axes must be respected."""
    rng = np.random.default_rng(6)
    x = rng.normal(size=(3, 16, 16))
    batched = transform.fft2(x)
    for channel in range(3):
        assert np.allclose(batched[channel], transform.fft2(x[channel]))


def test_fftshift_round_trip():
    rng = np.random.default_rng(7)
    x = rng.normal(size=(15, 8))
    assert np.array_equal(transform.ifftshift(transform.fftshift(x)), x)


def test_fftshift_moves_dc_to_centre():
    x = np.zeros((8, 8))
    x[0, 0] = 1.0
    assert transform.fftshift(x)[4, 4] == 1.0


def test_fftfreq_matches_numpy():
    assert np.allclose(transform.fftfreq(16, d=0.5), np.fft.fftfreq(16, d=0.5))
