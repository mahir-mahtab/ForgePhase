"""Proof that the transform seam is real.

The whole project is built so a hand-written FFT can replace NumPy's without
touching a single module. This file verifies that claim now, rather than
discovering it is false on the day the custom backend is written: it registers
an independent radix-2 implementation and runs every module through it.

The implementation below is deliberately naive and lives in the tests -- it is a
control, not the deliverable. When the real ``custom_backend`` is written, it
must pass exactly these tests.
"""

import types

import numpy as np
import pytest

from phaseforge.analysis import attacks, metrics
from phaseforge.audio import denoise as audio_denoise
from phaseforge.audio import drpe as audio_drpe
from phaseforge.audio import enhance as audio_enhance
from phaseforge.core import transform
from phaseforge.image import drpe as image_drpe
from phaseforge.image import freq_edit, watermark

FAST = 1000
PASSPHRASE = "swap test passphrase"
BACKEND = "radix2-reference"


def _radix2(values, sign):
    """Recursive Cooley-Tukey along the last axis; power-of-two lengths only."""
    values = np.asarray(values, dtype=complex)
    n = values.shape[-1]
    if n == 1:
        return values
    if n & (n - 1):
        raise ValueError(f"length must be a power of two, got {n}")

    even = _radix2(values[..., 0::2], sign)
    odd = _radix2(values[..., 1::2], sign)
    factor = np.exp(sign * 2j * np.pi * np.arange(n // 2) / n)
    twiddled = factor * odd
    return np.concatenate([even + twiddled, even - twiddled], axis=-1)


def _fft(x, axis=-1):
    return np.moveaxis(_radix2(np.moveaxis(x, axis, -1), -1.0), -1, axis)


def _ifft(x, axis=-1):
    n = np.shape(x)[axis]
    return np.moveaxis(_radix2(np.moveaxis(x, axis, -1), 1.0), -1, axis) / n


def _fft2(x):
    return _fft(_fft(x, axis=-1), axis=-2)


def _ifft2(x):
    return _ifft(_ifft(x, axis=-1), axis=-2)


@pytest.fixture(scope="module", autouse=True)
def register():
    transform.register_backend(BACKEND, types.SimpleNamespace(
        fft=_fft, ifft=_ifft, fft2=_fft2, ifft2=_ifft2))


@pytest.fixture
def swapped():
    with transform.using_backend(BACKEND):
        yield


def test_reference_matches_numpy(swapped):
    rng = np.random.default_rng(0)
    x = rng.normal(size=(2, 16, 16))
    assert np.allclose(transform.fft2(x), np.fft.fft2(x))


def test_registration_rejects_incomplete_backend():
    with pytest.raises(ValueError, match="missing"):
        transform.register_backend("broken", types.SimpleNamespace(fft=_fft))


def test_image_drpe_under_swapped_backend(swapped):
    rng = np.random.default_rng(1)
    image = rng.random((2, 32, 32))
    cipher, meta = image_drpe.encrypt(image, PASSPHRASE, iterations=FAST)
    recovered = image_drpe.decrypt(cipher, PASSPHRASE, meta)
    assert np.max(np.abs(recovered - image)) < 1e-10


def test_audio_drpe_under_swapped_backend(swapped):
    rng = np.random.default_rng(2)
    signal = rng.normal(size=(1, 2048)) * 0.1
    cipher, meta = audio_drpe.encrypt(signal, PASSPHRASE, 16000, block_size=1024,
                                      iterations=FAST)
    recovered = audio_drpe.decrypt(cipher, PASSPHRASE, meta)
    assert np.max(np.abs(recovered - signal)) < 1e-10


def test_ciphertexts_agree_across_backends():
    """The same passphrase must produce the same ciphertext on any backend."""
    rng = np.random.default_rng(3)
    image = rng.random((1, 16, 16))
    salt = b"fixed-salt-16byt"

    with transform.using_backend("numpy"):
        reference, _ = image_drpe.encrypt(image, PASSPHRASE, salt, iterations=FAST)
    with transform.using_backend(BACKEND):
        swapped_cipher, _ = image_drpe.encrypt(image, PASSPHRASE, salt, iterations=FAST)

    assert np.allclose(reference, swapped_cipher)


def test_cross_backend_decryption(swapped):
    """Encrypt on one backend, decrypt on the other -- files stay portable."""
    rng = np.random.default_rng(4)
    image = rng.random((1, 16, 16))

    with transform.using_backend("numpy"):
        cipher, meta = image_drpe.encrypt(image, PASSPHRASE, iterations=FAST)
    with transform.using_backend(BACKEND):
        recovered = image_drpe.decrypt(cipher, PASSPHRASE, meta)

    assert np.max(np.abs(recovered - image)) < 1e-10


def test_watermark_under_swapped_backend(swapped):
    rng = np.random.default_rng(5)
    image = rng.random((1, 64, 64)) * 0.5
    mark = np.zeros((8, 8))
    mark[2:6, 2:6] = 1.0

    marked = watermark.embed(image, mark, strength=0.2)
    recovered = watermark.extract(image, marked, mark.shape, strength=0.2)
    assert metrics.normalized_correlation(mark, recovered) > 0.99


def test_freq_edit_under_swapped_backend(swapped):
    rng = np.random.default_rng(6)
    image = rng.random((1, 32, 32))
    low = freq_edit.apply_filter(image, "low", cutoff=0.3, filter_shape="ideal")
    high = freq_edit.apply_filter(image, "high", cutoff=0.3, filter_shape="ideal")
    assert np.allclose(low + high, image)


def test_denoise_under_swapped_backend(swapped):
    rng = np.random.default_rng(7)
    signal = rng.normal(size=4096) * 0.05
    cleaned = audio_denoise.denoise(signal, frame_length=256)
    assert len(cleaned) == len(signal)
    assert np.isfinite(cleaned).all()


def test_enhance_under_swapped_backend(swapped):
    t = np.linspace(0, 0.25, 4096, endpoint=False)
    signal = 0.3 * np.sin(2 * np.pi * 400 * t)
    enhanced = audio_enhance.enhance(signal, 16000, frame_length=256)
    assert len(enhanced) == len(signal)
    assert np.isfinite(enhanced).all()


def test_chosen_plaintext_attack_under_swapped_backend(swapped):
    oracle = attacks.build_oracle("unknown to the attacker")
    crack = attacks.chosen_plaintext_attack(oracle, (16, 16))

    rng = np.random.default_rng(8)
    secret = rng.random((16, 16))
    assert np.max(np.abs(crack(oracle(secret)) - secret)) < 1e-8
