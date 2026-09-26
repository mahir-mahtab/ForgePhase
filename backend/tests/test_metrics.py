"""Quality metrics."""

import numpy as np
import pytest

from phaseforge.analysis import metrics


@pytest.fixture
def signal():
    rng = np.random.default_rng(0)
    return rng.random((16, 16))


def test_identical_inputs_are_perfect(signal):
    assert metrics.mse(signal, signal) == 0.0
    assert metrics.psnr(signal, signal) == float("inf")
    assert metrics.snr(signal, signal) == float("inf")
    assert np.isclose(metrics.normalized_correlation(signal, signal), 1.0)


def test_psnr_falls_as_error_grows(signal):
    rng = np.random.default_rng(1)
    mild = signal + rng.normal(scale=0.01, size=signal.shape)
    harsh = signal + rng.normal(scale=0.20, size=signal.shape)
    assert metrics.psnr(signal, mild) > metrics.psnr(signal, harsh)


def test_correlation_of_unrelated_signals_is_near_zero():
    rng = np.random.default_rng(2)
    a, b = rng.random((64, 64)), rng.random((64, 64))
    assert abs(metrics.normalized_correlation(a, b)) < 0.1


def test_correlation_detects_inversion(signal):
    assert np.isclose(metrics.normalized_correlation(signal, -signal), -1.0)


def test_correlation_is_scale_invariant(signal):
    assert np.isclose(metrics.normalized_correlation(signal, signal * 5 + 2), 1.0)


def test_correlation_handles_constant_input(signal):
    assert metrics.normalized_correlation(signal, np.ones_like(signal)) == 0.0


def test_snr_is_negative_when_noise_dominates():
    rng = np.random.default_rng(3)
    reference = rng.normal(scale=0.01, size=1000)
    noisy = reference + rng.normal(scale=1.0, size=1000)
    assert metrics.snr(reference, noisy) < 0


def test_segmental_snr_runs_over_segments():
    rng = np.random.default_rng(4)
    reference = rng.normal(size=4096)
    test = reference + rng.normal(scale=0.01, size=4096)
    assert metrics.segmental_snr(reference, test, segment=1024) > 20


def test_segmental_snr_is_infinite_for_an_exact_match():
    rng = np.random.default_rng(5)
    reference = rng.normal(size=4096)
    assert metrics.segmental_snr(reference, reference) == float("inf")


def test_segmental_snr_is_nan_when_there_is_no_signal():
    silence = np.zeros(4096)
    assert np.isnan(metrics.segmental_snr(silence, silence))


def test_summarize_audio_reports_audio_metrics(signal):
    summary = metrics.summarize_audio(signal.ravel(), signal.ravel())
    assert set(summary) == {"mse", "snr_db", "segmental_snr_db", "correlation"}


def test_shape_mismatch_is_rejected(signal):
    with pytest.raises(ValueError, match="shape mismatch"):
        metrics.mse(signal, np.zeros((8, 8)))


def test_summarize_reports_every_metric(signal):
    summary = metrics.summarize(signal, signal)
    assert set(summary) == {"mse", "psnr_db", "correlation"}
