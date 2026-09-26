"""Backend conformance.

Every test here runs against every registered backend. A backend that is not
implemented yet is skipped, so the day the hand-written FFT lands these tests
validate it against the NumPy reference with nothing new to write.
"""

import numpy as np
import pytest

from phaseforge.core import transform


@pytest.fixture(params=transform.available_backends())
def backend(request):
    name = request.param
    with transform.using_backend(name):
        try:
            transform.fft(np.zeros(4))
        except NotImplementedError:
            pytest.skip(f"backend {name!r} is not implemented yet")
        yield name


def naive_dft(x):
    """Direct O(N^2) evaluation of the definition, as an independent reference."""
    x = np.asarray(x, dtype=complex)
    n = len(x)
    k = np.arange(n)
    return np.array([np.sum(x * np.exp(-2j * np.pi * k * i / n)) for i in range(n)])


def test_matches_definition(backend):
    rng = np.random.default_rng(0)
    x = rng.normal(size=16)
    with transform.using_backend(backend):
        assert np.allclose(transform.fft(x), naive_dft(x))


def test_round_trip_1d(backend):
    rng = np.random.default_rng(1)
    x = rng.normal(size=256)
    with transform.using_backend(backend):
        assert np.allclose(transform.ifft(transform.fft(x)), x)


def test_round_trip_2d(backend):
    rng = np.random.default_rng(2)
    x = rng.normal(size=(32, 64))
    with transform.using_backend(backend):
        assert np.allclose(transform.ifft2(transform.fft2(x)), x)


def test_linearity(backend):
    rng = np.random.default_rng(3)
    a, b = rng.normal(size=64), rng.normal(size=64)
    with transform.using_backend(backend):
        combined = transform.fft(2.0 * a + 3.0 * b)
        separate = 2.0 * transform.fft(a) + 3.0 * transform.fft(b)
    assert np.allclose(combined, separate)


def test_parseval(backend):
    rng = np.random.default_rng(4)
    x = rng.normal(size=128)
    with transform.using_backend(backend):
        spectrum = transform.fft(x)
    assert np.isclose(np.sum(np.abs(x) ** 2), np.sum(np.abs(spectrum) ** 2) / len(x))


def test_normalization_contract(backend):
    """Forward is unnormalized: the DC bin is the plain sum of the samples."""
    x = np.arange(8, dtype=float)
    with transform.using_backend(backend):
        assert np.isclose(transform.fft(x)[0], x.sum())


def test_2d_is_separable(backend):
    rng = np.random.default_rng(5)
    x = rng.normal(size=(16, 32))
    with transform.using_backend(backend):
        rows_then_cols = transform.fft(transform.fft(x, axis=-1), axis=-2)
        assert np.allclose(transform.fft2(x), rows_then_cols)


def test_batched_leading_axis(backend):
    """Modules pass (channels, h, w) arrays, so batch axes must be respected."""
    rng = np.random.default_rng(6)
    x = rng.normal(size=(3, 16, 16))
    with transform.using_backend(backend):
        batched = transform.fft2(x)
        for channel in range(3):
            assert np.allclose(batched[channel], transform.fft2(x[channel]))


def test_backend_switching_is_scoped():
    original = transform.get_backend()
    with transform.using_backend("custom"):
        assert transform.get_backend() == "custom"
    assert transform.get_backend() == original


def test_unknown_backend_rejected():
    with pytest.raises(ValueError, match="unknown backend"):
        transform.set_backend("does-not-exist")


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
