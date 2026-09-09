"""Image loading and saving.

Images are held internally as float64 in ``[0, 1]`` with shape ``(channels,
height, width)`` -- channels first, and always present even for greyscale. That
single convention lets ``fft2`` (which acts on the last two axes) process every
channel in one batched call.
"""

import numpy as np
from PIL import Image


def load_image(path, greyscale=False):
    """Return ``(array, mode)`` with array shaped ``(channels, height, width)``."""
    img = Image.open(path)
    if greyscale:
        img = img.convert("L")
    elif img.mode not in ("L", "RGB"):
        img = img.convert("RGB")

    data = np.asarray(img, dtype=np.float64) / 255.0
    if data.ndim == 2:
        data = data[None, :, :]
    else:
        data = np.moveaxis(data, -1, 0)
    return data, img.mode


def save_image(path, data, mode=None, format=None):
    """Write a ``(channels, height, width)`` float array in ``[0, 1]``.

    ``path`` may be a filename or a binary file object; the latter needs an
    explicit ``format`` since there is no extension to infer one from.
    """
    data = np.asarray(data)
    if data.ndim == 2:
        data = data[None, :, :]

    pixels = to_uint8(data)
    if pixels.shape[0] == 1:
        img = Image.fromarray(pixels[0], mode="L")
    else:
        img = Image.fromarray(np.moveaxis(pixels, 0, -1), mode="RGB")

    if mode is not None and img.mode != mode:
        img = img.convert(mode)
    img.save(path, format=format)


def to_uint8(data):
    """Clip to ``[0, 1]`` and quantize to 8-bit."""
    return np.round(np.clip(np.asarray(data), 0.0, 1.0) * 255.0).astype(np.uint8)


def normalize(data):
    """Rescale arbitrary real data to ``[0, 1]`` for display."""
    data = np.asarray(data, dtype=np.float64)
    low, high = float(data.min()), float(data.max())
    if high - low < 1e-12:
        return np.zeros_like(data)
    return (data - low) / (high - low)
