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

A mark is either greyscale (2D), written identically into every channel and
averaged back out, or colour (``channels, h, w``), each plane written into its
own channel of the carrier. Averaging makes a greyscale mark the less noisy of
the two.
"""

import numpy as np

from ..core import transform


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


def _block_row(height, wm_h, position):
    return height // 2 - int(position * height) - wm_h // 2


def position_range(image_shape, watermark_shape):
    """The closed range of ``position`` values :func:`block_slice` accepts.

    Returns ``None`` when no position fits. The block must sit strictly above
    the DC row (so it never meets its own mirror below DC) and, for an even
    height, below the self-mirrored Nyquist row 0.
    """
    height, width = image_shape[-2:]
    wm_h, wm_w = watermark_shape[-2:]
    if wm_h < 1 or wm_w < 1 or wm_w > width:
        return None
    valid = [
        offset for offset in range(height + 1)
        if _row_ok(height, wm_h, height // 2 - offset - wm_h // 2)
    ]
    if not valid:
        return None
    # int(position * height) == offset for position in [offset/h, (offset+1)/h).
    return valid[0] / height, (valid[-1] + 1) / height - 1e-9


def _row_ok(height, wm_h, row):
    top = 1 if height % 2 == 0 else 0
    return row >= top and row + wm_h <= height // 2


def block_slice(image_shape, watermark_shape, position=0.25):
    """Where the watermark block sits in the shifted spectrum.

    Placed above DC by a fraction ``position`` of the height. The block has to
    lie entirely in the upper half-plane so that it and its Hermitian mirror
    (in the lower half) never overlap -- an overlap would add the mark onto
    itself and extraction could not separate the two.
    """
    height, width = image_shape[-2:]
    wm_h, wm_w = watermark_shape[-2:]
    if not np.isfinite(position):
        raise ValueError(f"position must be finite, got {position}")

    valid = position_range(image_shape, watermark_shape)
    if valid is None:
        raise ValueError(
            f"watermark {tuple(watermark_shape)} too large for image {tuple(image_shape)}: "
            f"it must be under half the image height and no wider than the image")

    row = _block_row(height, wm_h, position)
    if not _row_ok(height, wm_h, row):
        low, high = valid
        raise ValueError(
            f"position {position} places the watermark outside the spectrum's upper half; "
            f"for this image and watermark use {low:.3f} to {high:.3f}")
    col = width // 2 - wm_w // 2
    return (slice(row, row + wm_h), slice(col, col + wm_w))


# Target RMS pixel change, as a fraction of full scale, per unit of strength
# for a full-intensity mark. At the default strength of 0.15 this is under two
# grey levels: invisible, but comfortably above 8-bit rounding (1/255), which
# a mark scaled to the spectrum's mean magnitude was not on any real-sized
# image -- saving the result as a PNG erased it.
_PIXEL_CHANGE_PER_STRENGTH = 0.05


def _scale(image_shape, watermark_shape, strength):
    """Spectral amplitude that spreads to a fixed RMS change in pixel space.

    By Parseval, ``m`` bins of amplitude ``a`` (plus their ``m`` mirrors)
    change an ``N``-pixel image by ``a * sqrt(2m) / N`` RMS. Depending only on
    the shapes, the scale is the same at embed and extract time.
    """
    pixels = image_shape[-2] * image_shape[-1]
    bins = 2 * watermark_shape[-2] * watermark_shape[-1]
    return strength * _PIXEL_CHANGE_PER_STRENGTH * pixels / np.sqrt(bins)


def _usable_channels(spectrum):
    """Channels with spectral energy; an all-black plane cannot carry a mark."""
    return np.mean(np.abs(spectrum), axis=(-2, -1)) > 1e-12


def _check_strength(strength):
    if not np.isfinite(strength) or strength <= 0:
        raise ValueError(f"strength must be a positive number, got {strength}")


def embed(image, watermark, strength=0.15, position=0.25):
    """Embed ``watermark`` into ``image``. Returns the watermarked image."""
    _check_strength(strength)
    image = _as_channel_first(image)
    watermark = np.asarray(watermark, dtype=np.float64)
    if watermark.ndim == 3 and watermark.shape[0] != image.shape[0]:
        raise ValueError(f"a colour watermark needs one plane per image channel: "
                         f"{watermark.shape[0]} planes for {image.shape[0]} channels")
    if watermark.ndim not in (2, 3):
        raise ValueError(f"watermark must be 2D or (channels, h, w), got shape {watermark.shape}")

    region = block_slice(image.shape, watermark.shape, position)

    spectrum = transform.fftshift(transform.fft2(image), axes=(-2, -1))
    delta = np.zeros(image.shape)
    delta[(..., *region)] = watermark
    delta = delta + _mirror(delta)
    delta[~_usable_channels(spectrum)] = 0.0

    magnitude = np.abs(spectrum) + _scale(image.shape, watermark.shape, strength) * delta
    marked = magnitude * np.exp(1j * np.angle(spectrum))

    return np.real(transform.ifft2(transform.ifftshift(marked, axes=(-2, -1))))


def extract(original, watermarked, watermark_shape, strength=0.15, position=0.25,
            colour=False):
    """Recover the embedded watermark by differencing the two spectra.

    Returns a 2D mark averaged over channels, or with ``colour`` one plane per
    channel. Channels with no spectral energy (an all-black colour plane)
    cannot carry a mark: they are skipped in the average, and left at zero in
    a colour result.
    """
    _check_strength(strength)
    original = _as_channel_first(original)
    watermarked = _as_channel_first(watermarked)
    if original.shape != watermarked.shape:
        raise ValueError(f"shape mismatch: {original.shape} vs {watermarked.shape}")
    region = block_slice(original.shape, watermark_shape, position)

    spectrum = transform.fftshift(transform.fft2(original), axes=(-2, -1))
    marked = transform.fftshift(transform.fft2(watermarked), axes=(-2, -1))

    usable = _usable_channels(spectrum)
    if not np.any(usable):
        raise ValueError("the original image has no spectral energy to carry a watermark")

    scale = _scale(original.shape, watermark_shape, strength)
    difference = (np.abs(marked) - np.abs(spectrum))[(..., *region)] / scale
    if colour:
        difference[~usable] = 0.0
        return difference
    return np.mean(difference[usable], axis=0)
