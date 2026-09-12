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

Lengths are guaranteed to be powers of two -- ``core.padding`` enforces this
project-wide precisely so a radix-2 Cooley-Tukey implementation is sufficient
and neither mixed-radix nor Bluestein is needed.

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
    """Apply a radix-2 Cooley--Tukey transform along one named axis."""
    values = np.asarray(x, dtype=complex)
    moved = np.moveaxis(values, axis, -1)
    result = _radix2(moved, sign)
    if inverse:
        result = result / moved.shape[-1]
    return np.moveaxis(result, -1, axis)


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
