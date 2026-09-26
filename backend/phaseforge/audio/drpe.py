"""Double Random Phase Encoding for audio.

The same construction as the image encryptor, but with 1D transforms over
fixed-size blocks rather than one 2D transform. Blocking is deliberate: a
hand-written DFT over a multi-minute waveform as a single array is
computationally hopeless, whereas 4096-sample blocks stay tractable and keep the
mask size independent of file length.

Every (channel, block) pair gets its own independently indexed mask pair.
"""

import numpy as np

from ..core import transform
from ..core.padding import is_power_of_two
from ..keys import derive

DEFAULT_BLOCK_SIZE = 4096
_CHANNEL_STRIDE = 1 << 32


def _as_channel_first(signal):
    signal = np.asarray(signal, dtype=np.float64)
    if signal.ndim == 1:
        return signal[None, :]
    if signal.ndim != 2:
        raise ValueError(f"expected a 1D or 2D signal, got shape {signal.shape}")
    return signal


def _block_masks(key, channels, n_blocks, block_size):
    """Stacked ``(channels, n_blocks, block_size)`` mask pairs."""
    first = np.empty((channels, n_blocks, block_size))
    second = np.empty((channels, n_blocks, block_size))
    for channel in range(channels):
        for block in range(n_blocks):
            index = channel * _CHANNEL_STRIDE + block
            a, b = derive.masks_from_key(key, (block_size,), count=2, index=index)
            first[channel, block] = a
            second[channel, block] = b
    return first, second


def encrypt(signal, passphrase, sample_rate, salt=None, block_size=DEFAULT_BLOCK_SIZE,
            iterations=derive.DEFAULT_ITERATIONS):
    """Encrypt a ``(channels, samples)`` float waveform.

    Returns ``(ciphertext, metadata)`` with ciphertext shaped
    ``(channels, n_blocks, block_size)``.
    """
    if not is_power_of_two(block_size):
        raise ValueError(f"block_size must be a power of two, got {block_size}")

    signal = _as_channel_first(signal)
    salt = derive.new_salt() if salt is None else salt
    key = derive.derive_key(passphrase, salt, iterations)

    channels, length = signal.shape
    n_blocks = int(np.ceil(length / block_size))
    padded = np.zeros((channels, n_blocks * block_size))
    padded[:, :length] = signal
    blocks = padded.reshape(channels, n_blocks, block_size)

    mask_a, mask_b = _block_masks(key, channels, n_blocks, block_size)

    timed = blocks * derive.phase_mask(mask_a)
    spectrum = transform.fft(timed, axis=-1) * derive.phase_mask(mask_b)
    ciphertext = transform.ifft(spectrum, axis=-1)

    metadata = {
        "kind": "audio",
        "salt": salt,
        "iterations": iterations,
        "sample_rate": int(sample_rate),
        "block_size": block_size,
        "channels": channels,
        "length": length,
    }
    return ciphertext, metadata


def decrypt_with_phase_perturbation(ciphertext, passphrase, metadata, phase_error=0.0):
    """Decrypt while adding a controlled phase error to both masks.

    This is an experiment helper: ``phase_error=0`` is the normal decrypt,
    while non-zero values model a key whose derived phase is slightly wrong.
    """
    if metadata.get("kind") != "audio":
        raise ValueError(f"expected audio ciphertext, got kind={metadata.get('kind')!r}")
    ciphertext = np.asarray(ciphertext)
    key = derive.derive_key(passphrase, metadata["salt"], metadata["iterations"])
    channels, n_blocks, block_size = ciphertext.shape
    mask_a, mask_b = _block_masks(key, channels, n_blocks, block_size)
    # A constant phase offset would largely collapse into a global phase and
    # can accidentally produce periodic "sweet spots". Use a deterministic
    # zero-mean phase perturbation across each block instead, modelling a
    # slightly incorrect key while keeping phase_error measured in radians.
    sample_axis = np.arange(block_size, dtype=np.float64)
    pattern = np.sign(np.sin(sample_axis * 2.399))
    pattern[pattern == 0] = 1.0
    perturbation = (phase_error / (2.0 * np.pi)) * pattern
    mask_a = derive.phase_mask(mask_a + perturbation[None, None, :])
    mask_b = derive.phase_mask(mask_b)
    spectrum = transform.fft(ciphertext, axis=-1) * np.conjugate(mask_b)
    timed = transform.ifft(spectrum, axis=-1) * np.conjugate(mask_a)
    flat = np.real(timed).reshape(channels, n_blocks * block_size)
    return flat[:, :metadata["length"]]


def decrypt(ciphertext, passphrase, metadata):
    """Invert :func:`encrypt`, returning a ``(channels, samples)`` waveform."""
    if metadata.get("kind") != "audio":
        raise ValueError(f"expected audio ciphertext, got kind={metadata.get('kind')!r}")

    ciphertext = np.asarray(ciphertext)
    key = derive.derive_key(passphrase, metadata["salt"], metadata["iterations"])
    channels, n_blocks, block_size = ciphertext.shape
    mask_a, mask_b = _block_masks(key, channels, n_blocks, block_size)

    spectrum = transform.fft(ciphertext, axis=-1) * derive.conjugate_phase_mask(mask_b)
    timed = transform.ifft(spectrum, axis=-1) * derive.conjugate_phase_mask(mask_a)

    # Audio is signed, so the real part -- not the modulus -- is the plaintext.
    flat = np.real(timed).reshape(channels, n_blocks * block_size)
    return flat[:, :metadata["length"]]
