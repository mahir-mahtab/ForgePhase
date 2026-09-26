"""NumPy-backed DFT implementation.

Reference backend. Conforms to the normalization contract in ``core.transform``:
forward unnormalized, inverse scaled by 1/N.
"""

import numpy as np

NAME = "numpy"


def fft(x, axis=-1):
    return np.fft.fft(x, axis=axis)


def ifft(x, axis=-1):
    return np.fft.ifft(x, axis=axis)


def fft2(x):
    return np.fft.fft2(x, axes=(-2, -1))


def ifft2(x):
    return np.fft.ifft2(x, axes=(-2, -1))
