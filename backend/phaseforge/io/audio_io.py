"""Audio loading and saving.

Audio is held internally as float64 with shape ``(channels, samples)`` --
channels first, always present even for mono, mirroring the image convention.
"""

import numpy as np
import soundfile as sf
import librosa


def load_audio(path):
    try:
        data, sr = sf.read(path, dtype="float64", always_2d=True)
        return np.ascontiguousarray(data.T), sr
    except Exception:
        # MP3 / M4A fallback
        data, sr = librosa.load(path, sr=None, mono=False)

        if data.ndim == 1:
            data = data[np.newaxis, :]

        return np.ascontiguousarray(data), sr


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


def to_mono(data):
    """Average a ``(channels, samples)`` array down to a single channel."""
    return np.mean(np.asarray(data, dtype=np.float64), axis=0)
