"""Power-of-two padding.

Every transform in the project runs on power-of-two lengths so that a
hand-written radix-2 FFT is sufficient (see ``core/backends/custom_backend.py``).
"""

import numpy as np


def next_power_of_two(n):
    if n < 1:
        raise ValueError(f"length must be positive, got {n}")
    return 1 << (int(n) - 1).bit_length()


def is_power_of_two(n):
    return n >= 1 and n & (n - 1) == 0


def pad_to_power_of_two(x, axes=(-2, -1)):
    """Zero-pad ``x`` so each named axis has a power-of-two length.

    Returns ``(padded, original_shape)``; pass the original shape to
    :func:`unpad` to recover the input exactly.
    """
    x = np.asarray(x)
    pad_width = [(0, 0)] * x.ndim
    for ax in axes:
        length = x.shape[ax]
        pad_width[ax] = (0, next_power_of_two(length) - length)
    return np.pad(x, pad_width), x.shape


def unpad(x, original_shape):
    """Crop ``x`` back to ``original_shape``."""
    return x[tuple(slice(0, dim) for dim in original_shape)]
