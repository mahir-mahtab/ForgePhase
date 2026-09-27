"""Voice enhancement: two-step noise reduction with harmonic regeneration.

Built on Plapous, Marro & Scalart (IEEE TASLP 2006), the classical answer to
the two faults of single-pass suppressors -- a reverberant "tail" from the
decision-directed SNR lagging one frame behind, and voiced harmonics that sink
below the noise and get suppressed with it:

1. **TSNR.** Estimate the a priori SNR by the decision-directed rule, apply
   the resulting Wiener gain, then re-estimate the SNR from that output. The
   second step removes the one-frame lag, so onsets and offsets stay crisp.
2. **HRNR.** Half-wave rectify the TSNR output in the time domain. The
   nonlinearity recreates the harmonic comb at multiples of the pitch, even
   where the first stage erased individual harmonics. Mixing its spectrum
   into the SNR estimate gives a gain that keeps those harmonics.
3. **Clarity EQ.** A smooth lift of the 300-3400 Hz band that carries most of
   speech's intelligibility.
4. **Loudness.** Scale so the active speech (frames within 40 dB of the
   loudest, a lightweight take on ITU-T P.56) sits at a fixed RMS level,
   then pull back if that would clip.

The noise PSD comes from the same speech-presence-probability tracker the
denoiser uses, so no noise-only lead-in is required.
"""

import numpy as np

from ..core import framing
from . import spectral

SPEECH_LOW_HZ = 300.0
SPEECH_HIGH_HZ = 3400.0

DEFAULT_REDUCTION_DB = 15.0
DEFAULT_HARMONICS = 0.5
DEFAULT_CLARITY_DB = 4.0
TARGET_RMS_DBFS = -20.0
PEAK_CEILING = 0.98
_MAX_MAKEUP_DB = 24.0
_ACTIVITY_RANGE_DB = 40.0


def speech_gain_curve(frame_length, sample_rate, boost=2.0, low=SPEECH_LOW_HZ,
                      high=SPEECH_HIGH_HZ, transition=200.0):
    """Smooth gain curve: ``boost`` inside the speech band, unity outside."""
    frequencies = np.abs(framing.frame_frequencies(frame_length, sample_rate))
    rising = 0.5 * (1.0 + np.tanh((frequencies - low) / transition))
    falling = 0.5 * (1.0 + np.tanh((high - frequencies) / transition))
    return 1.0 + (boost - 1.0) * rising * falling


def _validate(reduction_db, harmonics, clarity_db):
    if not np.isfinite(reduction_db) or not 0.0 <= reduction_db <= 60.0:
        raise ValueError(f"reduction_db must be in [0, 60], got {reduction_db}")
    if not np.isfinite(harmonics) or not 0.0 <= harmonics <= 1.0:
        raise ValueError(f"harmonics must be in [0, 1], got {harmonics}")
    if not np.isfinite(clarity_db) or not 0.0 <= clarity_db <= 12.0:
        raise ValueError(f"clarity_db must be in [0, 12], got {clarity_db}")


def _two_step_gains(power, noise, floor):
    """TSNR: a decision-directed Wiener pass, then a second, lag-free SNR."""
    _, _, first = spectral.decision_directed_snr(power, noise, xi_min=floor ** 2)
    xi_tsnr = first ** 2 * power / noise
    return np.maximum(spectral.wiener_gain(xi_tsnr), floor)


def _enhance_channel(signal, sample_rate, reduction_db, harmonics, clarity_db,
                     frame_length, hop):
    spectra, meta = framing.stft(signal, frame_length, hop)
    power = np.abs(spectra) ** 2
    noise = spectral.track_noise_psd(power)

    if reduction_db > 0.0:
        floor = spectral.db_to_gain(reduction_db)
        tsnr = _two_step_gains(power, noise, floor)
        gains = tsnr
        if harmonics > 0.0:
            clean = framing.istft(spectra * tsnr, meta)
            rectified, _ = framing.stft(np.maximum(clean, 0.0), frame_length, hop)
            mixed = ((1.0 - harmonics) * tsnr ** 2 * power
                     + harmonics * np.abs(rectified) ** 2)
            gains = np.maximum(spectral.wiener_gain(mixed / noise), floor)
        spectra = spectra * gains

    if clarity_db > 0.0:
        boost = 10.0 ** (clarity_db / 20.0)
        spectra = spectra * speech_gain_curve(meta["frame_length"], sample_rate, boost)[None, :]

    return framing.istft(spectra, meta)


def _active_rms(signal, sample_rate):
    """RMS over the frames within ``_ACTIVITY_RANGE_DB`` of the loudest."""
    flat = np.atleast_2d(signal)
    size = max(int(0.02 * sample_rate), 1)
    count = flat.shape[-1] // size
    if count == 0:
        return float(np.sqrt(np.mean(flat ** 2)))
    frames = flat[:, :count * size].reshape(flat.shape[0], count, size)
    energy = np.mean(frames ** 2, axis=(0, 2))
    peak = energy.max()
    if peak <= spectral.EPSILON:
        return 0.0
    active = energy >= peak * 10.0 ** (-_ACTIVITY_RANGE_DB / 10.0)
    return float(np.sqrt(np.mean(energy[active])))


def _normalize_loudness(signal, sample_rate):
    rms = _active_rms(signal, sample_rate)
    if rms <= spectral.EPSILON:
        return signal
    gain = min(10.0 ** (TARGET_RMS_DBFS / 20.0) / rms, 10.0 ** (_MAX_MAKEUP_DB / 20.0))
    peak = np.max(np.abs(signal)) * gain
    if peak > PEAK_CEILING:
        gain *= PEAK_CEILING / peak
    return signal * gain


def enhance_multichannel(signal, sample_rate, reduction_db=DEFAULT_REDUCTION_DB,
                         harmonics=DEFAULT_HARMONICS, clarity_db=DEFAULT_CLARITY_DB,
                         normalize=True, frame_length=framing.DEFAULT_FRAME_LENGTH, hop=None):
    """Enhance speech in a 1D signal or a ``(channels, samples)`` array.

    ``reduction_db`` caps how far noise-dominated bins are turned down (0
    disables noise reduction), ``harmonics`` is the weight of the regenerated
    harmonic spectrum (0 is plain TSNR), and ``clarity_db`` the lift of the
    speech band. Channels are processed independently but levelled together,
    so the stereo balance survives.
    """
    _validate(reduction_db, harmonics, clarity_db)
    signal = np.asarray(signal, dtype=np.float64)
    channels = signal[None, :] if signal.ndim == 1 else signal

    enhanced = np.stack([
        _enhance_channel(channel, sample_rate, reduction_db, harmonics, clarity_db,
                         frame_length, hop)
        for channel in channels
    ])

    if normalize:
        enhanced = _normalize_loudness(enhanced, sample_rate)
    else:
        peak = np.max(np.abs(enhanced)) if enhanced.size else 0.0
        if peak > 1.0:
            enhanced = enhanced / peak
    return enhanced[0] if signal.ndim == 1 else enhanced


def enhance(signal, sample_rate, **kwargs):
    """Enhance speech in a 1D signal; see :func:`enhance_multichannel`."""
    signal = np.asarray(signal, dtype=np.float64)
    if signal.ndim != 1:
        raise ValueError(f"enhance expects a 1D signal, got shape {signal.shape}")
    return enhance_multichannel(signal, sample_rate, **kwargs)
