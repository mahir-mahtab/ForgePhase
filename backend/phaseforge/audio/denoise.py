"""Noise reduction by spectral subtraction.

Estimate the noise magnitude profile, subtract it from every frame's magnitude,
keep the original phase, resynthesize.

Two parameters matter. ``over_subtraction`` removes more than the estimate to
account for noise that varies frame to frame. ``floor`` stops bins from being
driven to zero: hard-zeroing scattered bins is what produces "musical noise",
the warbling artefact that makes naive spectral subtraction sound worse than
the noise it removed.
"""

import numpy as np

from ..core import framing


def estimate_noise_profile(signal, frame_length=framing.DEFAULT_FRAME_LENGTH, hop=None,
                           noise_frames=6):
    """Average magnitude spectrum of the opening frames, assumed noise-only."""
    spectra, _ = framing.stft(signal, frame_length, hop)
    usable = min(noise_frames, spectra.shape[0])
    return np.mean(np.abs(spectra[:usable]), axis=0)


def denoise(signal, noise_profile=None, over_subtraction=2.0, floor=0.05,
            frame_length=framing.DEFAULT_FRAME_LENGTH, hop=None, noise_frames=6):
    """Spectrally subtract noise from a 1D signal."""
    if over_subtraction < 1.0:
        raise ValueError(f"over_subtraction must be >= 1, got {over_subtraction}")
    if not 0.0 <= floor < 1.0:
        raise ValueError(f"floor must be in [0, 1), got {floor}")

    spectra, meta = framing.stft(signal, frame_length, hop)
    if noise_profile is None:
        usable = min(noise_frames, spectra.shape[0])
        noise_profile = np.mean(np.abs(spectra[:usable]), axis=0)

    magnitude = np.abs(spectra)
    reduced = magnitude - over_subtraction * noise_profile[None, :]
    cleaned = np.maximum(reduced, floor * magnitude)

    phase = np.exp(1j * np.angle(spectra))
    return framing.istft(cleaned * phase, meta)


def denoise_multichannel(signal, **kwargs):
    """Apply :func:`denoise` to each channel of a ``(channels, samples)`` array."""
    signal = np.asarray(signal, dtype=np.float64)
    if signal.ndim == 1:
        return denoise(signal, **kwargs)
    return np.stack([denoise(channel, **kwargs) for channel in signal])
