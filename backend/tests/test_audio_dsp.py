"""Noise suppression (OM-LSA) and voice enhancement (TSNR + HRNR)."""

import numpy as np
import pytest

from phaseforge.analysis import metrics
from phaseforge.audio import denoise, enhance, spectral

SAMPLE_RATE = 16000
LEAD = SAMPLE_RATE // 4


def speech_like(duration=1.0, sample_rate=SAMPLE_RATE):
    """A crude voiced sound: a gliding fundamental plus harmonics."""
    t = np.arange(int(sample_rate * duration)) / sample_rate
    pitch = 2 * np.pi * np.cumsum(180 + 20 * np.sin(2 * np.pi * 2 * t)) / sample_rate
    signal = sum(0.3 / k * np.sin(k * pitch) for k in range(1, 9))
    envelope = 0.5 * (1 - np.cos(2 * np.pi * np.clip(t / duration, 0, 1)))
    return signal * envelope


@pytest.fixture
def reference():
    return np.concatenate([np.zeros(LEAD), speech_like()])


@pytest.fixture
def noisy(reference):
    rng = np.random.default_rng(0)
    return reference + rng.normal(scale=0.05, size=len(reference))


# -- Building blocks -----------------------------------------------------------

def test_exp1_matches_known_values():
    # E1 reference values from Abramowitz & Stegun table 5.1.
    x = np.array([0.01, 0.5, 1.0, 2.0, 5.0])
    expected = np.array([4.037929577, 0.559773595, 0.219383934, 0.048900511, 0.001148296])
    assert np.allclose(spectral.exp1(x), expected, rtol=1e-4)


def test_noise_tracker_follows_a_rising_floor():
    """Noise that jumps mid-recording is tracked, not frozen at the lead-in."""
    rng = np.random.default_rng(3)
    power = np.concatenate([np.full((40, 64), 1.0), np.full((200, 64), 10.0)])
    power = power * rng.exponential(size=power.shape)
    tracked = spectral.track_noise_psd(power)
    assert np.mean(tracked[20:40]) == pytest.approx(1.0, rel=0.3)
    assert np.mean(tracked[-20:]) == pytest.approx(10.0, rel=0.3)


def test_lsa_gain_is_bounded_and_monotonic_in_snr():
    xi = np.logspace(-3, 3, 50)
    gain = spectral.lsa_gain(xi, np.full_like(xi, 2.0))
    assert np.all(np.diff(gain) > 0)
    assert gain[0] < 0.1 and gain[-1] > 0.9


# -- Denoise -------------------------------------------------------------------

def test_denoise_improves_snr(reference, noisy):
    cleaned = denoise.denoise(noisy)
    assert metrics.snr(reference, cleaned) > metrics.snr(reference, noisy) + 3.0


def test_denoise_preserves_length(noisy):
    assert len(denoise.denoise(noisy)) == len(noisy)


def test_denoise_reduces_silent_region_energy(noisy):
    """The lead-in is pure noise, so it should get much quieter."""
    cleaned = denoise.denoise(noisy)
    assert np.std(cleaned[:LEAD]) < np.std(noisy[:LEAD]) * 0.5


def test_reduction_limits_attenuation(noisy):
    """A gentle setting removes less than a strong one."""
    gentle = denoise.denoise(noisy, reduction_db=6.0)
    strong = denoise.denoise(noisy, reduction_db=30.0)
    assert np.std(strong[:LEAD]) < np.std(gentle[:LEAD])
    assert np.std(gentle[:LEAD]) > np.std(noisy[:LEAD]) * 10 ** (-6.5 / 20)


def test_denoise_needs_no_lead_in():
    """Noise is tracked, so speech from the first sample still gets cleaned."""
    clean = np.tile(speech_like(), 3)
    noisy = clean + np.random.default_rng(2).normal(scale=0.03, size=len(clean))
    assert metrics.snr(clean, denoise.denoise(noisy)) > metrics.snr(clean, noisy)


def test_noise_profile_has_a_row_per_frame(noisy):
    profile = denoise.estimate_noise_profile(noisy)
    assert profile.ndim == 2 and np.all(profile > 0)


def test_denoise_multichannel(noisy):
    stereo = np.stack([noisy, noisy * 0.8])
    cleaned = denoise.denoise_multichannel(stereo)
    assert cleaned.shape == stereo.shape


def test_denoise_validates_parameters(noisy):
    with pytest.raises(ValueError, match="reduction_db"):
        denoise.denoise(noisy, reduction_db=0.0)
    with pytest.raises(ValueError, match="smoothing"):
        denoise.denoise(noisy, smoothing=1.0)
    with pytest.raises(ValueError, match="noise_frames"):
        denoise.denoise(noisy, noise_frames=0)


# -- Enhance -------------------------------------------------------------------

def test_enhance_preserves_length(noisy):
    assert len(enhance.enhance(noisy, SAMPLE_RATE)) == len(noisy)


def test_enhance_improves_snr(reference, noisy):
    enhanced = enhance.enhance(noisy, SAMPLE_RATE, clarity_db=0.0, normalize=False)
    assert metrics.snr(reference, enhanced) > metrics.snr(reference, noisy) + 3.0


def test_harmonic_regeneration_helps(reference, noisy):
    plain = enhance.enhance(noisy, SAMPLE_RATE, harmonics=0.0, clarity_db=0.0, normalize=False)
    regenerated = enhance.enhance(noisy, SAMPLE_RATE, harmonics=0.5, clarity_db=0.0,
                                  normalize=False)
    assert metrics.snr(reference, regenerated) >= metrics.snr(reference, plain)


def test_enhance_boosts_the_speech_band():
    curve = enhance.speech_gain_curve(1024, SAMPLE_RATE, boost=2.0)
    frequencies = np.abs(np.fft.fftfreq(1024, d=1.0 / SAMPLE_RATE))
    in_band = curve[(frequencies > 500) & (frequencies < 3000)]
    out_of_band = curve[frequencies > 6000]
    assert in_band.mean() > 1.8
    assert out_of_band.mean() < 1.1


def test_enhance_with_everything_off_is_identity(noisy):
    out = enhance.enhance(noisy * 0.5, SAMPLE_RATE, reduction_db=0.0, clarity_db=0.0,
                          normalize=False)
    assert np.allclose(out, noisy * 0.5)


def test_enhance_normalizes_loudness(reference):
    quiet = reference * 0.01
    out = enhance.enhance(quiet, SAMPLE_RATE, reduction_db=0.0, clarity_db=0.0)
    active = out[np.abs(reference) > 0]
    assert np.sqrt(np.mean(active ** 2)) > 10 * np.sqrt(np.mean((quiet[quiet != 0]) ** 2))
    assert np.max(np.abs(out)) <= enhance.PEAK_CEILING + 1e-9


def test_enhance_output_stays_in_range(noisy):
    enhanced = enhance.enhance(noisy * 3, SAMPLE_RATE, clarity_db=12.0)
    assert np.max(np.abs(enhanced)) <= 1.0


def test_enhance_suppresses_pure_noise():
    noise = np.random.default_rng(1).normal(scale=0.05, size=SAMPLE_RATE)
    enhanced = enhance.enhance(noise, SAMPLE_RATE, clarity_db=0.0, normalize=False)
    assert np.std(enhanced) < np.std(noise) * 0.5


def test_enhance_multichannel_keeps_balance(noisy):
    stereo = np.stack([noisy, noisy * 0.5])
    enhanced = enhance.enhance_multichannel(stereo, SAMPLE_RATE)
    assert enhanced.shape == stereo.shape
    assert np.std(enhanced[1]) / np.std(enhanced[0]) == pytest.approx(0.5, rel=0.05)


def test_enhance_validates_parameters(noisy):
    with pytest.raises(ValueError, match="harmonics"):
        enhance.enhance(noisy, SAMPLE_RATE, harmonics=1.5)
    with pytest.raises(ValueError, match="clarity_db"):
        enhance.enhance(noisy, SAMPLE_RATE, clarity_db=-1.0)
    with pytest.raises(ValueError, match="reduction_db"):
        enhance.enhance(noisy, SAMPLE_RATE, reduction_db=100.0)


def test_denoise_then_enhance_composes(noisy):
    result = enhance.enhance(denoise.denoise(noisy), SAMPLE_RATE)
    assert len(result) == len(noisy)
    assert np.isfinite(result).all()
