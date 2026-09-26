"""Signal and image quality/security metrics."""

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
    error = mse(reference, test)
    if error == 0.0:
        return float("inf")
    return float(10.0 * np.log10(peak ** 2 / error))


def normalized_correlation(reference, test):
    reference, test = _aligned(reference, test)
    a = reference - reference.mean()
    b = test - test.mean()
    denominator = np.sqrt(np.sum(a ** 2) * np.sum(b ** 2))
    if denominator < 1e-12:
        return 0.0
    return float(np.sum(a * b) / denominator)


def snr(reference, test):
    reference, test = _aligned(reference, test)
    signal_power = float(np.sum(reference ** 2))
    noise_power = float(np.sum((reference - test) ** 2))
    if noise_power == 0.0:
        return float("inf")
    if signal_power == 0.0:
        return float("-inf")
    return float(10.0 * np.log10(signal_power / noise_power))


def segmental_snr(reference, test, segment=1024):
    reference, test = _aligned(reference, test)
    reference = reference.ravel()
    test = test.ravel()
    n_segments = max(len(reference) // segment, 1)
    scores = []
    for i in range(n_segments):
        window = slice(i * segment, (i + 1) * segment)
        signal_power = float(np.sum(reference[window] ** 2))
        if signal_power <= 1e-12:
            continue
        noise_power = float(np.sum((reference[window] - test[window]) ** 2))
        scores.append(float("inf") if noise_power <= 1e-12 else 10.0 * np.log10(signal_power / noise_power))
    return float(np.mean(scores)) if scores else float("nan")


def _gray(image):
    a = np.asarray(image, dtype=np.float64)
    if a.ndim == 2:
        return a
    if a.ndim == 3 and a.shape[0] == 1:
        return a[0]
    if a.ndim == 3:
        return 0.299 * a[0] + 0.587 * a[1] + 0.114 * a[2]
    raise ValueError(f"expected image array, got {a.shape}")


def entropy(image, bins=256):
    values = np.clip(_gray(image), 0.0, 1.0)
    counts, _ = np.histogram(values, bins=bins, range=(0.0, 1.0))
    probabilities = counts.astype(np.float64)
    probabilities /= max(probabilities.sum(), 1.0)
    probabilities = probabilities[probabilities > 0]
    return float(-np.sum(probabilities * np.log2(probabilities)))


def adjacent_correlations(image):
    """Horizontal, vertical and diagonal pixel correlations."""
    a = _gray(image)
    pairs = {
        "horizontal": (a[:, :-1], a[:, 1:]),
        "vertical": (a[:-1, :], a[1:, :]),
        "diagonal": (a[:-1, :-1], a[1:, 1:]),
    }
    return {name: normalized_correlation(x, y) for name, (x, y) in pairs.items()}


def npcr(reference, test, threshold=1 / 255):
    a, b = _aligned(_gray(reference), _gray(test))
    changed = np.abs(a - b) > threshold
    return float(np.mean(changed) * 100.0)


def uaci(reference, test):
    a, b = _aligned(_gray(reference), _gray(test))
    return float(np.mean(np.abs(a - b)) * 100.0)


def histogram(image, bins=32):
    values = np.clip(_gray(image), 0.0, 1.0)
    counts, edges = np.histogram(values, bins=bins, range=(0.0, 1.0))
    return {"bins": [float(x) for x in ((edges[:-1] + edges[1:]) / 2)], "counts": [int(x) for x in counts]}


def difference_heatmap(reference, test, size=48):
    a, b = _aligned(_gray(reference), _gray(test))
    diff = np.abs(a - b)
    h, w = diff.shape
    rows = np.linspace(0, h, min(size, h) + 1, dtype=int)
    cols = np.linspace(0, w, min(size, w) + 1, dtype=int)
    out = np.zeros((len(rows) - 1, len(cols) - 1), dtype=np.float64)
    for i in range(out.shape[0]):
        for j in range(out.shape[1]):
            block = diff[rows[i]:rows[i + 1], cols[j]:cols[j + 1]]
            out[i, j] = float(block.mean()) if block.size else 0.0
    return out


def summarize(reference, test, peak=1.0):
    return {
        "mse": mse(reference, test),
        "psnr_db": psnr(reference, test, peak),
        "correlation": normalized_correlation(reference, test),
    }

def summarize_audio(reference, test, segment=1024):
    return {"mse": mse(reference, test), "snr_db": snr(reference, test), "segmental_snr_db": segmental_snr(reference, test, segment), "correlation": normalized_correlation(reference, test)}
