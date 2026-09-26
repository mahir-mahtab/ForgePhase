"""Frequency-domain image watermarking.

A watermark is written into a mid-frequency block of the magnitude spectrum:
high enough that it is invisible in the image, low enough that it survives mild
filtering and compression.

The one non-obvious constraint is Hermitian symmetry. A real image has a
spectrum where bin ``(i, j)`` is the conjugate of its mirror bin; perturbing one
without the other yields a complex "image" whose real part no longer contains
the full watermark. Every modification here is therefore mirrored, which keeps
the reconstruction exactly real and makes extraction lossless.

Extraction is non-blind: it compares the watermarked spectrum against the
original's.
"""

import numpy as np

from ..core import transform


def _as_channel_first(image):
    image = np.asarray(image, dtype=np.float64)
    return image[None, :, :] if image.ndim == 2 else image


def _mirror(field):
    """Map each bin onto its Hermitian partner ``(-i, -j)``."""
    return np.roll(field[..., ::-1, ::-1], shift=(1, 1), axis=(-2, -1))


def block_slice(image_shape, watermark_shape, position=0.25):
    """Where the watermark block sits in the shifted spectrum.

    Placed directly above DC by a fraction ``position`` of the height, so the
    block and its mirror (below DC) never overlap.
    """
    height, width = image_shape[-2:]
    wm_h, wm_w = watermark_shape[-2:]
    if wm_h >= height // 2 or wm_w >= width:
        raise ValueError(f"watermark {watermark_shape} too large for image {image_shape}")

    row = height // 2 - int(position * height) - wm_h // 2
    col = width // 2 - wm_w // 2
    if row < 1:
        raise ValueError(f"position {position} places the watermark outside the spectrum")
    return (slice(row, row + wm_h), slice(col, col + wm_w))

def embed(image, watermark, strength=0.15, position=0.25):
    image = _as_channel_first(image)
    watermark = np.asarray(watermark, dtype=np.float64)

    if watermark.ndim != 2:
        raise ValueError("watermark must be grayscale")

    region = block_slice(image.shape, watermark.shape, position)

    spectrum = transform.fftshift(transform.fft2(image), axes=(-2, -1))

    delta = np.zeros_like(spectrum, dtype=np.float64)
    delta[(..., *region)] = watermark
    delta += _mirror(delta)

    scale = strength * np.mean(np.abs(spectrum), axis=(-2, -1), keepdims=True)

    marked = (
        np.abs(spectrum) + scale * delta
    ) * np.exp(1j * np.angle(spectrum))

    output = np.real(
        transform.ifft2(
            transform.ifftshift(marked, axes=(-2, -1))
        )
    )

    return np.clip(output, 0, 1)


def extract(original, watermarked, watermark_shape, strength=0.15, position=0.25):
    """Recover the embedded watermark by differencing the two spectra."""
    original = _as_channel_first(original)
    watermarked = _as_channel_first(watermarked)
    region = block_slice(original.shape, watermark_shape, position)

    spectrum = transform.fftshift(transform.fft2(original), axes=(-2, -1))
    marked = transform.fftshift(transform.fft2(watermarked), axes=(-2, -1))

    scale = strength * np.mean(np.abs(spectrum), axis=(-2, -1), keepdims=True)
    difference = (np.abs(marked) - np.abs(spectrum)) / scale
    return np.mean(difference[(..., *region)], axis=0)
