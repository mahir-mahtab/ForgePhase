"""Quality metrics for comparing a recovered signal against its original."""

import numpy as np


def _aligned(a, b):
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.shape != b.shape:
        raise ValueError(f"shape mismatch: {a.shape} vs {b.shape}")
    return a, b


def mse(reference, test):
    reference, test = _aligned(reference, test)
    return float(np.mean((reference - test) ** 2))


def psnr(reference, test, peak=1.0):
    """Peak signal-to-noise ratio in dB. Infinite for an exact match."""
    error = mse(reference, test)
    if error == 0.0:
        return float("inf")
    return float(10.0 * np.log10(peak ** 2 / error))


def normalized_correlation(reference, test):
    """Correlation in ``[-1, 1]``; near 0 means no relationship survived."""
    reference, test = _aligned(reference, test)
    a = reference - reference.mean()
    b = test - test.mean()
    denominator = np.sqrt(np.sum(a ** 2) * np.sum(b ** 2))
    if denominator < 1e-12:
        return 0.0
    return float(np.sum(a * b) / denominator)


def snr(reference, test):
    """Signal-to-noise ratio in dB, treating ``test - reference`` as noise."""
    reference, test = _aligned(reference, test)
    signal_power = float(np.sum(reference ** 2))
    noise_power = float(np.sum((reference - test) ** 2))
    if noise_power == 0.0:
        return float("inf")
    if signal_power == 0.0:
        return float("-inf")
    return float(10.0 * np.log10(signal_power / noise_power))


def segmental_snr(reference, test, segment=1024):
    """Mean per-segment SNR -- closer to perceived quality than global SNR."""
    reference, test = _aligned(reference, test)
    reference = reference.ravel()
    test = test.ravel()

    n_segments = max(len(reference) // segment, 1)
    scores = []
    for i in range(n_segments):
        window = slice(i * segment, (i + 1) * segment)
        signal_power = float(np.sum(reference[window] ** 2))
        if signal_power <= 1e-12:
            continue  # silent segment: no signal to score against
        noise_power = float(np.sum((reference[window] - test[window]) ** 2))
        # An exact match scores as infinite, matching snr() rather than
        # dropping the segment and reporting nan for a perfect reconstruction.
        scores.append(float("inf") if noise_power <= 1e-12
                      else 10.0 * np.log10(signal_power / noise_power))
    return float(np.mean(scores)) if scores else float("nan")


def summarize(reference, test, peak=1.0):
    """All the image-oriented metrics at once."""
    return {
        "mse": mse(reference, test),
        "psnr_db": psnr(reference, test, peak),
        "correlation": normalized_correlation(reference, test),
    }


def summarize_audio(reference, test, segment=1024):
    """The audio-oriented metrics: SNR carries more meaning than PSNR here."""
    return {
        "mse": mse(reference, test),
        "snr_db": snr(reference, test),
        "segmental_snr_db": segmental_snr(reference, test, segment),
        "correlation": normalized_correlation(reference, test),
    }
