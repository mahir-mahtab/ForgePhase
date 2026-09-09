"""Double Random Phase Encoding for images.

Classical DRPE (Refregier & Javidi, 1995): one random phase mask in the spatial
domain, a second in the frequency domain. The result is complex, with both
amplitude and phase looking like stationary white noise.

Both masks come from the passphrase, so nothing but the passphrase and the
stored salt is needed to decrypt. Colour channels are encrypted with separately
indexed masks so no two channels share a random field.
"""

import numpy as np

from ..core import transform
from ..core.padding import pad_to_power_of_two, unpad
from ..keys import derive


def _channel_masks(key, channels, shape):
    """Stacked ``(channels, h, w)`` mask pairs, one independent pair per channel."""
    first, second = [], []
    for index in range(channels):
        a, b = derive.masks_from_key(key, shape, count=2, index=index)
        first.append(a)
        second.append(b)
    return np.stack(first), np.stack(second)


def _as_channel_first(image):
    image = np.asarray(image, dtype=np.float64)
    if image.ndim == 2:
        return image[None, :, :]
    if image.ndim != 3:
        raise ValueError(f"expected a 2D or 3D image, got shape {image.shape}")
    return image


def encrypt(image, passphrase, salt=None, iterations=derive.DEFAULT_ITERATIONS):
    """Encrypt a ``(channels, height, width)`` float image in ``[0, 1]``.

    Returns ``(ciphertext, metadata)``; the metadata must be kept with the
    ciphertext for decryption.
    """
    image = _as_channel_first(image)
    salt = derive.new_salt() if salt is None else salt
    key = derive.derive_key(passphrase, salt, iterations)

    padded, original_shape = pad_to_power_of_two(image, axes=(-2, -1))
    mask_a, mask_b = _channel_masks(key, padded.shape[0], padded.shape[-2:])

    spatial = padded * derive.phase_mask(mask_a)
    spectrum = transform.fft2(spatial) * derive.phase_mask(mask_b)
    ciphertext = transform.ifft2(spectrum)

    metadata = {
        "kind": "image",
        "salt": salt,
        "iterations": iterations,
        "original_shape": list(original_shape),
        "padded_shape": list(padded.shape),
    }
    return ciphertext, metadata


def decrypt(ciphertext, passphrase, metadata):
    """Invert :func:`encrypt`, returning a ``(channels, height, width)`` image."""
    if metadata.get("kind") != "image":
        raise ValueError(f"expected image ciphertext, got kind={metadata.get('kind')!r}")

    ciphertext = np.asarray(ciphertext)
    key = derive.derive_key(passphrase, metadata["salt"], metadata["iterations"])
    mask_a, mask_b = _channel_masks(key, ciphertext.shape[0], ciphertext.shape[-2:])

    spectrum = transform.fft2(ciphertext) * derive.conjugate_phase_mask(mask_b)
    spatial = transform.ifft2(spectrum) * derive.conjugate_phase_mask(mask_a)

    # The plaintext is real and non-negative, so its modulus recovers it exactly.
    return unpad(np.abs(spatial), metadata["original_shape"])
