"""Hybrid images: one picture up close, another from across the room.

The "near" image is high-passed so only its edges and fine texture remain; the
"far" image is low-passed so only its broad shapes and shading remain. Their
sum reads as the near image when it fills the eye, where fine detail dominates,
and as the far image when it is small or seen from a distance, where the eye
can no longer resolve that detail (Oliva, Torralba & Schyns, SIGGRAPH 2006).

Cutoffs use the same units as :mod:`freq_edit` -- fractions of the Nyquist
limit -- so they carry over between image sizes. Keep ``near_cutoff`` above
``far_cutoff``: the gap between them is what stops the two images competing in
the same band.

The two images must already be aligned (eyes over eyes, outline over outline).
:func:`fit_to` only matches their size; it cannot line up features.
"""

import numpy as np
from PIL import Image

from . import freq_edit

DEFAULT_NEAR_CUTOFF = 0.12
DEFAULT_FAR_CUTOFF = 0.03


def _as_channel_first(image):
    image = np.asarray(image, dtype=np.float64)
    return image[None, :, :] if image.ndim == 2 else image


def fit_to(image, height, width):
    """Centre-crop ``image`` to the target aspect ratio, then resize it.

    Cropping first keeps the subject undistorted; resizing straight to the
    target would stretch a portrait photo to fit a square one.
    """
    image = _as_channel_first(image)
    src_height, src_width = image.shape[-2:]
    if (src_height, src_width) == (height, width):
        return image

    target_ratio = width / height
    if src_width / src_height > target_ratio:
        crop_width = max(1, round(src_height * target_ratio))
        left = (src_width - crop_width) // 2
        image = image[:, :, left:left + crop_width]
    else:
        crop_height = max(1, round(src_width / target_ratio))
        top = (src_height - crop_height) // 2
        image = image[:, top:top + crop_height, :]

    channels = [Image.fromarray(channel.astype(np.float32), mode="F")
                .resize((width, height), Image.Resampling.LANCZOS)
                for channel in image]
    return np.stack([np.asarray(channel, dtype=np.float64) for channel in channels])


def _match_channels(near, far):
    """Promote a greyscale input to colour when the other one is colour."""
    channels = max(near.shape[0], far.shape[0])
    return (np.broadcast_to(near, (channels,) + near.shape[1:]),
            np.broadcast_to(far, (channels,) + far.shape[1:]))


def _filter(image, kind, cutoff, filter_shape):
    """Filter with mirrored borders.

    The FFT treats an image as periodic, so a top edge brighter than the
    bottom edge is a sharp step to it -- and a high-pass turns that step into a
    bright seam along the border. Reflecting the image outward first removes
    the step. Cutoffs are fractions of Nyquist, so padding leaves them
    unchanged in cycles per pixel.
    """
    height, width = image.shape[-2:]
    pad_y, pad_x = height // 4, width // 4
    padded = np.pad(image, ((0, 0), (pad_y, pad_y), (pad_x, pad_x)), mode="reflect")
    filtered = freq_edit.apply_filter(padded, kind, cutoff, filter_shape=filter_shape)
    return filtered[:, pad_y:pad_y + height, pad_x:pad_x + width]


def components(near, far, near_cutoff=DEFAULT_NEAR_CUTOFF, far_cutoff=DEFAULT_FAR_CUTOFF,
               filter_shape="gaussian", near_gain=1.0):
    """Return ``(low, high)``: the far image's low band and the near image's high band.

    ``far`` is fitted to ``near``'s size. ``high`` has zero mean, so it is not
    displayable on its own; add 0.5 to view it.
    """
    if not np.isfinite(near_gain) or not 0 < near_gain <= 5:
        raise ValueError(f"near_gain must be in (0, 5], got {near_gain}")
    near = _as_channel_first(near)
    far = fit_to(far, *near.shape[-2:])
    near, far = _match_channels(near, far)

    low = _filter(far, "low", far_cutoff, filter_shape)
    high = _filter(near, "high", near_cutoff, filter_shape)
    return low, near_gain * high


def hybrid(near, far, near_cutoff=DEFAULT_NEAR_CUTOFF, far_cutoff=DEFAULT_FAR_CUTOFF,
           filter_shape="gaussian", near_gain=1.0):
    """Blend ``near`` (seen up close) and ``far`` (seen from a distance)."""
    low, high = components(near, far, near_cutoff, far_cutoff, filter_shape, near_gain)
    return np.clip(low + high, 0.0, 1.0)


def distance_preview(image, levels=4, gap=16, background=1.0):
    """Lay the image out at full, 1/2, 1/4 ... size, side by side.

    Shrinking an image is what walking away from it does, so this shows both
    readings on one screen. Lanczos resampling low-passes as it shrinks, which
    stands in for the eye losing fine detail.
    """
    if not 1 <= levels <= 6:
        raise ValueError(f"levels must be in [1, 6], got {levels}")
    image = _as_channel_first(image)
    height, width = image.shape[-2:]

    tiles = [image]
    for level in range(1, levels):
        scale = 2 ** level
        tile_height, tile_width = max(1, height // scale), max(1, width // scale)
        tiles.append(np.clip(fit_to(image, tile_height, tile_width), 0.0, 1.0))

    total_width = sum(tile.shape[-1] for tile in tiles) + gap * (len(tiles) - 1)
    canvas = np.full((image.shape[0], height, total_width), background)
    left = 0
    for tile in tiles:
        tile_height, tile_width = tile.shape[-2:]
        canvas[:, height - tile_height:, left:left + tile_width] = tile
        left += tile_width + gap
    return canvas
