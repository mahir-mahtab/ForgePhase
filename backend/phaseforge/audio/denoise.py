"""Noise reduction with the OM-LSA estimator.

Replaces plain spectral subtraction with the statistical pipeline used by most
modern non-neural speech denoisers:

1. **Noise tracking.** The noise PSD is followed frame by frame with Gerkmann &
   Hendriks' speech-presence-probability estimator
   (:func:`.spectral.track_noise_psd`), so hum that drifts or a fan that
   switches on mid-recording is still tracked. The opening frames only seed it.
2. **A priori SNR.** Ephraim & Malah's decision-directed rule smooths the SNR
   estimate across frames. ``smoothing`` is its weight: higher values give a
   steadier, less "musical" residual at the cost of slightly smeared onsets.
3. **OM-LSA gain.** Cohen's optimally-modified log-spectral amplitude gain:
   the LSA gain where speech is likely present, falling geometrically toward
   a floor ``reduction_db`` below unity where it is likely absent. A bounded
   floor, rather than zeroing bins, is what keeps the background natural.

The noisy phase is kept and the result resynthesized by weighted overlap-add.

References: Ephraim & Malah, IEEE TASSP 1984 / 1985; Cohen & Berdugo, Signal
Processing 2001 (OM-LSA); Gerkmann & Hendriks, IEEE TASLP 2012.
"""

import numpy as np

from ..core import framing
from . import spectral

DEFAULT_REDUCTION_DB = 20.0
DEFAULT_SMOOTHING = 0.98
DEFAULT_NOISE_FRAMES = 6


def _validate(reduction_db, smoothing):
    if not np.isfinite(reduction_db) or not 0.0 < reduction_db <= 60.0:
        raise ValueError(f"reduction_db must be in (0, 60], got {reduction_db}")
    if not np.isfinite(smoothing) or not 0.0 <= smoothing < 1.0:
        raise ValueError(f"smoothing must be in [0, 1), got {smoothing}")


def estimate_noise_profile(signal, frame_length=framing.DEFAULT_FRAME_LENGTH, hop=None,
                           noise_frames=DEFAULT_NOISE_FRAMES):
    """Tracked noise PSD for each STFT frame of ``signal``, ``(frames, bins)``."""
    spectra, _ = framing.stft(signal, frame_length, hop)
    return spectral.track_noise_psd(np.abs(spectra) ** 2, noise_frames)


def suppression_gains(power, reduction_db=DEFAULT_REDUCTION_DB, smoothing=DEFAULT_SMOOTHING,
                      noise_frames=DEFAULT_NOISE_FRAMES, noise_psd=None):
    """OM-LSA gain for every bin of ``power`` (``|STFT|**2``).

    Returns ``(gains, noise_psd)``; the noise estimate is handed back so a
    caller can reuse it.
    """
    _validate(reduction_db, smoothing)
    spectral.check_noise_frames(noise_frames)
    if noise_psd is None:
        noise_psd = spectral.track_noise_psd(power, noise_frames)
    floor = spectral.db_to_gain(reduction_db)

    def om_lsa(xi, gamma):
        presence = spectral.presence_probability(xi, gamma)
        lsa = np.minimum(spectral.lsa_gain(xi, gamma), 1.0)
        return lsa ** presence * floor ** (1.0 - presence)

    _, _, gains = spectral.decision_directed_snr(
        power, noise_psd, alpha=smoothing, xi_min=floor ** 2, gain_rule=om_lsa)
    return np.clip(gains, floor, 1.0), noise_psd


def denoise(signal, reduction_db=DEFAULT_REDUCTION_DB, smoothing=DEFAULT_SMOOTHING,
            noise_frames=DEFAULT_NOISE_FRAMES, frame_length=framing.DEFAULT_FRAME_LENGTH,
            hop=None):
    """Suppress background noise in a 1D signal."""
    _validate(reduction_db, smoothing)
    spectral.check_noise_frames(noise_frames)

    spectra, meta = framing.stft(signal, frame_length, hop)
    gains, _ = suppression_gains(np.abs(spectra) ** 2, reduction_db, smoothing, noise_frames)
    return framing.istft(spectra * gains, meta)


def denoise_multichannel(signal, **kwargs):
    """Apply :func:`denoise` to each channel of a ``(channels, samples)`` array."""
    signal = np.asarray(signal, dtype=np.float64)
    if signal.ndim == 1:
        return denoise(signal, **kwargs)
    return np.stack([denoise(channel, **kwargs) for channel in signal])
