"""Attack resilience testing.

Two separate things live here.

Robustness attacks damage a ciphertext and measure how much of the plaintext
still survives decryption with the correct key -- noise, occlusion, coarse
quantization.

The chosen-plaintext attack is different in kind: it recovers the keys outright,
without the passphrase. DRPE is entirely linear, and :func:`chosen_plaintext_attack`
turns that into a total break using two probe encryptions under a reused key.
It is exact, not approximate, which is the point -- key reuse is the flaw, and
the demonstration is the strongest argument in the writeup for why a
production system would need a nonlinear step.
"""

import numpy as np

from ..audio import drpe as audio_drpe
from ..core import transform
from ..image import drpe as image_drpe
from ..keys import derive
from . import metrics


def add_noise(ciphertext, level=0.05, seed=0):
    """Additive complex Gaussian noise, scaled relative to ciphertext energy."""
    ciphertext = np.asarray(ciphertext)
    rng = np.random.default_rng(seed)
    scale = level * float(np.mean(np.abs(ciphertext)))
    noise = rng.normal(scale=scale, size=ciphertext.shape) + \
        1j * rng.normal(scale=scale, size=ciphertext.shape)
    return ciphertext + noise


def occlude(ciphertext, fraction=0.1):
    """Zero a square block of the ciphertext, as if part of the file were lost."""
    ciphertext = np.array(ciphertext, copy=True)
    height, width = ciphertext.shape[-2:]
    block_h = int(height * np.sqrt(fraction))
    block_w = int(width * np.sqrt(fraction))
    ciphertext[..., :block_h, :block_w] = 0
    return ciphertext


def quantize(ciphertext, bits=8):
    """Coarsely quantize real and imaginary parts, as a lossy-storage stand-in."""
    ciphertext = np.asarray(ciphertext)
    levels = 2 ** bits - 1

    def crush(part):
        low, high = float(part.min()), float(part.max())
        if high - low < 1e-15:
            return part
        step = (high - low) / levels
        return np.round((part - low) / step) * step + low

    return crush(np.real(ciphertext)) + 1j * crush(np.imag(ciphertext))


def clip(signal, threshold=0.5):
    """Hard-clip a waveform, simulating a too-hot playback chain."""
    return np.clip(np.asarray(signal), -threshold, threshold)


IMAGE_ATTACKS = {
    "none": lambda c: c,
    "noise_5pct": lambda c: add_noise(c, 0.05),
    "noise_20pct": lambda c: add_noise(c, 0.20),
    "occlusion_10pct": lambda c: occlude(c, 0.10),
    "quantize_8bit": lambda c: quantize(c, 8),
}

AUDIO_ATTACKS = {
    "none": lambda c: c,
    "noise_5pct": lambda c: add_noise(c, 0.05),
    "noise_20pct": lambda c: add_noise(c, 0.20),
    "quantize_8bit": lambda c: quantize(c, 8),
    "quantize_16bit": lambda c: quantize(c, 16),
}


def _dispatch(metadata):
    """Pick the decryptor, default attack set, and metric summary for a container."""
    if metadata.get("kind") == "audio":
        return audio_drpe.decrypt, AUDIO_ATTACKS, metrics.summarize_audio
    return image_drpe.decrypt, IMAGE_ATTACKS, metrics.summarize


def robustness_report(original, ciphertext, passphrase, metadata, attacks=None):
    """Decrypt after each attack and report how much of the original survives.

    Handles image and audio containers alike, choosing the appropriate attack
    set and metrics from the container's own metadata.
    """
    decrypt, default_attacks, summarize = _dispatch(metadata)
    attacks = attacks or default_attacks

    report = {}
    for name, attack in attacks.items():
        recovered = decrypt(attack(ciphertext), passphrase, metadata)
        report[name] = summarize(original, recovered)
    return report


def wrong_key_report(original, ciphertext, metadata, wrong_passphrase):
    """Metrics for decryption with an incorrect passphrase."""
    decrypt, _, summarize = _dispatch(metadata)
    return summarize(original, decrypt(ciphertext, wrong_passphrase, metadata))


def chosen_plaintext_attack(oracle, shape):
    """Recover both DRPE masks from two probe encryptions under a reused key.

    ``oracle`` encrypts an arbitrary ``shape``-sized image with the unknown key
    and returns the raw ciphertext. ``shape`` must be a power of two in each
    dimension so the oracle performs no padding.

    Returns a ``crack`` callable that decrypts any ciphertext produced under
    that same key, with no passphrase.

    Why it works: encryption is ``psi = IFT{FT{f . M1} . M2}``, linear in ``f``.
    Probing with an impulse makes ``f . M1`` a scaled impulse whose transform is
    flat, so ``FT{psi}`` is the frequency mask ``M2`` up to a unit-modulus
    constant. Probing with a flat image then exposes ``M1``. The leftover
    constant cancels between the two, so recovery is exact.
    """
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
    """An encryption oracle that reuses one key -- the flaw the attack exploits.

    Iterations are lowered because the oracle is called repeatedly and PBKDF2
    cost is irrelevant to an attack that never guesses the passphrase.
    """
    salt = derive.new_salt() if salt is None else salt

    def oracle(image):
        ciphertext, _ = image_drpe.encrypt(image, passphrase, salt, iterations)
        return ciphertext

    return oracle
