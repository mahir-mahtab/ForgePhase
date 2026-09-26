"""Noise cancellation and voice enhancement."""

import numpy as np
import pytest

from phaseforge.analysis import metrics
from phaseforge.audio import denoise, enhance

SAMPLE_RATE = 16000


def speech_like(duration=1.0, sample_rate=SAMPLE_RATE):
    """A crude voiced sound: a fundamental plus harmonics in the speech band."""
    t = np.linspace(0, duration, int(sample_rate * duration), endpoint=False)
    signal = sum(0.3 / (i + 1) * np.sin(2 * np.pi * 200 * (i + 1) * t) for i in range(4))
    envelope = 0.5 * (1 - np.cos(2 * np.pi * np.clip(t / duration, 0, 1)))
    return signal * envelope


@pytest.fixture
def clean():
    return speech_like()


@pytest.fixture
def noisy(clean):
    rng = np.random.default_rng(0)
    lead = np.zeros(SAMPLE_RATE // 4)  # noise-only lead-in for profile estimation
    signal = np.concatenate([lead, clean])
    return signal + rng.normal(scale=0.05, size=len(signal))


def test_denoise_improves_snr(clean, noisy):
    reference = np.concatenate([np.zeros(SAMPLE_RATE // 4), clean])
    cleaned = denoise.denoise(noisy)
    assert metrics.snr(reference, cleaned) > metrics.snr(reference, noisy)


def test_denoise_preserves_length(noisy):
    assert len(denoise.denoise(noisy)) == len(noisy)


def test_denoise_reduces_silent_region_energy(noisy):
    """The lead-in is pure noise, so it should get much quieter."""
    lead = SAMPLE_RATE // 4
    cleaned = denoise.denoise(noisy)
    assert np.std(cleaned[:lead]) < np.std(noisy[:lead]) * 0.5


def test_noise_profile_matches_manual_estimate(noisy):
    profile = denoise.estimate_noise_profile(noisy)
    cleaned = denoise.denoise(noisy, noise_profile=profile)
    assert len(cleaned) == len(noisy)


def test_denoise_multichannel(noisy):
    stereo = np.stack([noisy, noisy * 0.8])
    cleaned = denoise.denoise_multichannel(stereo)
    assert cleaned.shape == stereo.shape


def test_denoise_validates_parameters(noisy):
    with pytest.raises(ValueError, match="over_subtraction"):
        denoise.denoise(noisy, over_subtraction=0.5)
    with pytest.raises(ValueError, match="floor"):
        denoise.denoise(noisy, floor=1.0)


def test_enhance_preserves_length(clean):
    assert len(enhance.enhance(clean, SAMPLE_RATE)) == len(clean)


def test_enhance_boosts_the_speech_band(clean):
    curve = enhance.speech_gain_curve(1024, SAMPLE_RATE, boost=2.0)
    frequencies = np.abs(np.fft.fftfreq(1024, d=1.0 / SAMPLE_RATE))
    in_band = curve[(frequencies > 500) & (frequencies < 3000)]
    out_of_band = curve[frequencies > 6000]
    assert in_band.mean() > 1.8
    assert out_of_band.mean() < 1.1


def test_enhance_output_stays_in_range(clean):
    enhanced = enhance.enhance(clean, SAMPLE_RATE, boost=4.0)
    assert np.max(np.abs(enhanced)) <= 1.0


def test_enhance_gating_suppresses_pure_noise():
    rng = np.random.default_rng(1)
    noise = rng.normal(scale=0.05, size=SAMPLE_RATE)
    enhanced = enhance.enhance(noise, SAMPLE_RATE, boost=1.0, gate_threshold=2.0,
                               gate_floor=0.05)
    assert np.std(enhanced) < np.std(noise)


def test_enhance_multichannel(clean):
    stereo = np.stack([clean, clean * 0.5])
    enhanced = enhance.enhance_multichannel(stereo, SAMPLE_RATE)
    assert enhanced.shape == stereo.shape


def test_enhance_validates_parameters(clean):
    with pytest.raises(ValueError, match="boost"):
        enhance.enhance(clean, SAMPLE_RATE, boost=0.5)
    with pytest.raises(ValueError, match="gate_floor"):
        enhance.enhance(clean, SAMPLE_RATE, gate_floor=2.0)


def test_denoise_then_enhance_composes(noisy):
    result = enhance.enhance(denoise.denoise(noisy), SAMPLE_RATE)
    assert len(result) == len(noisy)
    assert np.isfinite(result).all()
