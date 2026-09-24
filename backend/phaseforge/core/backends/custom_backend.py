"""Hand-written radix-2 FFT backend.

The four functions below are the only implementation-specific seam in the
project. No caller references an FFT implementation directly.

Contract every function must satisfy (see ``core.transform`` for the authority):

- ``fft(x, axis)``   forward, UNNORMALIZED:  X[k] = sum_n x[n] * exp(-2j*pi*k*n/N)
- ``ifft(x, axis)``  inverse, scaled by 1/N: x[n] = (1/N) * sum_k X[k] * exp(+2j*pi*k*n/N)
- ``fft2(x)`` / ``ifft2(x)`` operate on the last two axes. The 2D DFT is
  separable, so these may be implemented as ``fft`` along axis -1 followed by
  ``fft`` along axis -2.

Inputs may be real or complex; outputs are always complex. Inputs may carry
leading batch axes (e.g. shape ``(channels, height, width)``), so implementations
must operate along the named axis rather than assuming a 1D array.

Power-of-two lengths run through a radix-2 Cooley-Tukey transform. DRPE pads
to powers of two, but filtering, spectrum previews and watermarking work on the
image at its own size, so any other length is handled by Bluestein's algorithm,
which re-expresses an N-point DFT as a convolution evaluated with the same
radix-2 transform at a padded power-of-two length.

``tests/test_transform.py`` is parametrized over every registered backend, so
these functions are validated against the NumPy reference as soon as they exist.
"""

import numpy as np


NAME = "custom"


def fft(x, axis=-1):
    return _transform(x, axis, sign=-1.0, inverse=False)


def ifft(x, axis=-1):
    return _transform(x, axis, sign=1.0, inverse=True)


def fft2(x):
    return fft(fft(x, axis=-1), axis=-2)


def ifft2(x):
    return ifft(ifft(x, axis=-1), axis=-2)


def _transform(x, axis, sign, inverse):
    """Apply a DFT along one named axis, radix-2 where possible."""
    values = np.asarray(x, dtype=complex)
    moved = np.moveaxis(values, axis, -1)
    length = moved.shape[-1]
    if length == 0:
        return np.moveaxis(moved.copy(), -1, axis)
    if length & (length - 1):
        result = _bluestein(moved, sign)
    else:
        result = _radix2(moved, sign)
    if inverse:
        result = result / length
    return np.moveaxis(result, -1, axis)


def _bluestein(values, sign):
    """Arbitrary-length DFT as a chirp convolution (Bluestein, 1970).

    Uses ``k*n = (k^2 + n^2 - (k-n)^2) / 2`` to turn the DFT into a linear
    convolution with a chirp, which is computed exactly with power-of-two
    radix-2 transforms of length at least ``2N - 1``.
    """
    length = values.shape[-1]
    n = np.arange(length)
    # n^2 mod 2N keeps the chirp argument small, so precision does not decay
    # for long inputs.
    chirp = np.exp(sign * 1j * np.pi * ((n * n) % (2 * length)) / length)

    size = 1 << (2 * length - 2).bit_length()
    a = np.zeros(values.shape[:-1] + (size,), dtype=complex)
    a[..., :length] = values * chirp

    b = np.zeros(size, dtype=complex)
    b[:length] = np.conj(chirp)
    b[size - length + 1:] = np.conj(chirp[1:][::-1])

    spectrum = _radix2(a, -1.0) * _radix2(b, -1.0)
    convolved = _radix2(spectrum, 1.0) / size
    return convolved[..., :length] * chirp


def _radix2(values, sign):
    length = values.shape[-1]
    if length == 1:
        return values
    if length & (length - 1):
        raise ValueError(f"length must be a power of two, got {length}")

    even = _radix2(values[..., 0::2], sign)
    odd = _radix2(values[..., 1::2], sign)
    factor = np.exp(sign * 2j * np.pi * np.arange(length // 2) / length)
    twiddled = factor * odd
    return np.concatenate([even + twiddled, even - twiddled], axis=-1)
