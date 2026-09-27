"""Audio DRPE: block-based encryption of signed waveforms."""

import numpy as np
import pytest

from phaseforge.analysis import metrics
from phaseforge.audio import drpe

FAST = 1000
PASSPHRASE = "correct horse battery staple"
SAMPLE_RATE = 16000


@pytest.fixture
def mono():
    t = np.linspace(0, 1, SAMPLE_RATE, endpoint=False)
    return (0.4 * np.sin(2 * np.pi * 220 * t))[None, :]


@pytest.fixture
def stereo():
    t = np.linspace(0, 0.5, SAMPLE_RATE // 2, endpoint=False)
    return np.stack([0.4 * np.sin(2 * np.pi * 220 * t), 0.3 * np.sin(2 * np.pi * 330 * t)])


def test_round_trip_is_exact(mono):
    cipher, meta = drpe.encrypt(mono, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert recovered.shape == mono.shape
    assert np.max(np.abs(recovered - mono)) < 1e-10


def test_round_trip_stereo(stereo):
    cipher, meta = drpe.encrypt(stereo, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert recovered.shape == stereo.shape
    assert np.max(np.abs(recovered - stereo)) < 1e-10


def test_negative_samples_survive(mono):
    """The modulus would destroy sign, so decryption must take the real part."""
    cipher, meta = drpe.encrypt(mono, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert recovered.min() < -0.1
    assert np.max(np.abs(recovered - mono)) < 1e-10


def test_accepts_bare_1d_signal():
    rng = np.random.default_rng(0)
    signal = rng.normal(size=5000) * 0.1
    cipher, meta = drpe.encrypt(signal, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert np.max(np.abs(recovered[0] - signal)) < 1e-10


def test_length_not_a_multiple_of_block_size():
    rng = np.random.default_rng(1)
    signal = rng.normal(size=4096 * 3 + 101)[None, :] * 0.1
    cipher, meta = drpe.encrypt(signal, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert recovered.shape == signal.shape
    assert np.max(np.abs(recovered - signal)) < 1e-10


def test_wrong_passphrase_recovers_nothing(mono):
    cipher, meta = drpe.encrypt(mono, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    recovered = drpe.decrypt(cipher, "wrong passphrase", meta)
    assert abs(metrics.normalized_correlation(mono, recovered)) < 0.1


def test_ciphertext_sounds_like_noise(mono):
    """A pure tone has a peaky spectrum; its ciphertext must not."""
    cipher, _ = drpe.encrypt(mono, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    flat = np.real(cipher).ravel()
    assert abs(metrics.normalized_correlation(mono.ravel(), flat[:mono.size])) < 0.1


def test_blocks_use_independent_masks():
    """Repeating blocks must not encrypt to repeating ciphertext."""
    signal = np.tile(np.linspace(-0.5, 0.5, 4096), 3)[None, :]
    cipher, _ = drpe.encrypt(signal, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    assert not np.allclose(cipher[0, 0], cipher[0, 1])


def test_channels_use_independent_masks():
    identical = np.stack([np.linspace(-0.5, 0.5, 8192)] * 2)
    cipher, _ = drpe.encrypt(identical, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    assert not np.allclose(cipher[0], cipher[1])


def test_block_size_must_be_power_of_two(mono):
    with pytest.raises(ValueError, match="power of two"):
        drpe.encrypt(mono, PASSPHRASE, SAMPLE_RATE, block_size=3000, iterations=FAST)


@pytest.mark.parametrize("block_size", [1024, 2048, 8192])
def test_other_block_sizes_round_trip(mono, block_size):
    cipher, meta = drpe.encrypt(mono, PASSPHRASE, SAMPLE_RATE, block_size=block_size,
                                iterations=FAST)
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert np.max(np.abs(recovered - mono)) < 1e-10


def test_rejects_image_metadata(mono):
    cipher, meta = drpe.encrypt(mono, PASSPHRASE, SAMPLE_RATE, iterations=FAST)
    meta["kind"] = "image"
    with pytest.raises(ValueError, match="expected audio ciphertext"):
        drpe.decrypt(cipher, PASSPHRASE, meta)


def test_round_trip_with_numpy_audio_key(mono):
    key_audio = np.random.default_rng(123).normal(size=(1, 5000))
    cipher, meta = drpe.encrypt(mono, key_audio, SAMPLE_RATE, iterations=FAST)
    recovered = drpe.decrypt(cipher, key_audio, meta)
    assert recovered.shape == mono.shape
    assert np.max(np.abs(recovered - mono)) < 1e-10


def test_round_trip_with_numpy_image_key(mono):
    key_img = np.random.default_rng(456).random((3, 32, 32))
    cipher, meta = drpe.encrypt(mono, key_img, SAMPLE_RATE, iterations=FAST)
    recovered = drpe.decrypt(cipher, key_img, meta)
    assert recovered.shape == mono.shape
    assert np.max(np.abs(recovered - mono)) < 1e-10


def test_wrong_numpy_key_recovers_noise(mono):
    key1 = np.ones((1, 500))
    key2 = np.zeros((1, 500))
    cipher, meta = drpe.encrypt(mono, key1, SAMPLE_RATE, iterations=FAST)
    recovered = drpe.decrypt(cipher, key2, meta)
    assert abs(metrics.normalized_correlation(mono, recovered)) < 0.1

