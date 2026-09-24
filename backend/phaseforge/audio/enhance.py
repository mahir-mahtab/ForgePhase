"""Voice enhancement.

Two frequency-domain operations over the same STFT frames the denoiser uses:

- a gain curve that lifts the band carrying most speech intelligibility
  (roughly 300-3400 Hz, the range telephony was built around), and
- spectral gating, which attenuates bins that sit near the frame's own noise
  floor, using a per-frame adaptive threshold rather than a fixed one so quiet
  passages are not gutted.
"""

import numpy as np

from ..core import framing

SPEECH_LOW_HZ = 300.0
SPEECH_HIGH_HZ = 3400.0


def speech_gain_curve(frame_length, sample_rate, boost=2.0, low=SPEECH_LOW_HZ,
                      high=SPEECH_HIGH_HZ, transition=200.0):
    """Smooth gain curve: ``boost`` inside the speech band, unity outside."""
    frequencies = np.abs(framing.frame_frequencies(frame_length, sample_rate))
    rising = 0.5 * (1.0 + np.tanh((frequencies - low) / transition))
    falling = 0.5 * (1.0 + np.tanh((high - frequencies) / transition))
    return 1.0 + (boost - 1.0) * rising * falling


def enhance(signal, sample_rate, boost=2.0, gate_threshold=1.5, gate_floor=0.1,
            frame_length=framing.DEFAULT_FRAME_LENGTH, hop=None):
    """Enhance speech in a 1D signal.

    ``gate_threshold`` is a multiple of each frame's median bin magnitude;
    bins below it are attenuated toward ``gate_floor``.
    """
    if not np.isfinite(boost) or boost < 1.0:
        raise ValueError(f"boost must be >= 1, got {boost}")
    if not np.isfinite(gate_threshold) or gate_threshold < 0.0:
        raise ValueError(f"gate_threshold must be >= 0, got {gate_threshold}")
    if not np.isfinite(gate_floor) or not 0.0 <= gate_floor <= 1.0:
        raise ValueError(f"gate_floor must be in [0, 1], got {gate_floor}")

    spectra, meta = framing.stft(signal, frame_length, hop)
    magnitude = np.abs(spectra)

    gain = speech_gain_curve(meta["frame_length"], sample_rate, boost)
    boosted = magnitude * gain[None, :]

    threshold = gate_threshold * np.median(magnitude, axis=-1, keepdims=True)
    gate = np.where(magnitude >= threshold, 1.0, gate_floor)

    phase = np.exp(1j * np.angle(spectra))
    enhanced = framing.istft(boosted * gate * phase, meta)

    # Boosting adds energy; rescale if it pushed the waveform out of range.
    peak = np.max(np.abs(enhanced))
    if peak > 1.0:
        enhanced = enhanced / peak
    return enhanced


def enhance_multichannel(signal, sample_rate, **kwargs):
    """Apply :func:`enhance` to each channel of a ``(channels, samples)`` array."""
    signal = np.asarray(signal, dtype=np.float64)
    if signal.ndim == 1:
        return enhance(signal, sample_rate, **kwargs)
    return np.stack([enhance(channel, sample_rate, **kwargs) for channel in signal])
