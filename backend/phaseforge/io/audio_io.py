"""Audio loading and saving.

Audio is held internally as float64 with shape ``(channels, samples)`` --
channels first, always present even for mono, mirroring the image convention.
"""

import numpy as np
import soundfile as sf


def load_audio(path):
    """Return ``(array, sample_rate)`` with array shaped ``(channels, samples)``."""
    data, sample_rate = sf.read(path, dtype="float64", always_2d=True)
    return np.ascontiguousarray(data.T), sample_rate


# Formats safe to use as a key file: lossy audio decoders can differ between
# library builds, and the key is a hash of the decoded samples.
LOSSLESS_FORMATS = frozenset({"WAV", "FLAC", "AIFF"})


def check_key_format(path):
    """Raise ``ValueError`` unless the audio is lossless. Reads the header only."""
    info = sf.info(path)
    if info.format not in LOSSLESS_FORMATS:
        raise ValueError(f"key audio must be WAV, FLAC or AIFF, not {info.format}")


def load_key_audio(path):
    """Load audio to use as key material, refusing lossy formats."""
    check_key_format(path)
    return load_audio(path)


def save_audio(path, data, sample_rate, subtype="PCM_16", format=None):
    """Write a ``(channels, samples)`` float array.

    ``path`` may be a filename or a binary file object; the latter needs an
    explicit ``format`` (e.g. ``"WAV"``) since there is no extension to infer
    one from.
    """
    data = np.asarray(data, dtype=np.float64)
    if data.ndim == 1:
        data = data[None, :]
    sf.write(path, np.clip(data.T, -1.0, 1.0), int(sample_rate), subtype=subtype,
             format=format)
