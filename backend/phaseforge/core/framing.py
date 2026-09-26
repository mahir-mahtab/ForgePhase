"""STFT / ISTFT built on the swappable transform.

Shared by the audio denoiser and voice enhancer. Uses weighted overlap-add: a
Hann window is applied on both analysis and synthesis, and the accumulated
squared window is divided out on reconstruction, so a signal survives a
round-trip exactly even after its spectrum has been modified.
"""

import numpy as np

from . import transform
from .padding import is_power_of_two

DEFAULT_FRAME_LENGTH = 1024


def hann(frame_length):
    """Periodic Hann window (the correct choice for overlap-add analysis)."""
    n = np.arange(frame_length)
    return 0.5 - 0.5 * np.cos(2.0 * np.pi * n / frame_length)


def _validate(frame_length, hop):
    if not is_power_of_two(frame_length):
        raise ValueError(f"frame_length must be a power of two, got {frame_length}")
    if not 0 < hop <= frame_length:
        raise ValueError(f"hop must be in (0, frame_length], got {hop}")


def stft(x, frame_length=DEFAULT_FRAME_LENGTH, hop=None):
    """Return ``(frames_spectra, meta)`` for a 1D signal.

    ``meta`` carries everything :func:`istft` needs to invert the transform.
    """
    hop = frame_length // 2 if hop is None else hop
    _validate(frame_length, hop)

    x = np.asarray(x, dtype=np.float64)
    if x.ndim != 1:
        raise ValueError(f"stft expects a 1D signal, got shape {x.shape}")

    # Pad by one frame-overlap at both ends so every real sample sits under the
    # full window sum; without the trailing pad the tail decays to silence.
    lead = frame_length - hop
    covered = lead + len(x) + lead
    n_frames = int(np.ceil(max(covered - frame_length, 0) / hop)) + 1
    total = frame_length + (n_frames - 1) * hop
    padded = np.concatenate([np.zeros(lead), x, np.zeros(total - lead - len(x))])

    idx = np.arange(frame_length)[None, :] + hop * np.arange(n_frames)[:, None]
    frames = padded[idx] * hann(frame_length)

    meta = {"frame_length": frame_length, "hop": hop, "length": len(x), "lead": lead}
    return transform.fft(frames, axis=-1), meta


def istft(spectra, meta):
    """Invert :func:`stft`, returning a 1D signal of the original length."""
    frame_length = meta["frame_length"]
    hop = meta["hop"]
    _validate(frame_length, hop)

    frames = np.real(transform.ifft(spectra, axis=-1))
    window = hann(frame_length)
    frames = frames * window

    n_frames = frames.shape[0]
    total = frame_length + (n_frames - 1) * hop
    signal = np.zeros(total)
    weight = np.zeros(total)

    for i in range(n_frames):
        start = i * hop
        signal[start:start + frame_length] += frames[i]
        weight[start:start + frame_length] += window ** 2

    signal = np.divide(signal, weight, out=np.zeros_like(signal), where=weight > 1e-8)
    start = meta["lead"]
    return signal[start:start + meta["length"]]


def frame_frequencies(frame_length, sample_rate):
    """Frequency in Hz for each bin of a ``frame_length``-point transform."""
    return transform.fftfreq(frame_length, d=1.0 / sample_rate)
