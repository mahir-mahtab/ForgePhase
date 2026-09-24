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
# Below this a block holds too little signal to hide it; above it one block's
# masks and complex intermediates grow without adding anything.
MIN_BLOCK_SIZE = 64
MAX_BLOCK_SIZE = 65536
_CHANNEL_STRIDE = 1 << 32


def validate_block_size(block_size):
    if isinstance(block_size, bool) or not isinstance(block_size, (int, np.integer)):
        raise ValueError(f"block_size must be an integer, got {block_size!r}")
    if not is_power_of_two(block_size):
        raise ValueError(f"block_size must be a power of two, got {block_size}")
    if not MIN_BLOCK_SIZE <= block_size <= MAX_BLOCK_SIZE:
        raise ValueError(
            f"block_size must be between {MIN_BLOCK_SIZE} and {MAX_BLOCK_SIZE}, got {block_size}")


def validate_ciphertext(ciphertext, metadata):
    """Check an audio ciphertext and its metadata agree before any work is done.

    Containers come from users, so every field decryption relies on is checked
    here rather than surfacing later as a ``KeyError`` or a huge allocation.
    """
    if metadata.get("kind") != "audio":
        raise ValueError(f"expected audio ciphertext, got kind={metadata.get('kind')!r}")
    for field in ("salt", "iterations", "sample_rate", "block_size", "channels", "length"):
        if field not in metadata:
            raise ValueError(f"audio container metadata is missing {field!r}")

    salt = metadata["salt"]
    if not isinstance(salt, (bytes, bytearray)) or len(salt) != derive.SALT_BYTES:
        raise ValueError("audio container has an invalid salt")
    derive.validate_iterations(metadata["iterations"])
    validate_block_size(metadata["block_size"])

    for field in ("sample_rate", "channels", "length"):
        value = metadata[field]
        if isinstance(value, bool) or not isinstance(value, (int, np.integer)) or value < 1:
            raise ValueError(f"audio container field {field!r} must be a positive integer")

    ciphertext = np.asarray(ciphertext)
    if ciphertext.ndim != 3 or not np.iscomplexobj(ciphertext):
        raise ValueError("audio ciphertext must be a 3D complex array")
    channels, n_blocks, block_size = ciphertext.shape
    if channels != metadata["channels"] or block_size != metadata["block_size"]:
        raise ValueError("audio ciphertext shape does not match its metadata")
    if n_blocks != int(np.ceil(metadata["length"] / block_size)):
        raise ValueError("audio ciphertext block count does not match its length")
    if not np.all(np.isfinite(ciphertext)):
        raise ValueError("audio ciphertext contains non-finite values")


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
    validate_block_size(block_size)

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


def decrypt(ciphertext, passphrase, metadata):
    """Invert :func:`encrypt`, returning a ``(channels, samples)`` waveform."""
    validate_ciphertext(ciphertext, metadata)

    ciphertext = np.asarray(ciphertext)
    key = derive.derive_key(passphrase, metadata["salt"], metadata["iterations"])
    channels, n_blocks, block_size = ciphertext.shape
    mask_a, mask_b = _block_masks(key, channels, n_blocks, block_size)

    spectrum = transform.fft(ciphertext, axis=-1) * derive.conjugate_phase_mask(mask_b)
    timed = transform.ifft(spectrum, axis=-1) * derive.conjugate_phase_mask(mask_a)

    # Audio is signed, so the real part -- not the modulus -- is the plaintext.
    flat = np.real(timed).reshape(channels, n_blocks * block_size)
    return flat[:, :metadata["length"]]
