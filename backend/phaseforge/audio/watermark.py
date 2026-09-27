"""Frequency-domain audio watermarking.

The audio counterpart of :mod:`phaseforge.image.watermark`: a second, shorter
recording is hidden in the host's spectrum and recovered by comparing the
watermarked file against the original.

The mark is mixed to mono, resampled to the host's rate and written, sample by
sample, into the upper half of the host's spectrum (a quarter of Nyquist up to
Nyquist), so it can be at most a quarter of the host's length; anything longer
is cut. It is added to the complex spectrum rather than the magnitude, which
keeps the operation linear: extraction is an exact subtraction whatever the
sign of the mark's samples. In the time domain it lands as faint broadband
hiss, around -54 dBFS.

There are no settings: the band and the gain follow from the host's length,
so extraction needs only the two files.
"""

import numpy as np

# RMS change to the host, as a fraction of full scale, for a full-scale mark.
# Roughly 65 16-bit steps, so the mark comes back cleanly from a PCM_16 WAV.
_RMS_CHANGE = 0.002

# Extracted samples quieter than this fraction of the peak, at the end of the
# band, are the unused capacity and are trimmed off.
_TRIM_LEVEL = 0.05


def _band(samples):
    """The rfft bins that carry the mark: a quarter of Nyquist up to (not incl.) Nyquist."""
    start, stop = samples // 4, samples // 2
    if start < 1 or stop - start < 1:
        raise ValueError(f"a {samples}-sample recording is too short to carry a watermark")
    return slice(start, stop)


def capacity(samples):
    """How many mark samples a host of ``samples`` samples can carry."""
    band = _band(samples)
    return band.stop - band.start


def _scale(samples):
    """Bin amplitude that spreads to :data:`_RMS_CHANGE` RMS in the time domain.

    By Parseval, ``m`` rfft bins of amplitude ``a`` (each with its implied
    negative-frequency partner) change an ``N``-sample signal by
    ``a * sqrt(2m) / N`` RMS.
    """
    return _RMS_CHANGE * samples / np.sqrt(2 * capacity(samples))


def _resample(signal, source_rate, target_rate):
    """Linear-interpolation resampling; ample for a watermark."""
    if source_rate == target_rate:
        return signal
    length = max(1, round(signal.shape[-1] * target_rate / source_rate))
    times = np.arange(length) * (source_rate / target_rate)
    return np.interp(times, np.arange(signal.shape[-1]), signal)


def embed(host, sample_rate, mark, mark_rate):
    """Hide ``mark`` in ``host``; both are ``(channels, samples)`` arrays.

    Returns the watermarked host, the same shape as ``host``.
    """
    host = np.asarray(host, dtype=np.float64)
    mark = np.mean(np.atleast_2d(np.asarray(mark, dtype=np.float64)), axis=0)
    samples = host.shape[-1]
    band = _band(samples)

    mark = _resample(mark, mark_rate, sample_rate)[:capacity(samples)]
    peak = np.max(np.abs(mark)) if mark.size else 0.0
    if peak < 1e-9:
        raise ValueError("the watermark recording is silent")

    spectrum = np.fft.rfft(host, axis=-1)
    spectrum[..., band.start:band.start + mark.size] += _scale(samples) * mark / peak
    return np.fft.irfft(spectrum, n=samples, axis=-1)


def extract(original, watermarked):
    """Recover the hidden recording, at the host's sample rate, peak-normalized.

    Channels are averaged, and the silent unused part of the band trimmed off.
    """
    original = np.asarray(original, dtype=np.float64)
    watermarked = np.asarray(watermarked, dtype=np.float64)
    if original.shape != watermarked.shape:
        raise ValueError(f"the recordings differ in shape: {original.shape} vs "
                         f"{watermarked.shape}; use the original the mark was embedded in")
    samples = original.shape[-1]
    band = _band(samples)

    difference = np.fft.rfft(watermarked, axis=-1) - np.fft.rfft(original, axis=-1)
    mark = np.mean(difference.real[..., band], axis=0) / _scale(samples)

    peak = np.max(np.abs(mark))
    if peak < 1e-9:
        return np.zeros((1, mark.size))
    loud = np.flatnonzero(np.abs(mark) >= _TRIM_LEVEL * peak)
    mark = mark[:loud[-1] + 1]
    return (0.9 * mark / peak)[None, :]
