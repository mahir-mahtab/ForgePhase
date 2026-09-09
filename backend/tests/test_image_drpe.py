"""Image DRPE: exact recovery with the key, nothing without it."""

import numpy as np
import pytest

from phaseforge.analysis import metrics
from phaseforge.core import transform
from phaseforge.image import drpe

FAST = 1000
PASSPHRASE = "correct horse battery staple"


@pytest.fixture
def grey():
    rng = np.random.default_rng(0)
    return rng.random((1, 64, 64))


@pytest.fixture
def colour():
    rng = np.random.default_rng(1)
    return rng.random((3, 32, 48))


def test_round_trip_is_exact(grey):
    cipher, meta = drpe.encrypt(grey, PASSPHRASE, iterations=FAST)
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert np.max(np.abs(recovered - grey)) < 1e-10


def test_round_trip_colour_and_non_power_of_two(colour):
    cipher, meta = drpe.encrypt(colour, PASSPHRASE, iterations=FAST)
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert recovered.shape == colour.shape
    assert np.max(np.abs(recovered - colour)) < 1e-10


def test_accepts_bare_2d_image():
    rng = np.random.default_rng(2)
    image = rng.random((32, 32))
    cipher, meta = drpe.encrypt(image, PASSPHRASE, iterations=FAST)
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert np.max(np.abs(recovered[0] - image)) < 1e-10


def test_wrong_passphrase_recovers_nothing(grey):
    cipher, meta = drpe.encrypt(grey, PASSPHRASE, iterations=FAST)
    recovered = drpe.decrypt(cipher, "wrong passphrase", meta)
    assert abs(metrics.normalized_correlation(grey, recovered)) < 0.1


def test_ciphertext_is_noise_like(grey):
    """A flat spectrum and no visible structure -- the point of DRPE."""
    cipher, _ = drpe.encrypt(grey, PASSPHRASE, iterations=FAST)
    magnitude = np.abs(cipher)
    assert abs(metrics.normalized_correlation(grey, magnitude)) < 0.1

    spectrum = np.abs(transform.fft2(magnitude[0]))
    interior = np.delete(spectrum.ravel(), 0)  # ignore DC
    assert interior.std() / interior.mean() < 1.5


def test_ciphertext_is_complex(grey):
    cipher, _ = drpe.encrypt(grey, PASSPHRASE, iterations=FAST)
    assert np.iscomplexobj(cipher)
    assert np.abs(np.imag(cipher)).max() > 1e-6


def test_padding_recorded_for_non_power_of_two():
    rng = np.random.default_rng(3)
    image = rng.random((1, 50, 30))
    cipher, meta = drpe.encrypt(image, PASSPHRASE, iterations=FAST)
    assert tuple(meta["original_shape"]) == (1, 50, 30)
    assert cipher.shape == (1, 64, 32)


def test_reusing_salt_reproduces_ciphertext(grey):
    salt = b"fixed-salt-16byt"
    first, _ = drpe.encrypt(grey, PASSPHRASE, salt, iterations=FAST)
    second, _ = drpe.encrypt(grey, PASSPHRASE, salt, iterations=FAST)
    assert np.allclose(first, second)


def test_fresh_salt_changes_ciphertext(grey):
    first, _ = drpe.encrypt(grey, PASSPHRASE, iterations=FAST)
    second, _ = drpe.encrypt(grey, PASSPHRASE, iterations=FAST)
    assert not np.allclose(first, second)


def test_channels_use_independent_masks(colour):
    """Identical channels must not encrypt to identical ciphertext."""
    flat = np.stack([np.full((32, 32), 0.5)] * 3)
    cipher, _ = drpe.encrypt(flat, PASSPHRASE, iterations=FAST)
    assert not np.allclose(cipher[0], cipher[1])


def test_rejects_audio_metadata(grey):
    cipher, meta = drpe.encrypt(grey, PASSPHRASE, iterations=FAST)
    meta["kind"] = "audio"
    with pytest.raises(ValueError, match="expected image ciphertext"):
        drpe.decrypt(cipher, PASSPHRASE, meta)
