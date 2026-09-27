"""Frequency-domain image watermarking.

A watermark is written into a mid-frequency block of the magnitude spectrum:
high enough that it is invisible in the image, low enough that it survives mild
filtering and compression.

There are no settings to remember. The mark is resized to a block a quarter of
the image's height and width, centred in the upper half of the spectrum, and
embedded at a fixed strength -- all of which extraction can work out from the
image alone.

The one non-obvious constraint is Hermitian symmetry. A real image has a
spectrum where bin ``(i, j)`` is the conjugate of its mirror bin; perturbing one
without the other yields a complex "image" whose real part no longer contains
the full watermark. Every modification here is therefore mirrored, which keeps
the reconstruction exactly real and makes extraction lossless.

Extraction is non-blind: it compares the watermarked spectrum against the
original's. A colour image carries one mark plane per channel, so a colour
mark comes back in colour and a greyscale one comes back grey.
"""

import numpy as np
from PIL import Image

from ..core import transform

# Embedding gain. Higher survives more damage but is easier to see.
STRENGTH = 0.15


def _as_channel_first(image):
    image = np.asarray(image, dtype=np.float64)
    return image[None, :, :] if image.ndim == 2 else image


def _mirror(field):
    """Map each bin of a shifted spectrum onto its Hermitian partner ``(-i, -j)``.

    After ``fftshift`` DC sits at index ``n // 2``, so frequency ``k`` lives at
    ``k + n // 2`` and its partner ``-k`` at ``2 * (n // 2) - i``. For an even
    axis that is a reversal rolled by one; for an odd axis the reversal alone.
    """
    height, width = field.shape[-2:]
    shift = (1 - height % 2, 1 - width % 2)
    return np.roll(field[..., ::-1, ::-1], shift=shift, axis=(-2, -1))


def block_slice(image_shape):
    """Where the watermark block sits in the shifted spectrum.

    The block is a quarter of the image in each direction, centred in the rows
    strictly above DC (and, for an even height, below the self-mirrored Nyquist
    row 0), so it and its Hermitian mirror in the lower half never overlap.
    """
    height, width = image_shape[-2:]
    top = 1 if height % 2 == 0 else 0
    rows = height // 2 - top
    if rows < 1 or width < 1:
        raise ValueError(f"image {tuple(image_shape[-2:])} is too small to carry a watermark")
    block_h, block_w = max(1, height // 4), max(1, width // 4)
    row = top + (rows - block_h) // 2
    col = width // 2 - block_w // 2
    return (slice(row, row + block_h), slice(col, col + block_w))


def mark_shape(image_shape):
    """The size a watermark is resized to for an image of ``image_shape``."""
    rows, cols = block_slice(image_shape)
    return rows.stop - rows.start, cols.stop - cols.start


def _fit_mark(watermark, image_shape):
    """Resize ``watermark`` to the block and match the image's channel count."""
    planes = _as_channel_first(watermark)
    channels = image_shape[0]
    if planes.shape[0] != channels:
        planes = np.mean(planes, axis=0, keepdims=True)  # colour mark, grey image
    height, width = mark_shape(image_shape)
    if planes.shape[-2:] != (height, width):
        planes = np.stack([
            np.asarray(Image.fromarray(plane.astype(np.float32), mode="F")
                       .resize((width, height), Image.Resampling.LANCZOS), dtype=np.float64)
            for plane in planes
        ])
    return np.broadcast_to(planes, (channels, height, width))


# Target RMS pixel change, as a fraction of full scale, per unit of strength
# for a full-intensity mark. At the default strength this is under two grey
# levels: invisible, but comfortably above 8-bit rounding (1/255).
_PIXEL_CHANGE_PER_STRENGTH = 0.05


def _scale(image_shape, strength):
    """Spectral amplitude that spreads to a fixed RMS change in pixel space.

    By Parseval, ``m`` bins of amplitude ``a`` (plus their ``m`` mirrors)
    change an ``N``-pixel image by ``a * sqrt(2m) / N`` RMS. Depending only on
    the image shape, the scale is the same at embed and extract time.
    """
    height, width = mark_shape(image_shape)
    pixels = image_shape[-2] * image_shape[-1]
    return strength * _PIXEL_CHANGE_PER_STRENGTH * pixels / np.sqrt(2 * height * width)


def _usable_channels(spectrum):
    """Channels with spectral energy; an all-black plane cannot carry a mark."""
    return np.mean(np.abs(spectrum), axis=(-2, -1)) > 1e-12


def embed(image, watermark, strength=STRENGTH):
    """Embed ``watermark`` (2D or ``(channels, h, w)``, any size) into ``image``.

    Returns the watermarked image.
    """
    if not np.isfinite(strength) or strength <= 0:
        raise ValueError(f"strength must be a positive number, got {strength}")
    image = _as_channel_first(image)
    watermark = np.asarray(watermark, dtype=np.float64)
    if watermark.ndim not in (2, 3):
        raise ValueError(f"watermark must be 2D or (channels, h, w), got shape {watermark.shape}")

    region = block_slice(image.shape)
    mark = _fit_mark(watermark, image.shape)

    spectrum = transform.fftshift(transform.fft2(image), axes=(-2, -1))
    delta = np.zeros(image.shape)
    delta[(..., *region)] = mark
    delta = delta + _mirror(delta)
    delta[~_usable_channels(spectrum)] = 0.0

    magnitude = np.abs(spectrum) + _scale(image.shape, strength) * delta
    marked = magnitude * np.exp(1j * np.angle(spectrum))

    return np.real(transform.ifft2(transform.ifftshift(marked, axes=(-2, -1))))


def extract(original, watermarked, strength=STRENGTH):
    """Recover the embedded watermark by differencing the two spectra.

    Returns ``(channels, h, w)`` with :func:`mark_shape`'s size. A channel with
    no spectral energy (an all-black colour plane) cannot carry a mark; it is
    filled with the average of the others. When every channel holds the same
    mark (a greyscale one), all are replaced by their average.
    """
    original = _as_channel_first(original)
    watermarked = _as_channel_first(watermarked)
    if original.shape != watermarked.shape:
        raise ValueError(f"the images differ in size: {original.shape[1:]} vs "
                         f"{watermarked.shape[1:]}; use the original the mark was embedded in")
    region = block_slice(original.shape)

    spectrum = transform.fftshift(transform.fft2(original), axes=(-2, -1))
    marked = transform.fftshift(transform.fft2(watermarked), axes=(-2, -1))

    usable = _usable_channels(spectrum)
    if not np.any(usable):
        raise ValueError("the original image has no spectral energy to carry a watermark")

    difference = (np.abs(marked) - np.abs(spectrum))[(..., *region)] / _scale(original.shape, strength)
    mean = np.mean(difference[usable], axis=0)
    difference[~usable] = mean
    if _is_grey(difference[usable], mean):
        # Every channel carries the same mark: averaging cancels most of the
        # per-channel rounding noise, so a grey mark comes back clean.
        difference[:] = mean
    return difference


def _is_grey(planes, mean, threshold=0.95):
    """Whether every channel plane is a noisy copy of the same mark."""
    if len(planes) < 2:
        return False
    centred = mean - mean.mean()
    for plane in planes:
        plane = plane - plane.mean()
        norm = np.linalg.norm(plane) * np.linalg.norm(centred)
        if norm < 1e-12 or np.sum(plane * centred) / norm < threshold:
            return False
    return True
