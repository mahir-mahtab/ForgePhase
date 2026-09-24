"""The single transform seam for the whole project.

Every module calls these functions rather than ``numpy.fft`` directly, so the
normalization contract lives in one place:
    forward  X[k] = sum_n x[n] * exp(-2j*pi*k*n/N)          (unnormalized)
    inverse  x[n] = (1/N) * sum_k X[k] * exp(+2j*pi*k*n/N)  (scaled by 1/N)

This is NumPy's default ("backward") normalization.
"""

import numpy as np


def fft(x, axis=-1):
    return np.fft.fft(np.asarray(x), axis=axis)


def ifft(x, axis=-1):
    return np.fft.ifft(np.asarray(x), axis=axis)


def fft2(x):
    return np.fft.fft2(np.asarray(x), axes=(-2, -1))


def ifft2(x):
    return np.fft.ifft2(np.asarray(x), axes=(-2, -1))


def fftshift(x, axes=None):
    """Move the zero-frequency component to the centre of the spectrum."""
    return np.fft.fftshift(np.asarray(x), axes=axes)


def ifftshift(x, axes=None):
    """Inverse of :func:`fftshift`."""
    return np.fft.ifftshift(np.asarray(x), axes=axes)


def fftfreq(n, d=1.0):
    """Frequency bin centres for an ``n``-point transform, in cycles per unit."""
    return np.fft.fftfreq(n, d=d)
