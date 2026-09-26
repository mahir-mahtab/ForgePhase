"""Ciphertext robustness attacks and recovery scoring."""

import numpy as np

from ..audio import drpe as audio_drpe
from ..core import transform
from ..image import drpe as image_drpe
from ..keys import derive
from . import metrics


def add_noise(ciphertext, level=0.05, seed=0):
    ciphertext = np.asarray(ciphertext)
    rng = np.random.default_rng(seed)
    scale = level * max(float(np.mean(np.abs(ciphertext))), 1e-12)
    noise = rng.normal(scale=scale, size=ciphertext.shape) + 1j * rng.normal(scale=scale, size=ciphertext.shape)
    return ciphertext + noise


def salt_pepper(ciphertext, amount=0.05, seed=0):
    """Randomly replace complex samples with zero or local extreme values."""
    arr = np.array(ciphertext, copy=True)
    rng = np.random.default_rng(seed)
    mask = rng.random(arr.shape) < amount
    phase = np.angle(arr[mask])
    magnitude = max(float(np.percentile(np.abs(arr), 99)), 1e-12)
    signs = rng.choice([-1.0, 1.0], size=phase.shape)
    arr[mask] = signs * magnitude * np.exp(1j * phase)
    return arr


def occlude(ciphertext, fraction=0.10):
    arr = np.array(ciphertext, copy=True)
    height, width = arr.shape[-2:]
    side = max(1, int(min(height, width) * np.sqrt(fraction)))
    y0 = (height - side) // 2
    x0 = (width - side) // 2
    arr[..., y0:y0 + side, x0:x0 + side] = 0
    return arr


def quantize(ciphertext, bits=8):
    arr = np.asarray(ciphertext)
    levels = 2 ** bits - 1

    def crush(part):
        low, high = float(part.min()), float(part.max())
        if high - low < 1e-15:
            return part
        return np.round((part - low) / (high - low) * levels) / levels * (high - low) + low

    return crush(np.real(arr)) + 1j * crush(np.imag(arr))


def translate(ciphertext, pixels=3):
    """Simulate spatial registration loss in the stored ciphertext components."""
    return np.roll(np.roll(np.asarray(ciphertext), pixels, axis=-2), pixels, axis=-1)


def phase_jitter(ciphertext, radians=0.15, seed=0):
    rng = np.random.default_rng(seed)
    jitter = rng.normal(0.0, radians, size=np.asarray(ciphertext).shape)
    return np.abs(ciphertext) * np.exp(1j * (np.angle(ciphertext) + jitter))


def blur(ciphertext, radius=2):
    """Small separable blur applied independently to real/imaginary planes."""
    radius = max(1, int(radius))
    sigma = max(radius / 1.5, 0.5)
    x = np.arange(-radius, radius + 1, dtype=float)
    kernel = np.exp(-(x * x) / (2 * sigma * sigma))
    kernel /= kernel.sum()

    def smooth(arr):
        out = np.asarray(arr, dtype=float)
        for axis in (-2, -1):
            pad = [(0, 0)] * out.ndim
            pad[axis] = (radius, radius)
            padded = np.pad(out, pad, mode="edge")
            out = np.apply_along_axis(lambda v: np.convolve(v, kernel, mode="valid"), axis, padded)
        return out

    return smooth(np.real(ciphertext)) + 1j * smooth(np.imag(ciphertext))


def clip(signal, threshold=0.5):
    return np.clip(np.asarray(signal), -threshold, threshold)


IMAGE_ATTACKS = {
    "none": lambda c, level=0.0: c,
    "noise_5pct": lambda c, level=0.05: add_noise(c, 0.05),
    "noise_20pct": lambda c, level=0.20: add_noise(c, 0.20),
    "occlusion_10pct": lambda c, level=0.10: occlude(c, 0.10),
    "quantize_8bit": lambda c, level=0.10: quantize(c, 8),
}

IMAGE_EXTRA_ATTACKS = {
    "gaussian_noise": lambda c, level=0.10: add_noise(c, level),
    "salt_pepper": lambda c, level=0.10: salt_pepper(c, level),
    "blur": lambda c, level=0.10: blur(c, max(1, round(1 + level * 4))),
    "translation": lambda c, level=0.10: translate(c, max(1, round(level * 12))),
    "phase_jitter": lambda c, level=0.10: phase_jitter(c, level * 0.75),
    "quantization": lambda c, level=0.10: quantize(c, max(2, round(16 - level * 12))),
}

AUDIO_ATTACKS = {
    "none": lambda c, level=0.0: c,
    "noise_5pct": lambda c, level=0.05: add_noise(c, 0.05),
    "noise_20pct": lambda c, level=0.20: add_noise(c, 0.20),
    "quantize_8bit": lambda c, level=0.10: quantize(c, 8),
    "quantize_16bit": lambda c, level=0.10: quantize(c, 16),
}

AUDIO_EXTRA_ATTACKS = {
    "gaussian_noise": lambda c, level=0.10: add_noise(c, level),
    "phase_jitter": lambda c, level=0.10: phase_jitter(c, level * 0.75),
    "quantization": lambda c, level=0.10: quantize(c, max(2, round(16 - level * 12))),
}


def _dispatch(metadata):
    if metadata.get("kind") == "audio":
        return audio_drpe.decrypt, AUDIO_ATTACKS, metrics.summarize_audio
    return image_drpe.decrypt, IMAGE_ATTACKS, metrics.summarize


def robustness_report(original, ciphertext, passphrase, metadata, attacks=None, level=0.10):
    decrypt, default_attacks, summarize = _dispatch(metadata)
    selected = attacks or default_attacks
    report = {}
    for name, attack in selected.items():
        damaged = attack(ciphertext, 0.0 if name == "none" else level)
        recovered = decrypt(damaged, passphrase, metadata)
        report[name] = summarize(original, recovered)
    return report


def wrong_key_report(original, ciphertext, metadata, wrong_passphrase):
    decrypt, _, summarize = _dispatch(metadata)
    return summarize(original, decrypt(ciphertext, wrong_passphrase, metadata))


def chosen_plaintext_attack(oracle, shape):
    height, width = shape
    impulse = np.zeros(shape)
    impulse[0, 0] = 1.0
    mask_b_estimate = transform.fft2(np.squeeze(oracle(impulse)))
    flat = np.ones(shape)
    flat_spectrum = transform.fft2(np.squeeze(oracle(flat)))
    mask_a_estimate = transform.ifft2(flat_spectrum / mask_b_estimate)

    def crack(ciphertext):
        spectrum = transform.fft2(np.squeeze(ciphertext)) / mask_b_estimate
        return np.abs(transform.ifft2(spectrum) / mask_a_estimate)

    return crack


def build_oracle(passphrase, salt=None, iterations=1000):
    salt = derive.new_salt() if salt is None else salt

    def oracle(image):
        ciphertext, _ = image_drpe.encrypt(image, passphrase, salt, iterations)
        return ciphertext

    return oracle
