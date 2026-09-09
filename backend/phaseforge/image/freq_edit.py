"""Interactive frequency-domain image editing.

Builds low-, high-, and band-pass masks over the 2D spectrum, applies them, and
reconstructs. Also renders the spectrum itself for display -- a raw complex
spectrum cannot go into an ``<img>`` tag, so the frontend gets a log-scaled
magnitude image instead.

Cutoffs are given as fractions of the Nyquist limit (0 = DC, 1 = the corner of
the spectrum), so a UI slider maps onto them directly without knowing the image
size.
"""

import numpy as np

from ..core import transform

FILTER_SHAPES = ("ideal", "gaussian", "butterworth")


def _as_channel_first(image):
    image = np.asarray(image, dtype=np.float64)
    return image[None, :, :] if image.ndim == 2 else image


def radial_distance(shape):
    """Normalized distance from DC for each bin of a shifted spectrum."""
    height, width = shape[-2:]
    rows = (np.arange(height) - height // 2) / (height / 2)
    cols = (np.arange(width) - width // 2) / (width / 2)
    return np.sqrt(rows[:, None] ** 2 + cols[None, :] ** 2)


def build_mask(shape, kind="low", cutoff=0.3, high_cutoff=None, filter_shape="gaussian",
               order=2):
    """Return a real gain mask over the shifted spectrum, in ``[0, 1]``."""
    if filter_shape not in FILTER_SHAPES:
        raise ValueError(f"filter_shape must be one of {FILTER_SHAPES}, got {filter_shape!r}")
    if not 0 < cutoff <= np.sqrt(2):
        raise ValueError(f"cutoff must be in (0, sqrt(2)], got {cutoff}")

    distance = radial_distance(shape)

    def low_pass(limit):
        if filter_shape == "ideal":
            return (distance <= limit).astype(np.float64)
        if filter_shape == "gaussian":
            return np.exp(-(distance ** 2) / (2.0 * limit ** 2))
        return 1.0 / (1.0 + (distance / limit) ** (2 * order))

    if kind == "low":
        return low_pass(cutoff)
    if kind == "high":
        return 1.0 - low_pass(cutoff)
    if kind == "band":
        if high_cutoff is None or high_cutoff <= cutoff:
            raise ValueError("band-pass needs high_cutoff greater than cutoff")
        return low_pass(high_cutoff) - low_pass(cutoff)
    raise ValueError(f"kind must be 'low', 'high' or 'band', got {kind!r}")


def apply_filter(image, kind="low", cutoff=0.3, high_cutoff=None, filter_shape="gaussian",
                 order=2):
    """Filter an image in the frequency domain and reconstruct it."""
    image = _as_channel_first(image)
    mask = build_mask(image.shape, kind, cutoff, high_cutoff, filter_shape, order)

    spectrum = transform.fftshift(transform.fft2(image), axes=(-2, -1))
    filtered = transform.ifftshift(spectrum * mask, axes=(-2, -1))
    return np.real(transform.ifft2(filtered))


def spectrum_preview(data, gamma=1.0):
    """Log-scaled, ``[0, 1]``-normalized magnitude spectrum for display.

    Accepts an image (real) or a ciphertext (complex); a complex input is
    treated as already being a spectrum-domain signal to visualize.
    """
    data = np.asarray(data)
    if data.ndim == 2:
        data = data[None, :, :]

    spectrum = data if np.iscomplexobj(data) else transform.fft2(data)
    magnitude = np.abs(transform.fftshift(spectrum, axes=(-2, -1)))

    scaled = np.log1p(magnitude)
    peak = scaled.max()
    if peak < 1e-12:
        return np.zeros_like(scaled)
    return (scaled / peak) ** gamma
