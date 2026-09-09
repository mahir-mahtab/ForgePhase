"""Attack resilience, including the chosen-plaintext key recovery."""

import numpy as np
import pytest

from phaseforge.analysis import attacks, metrics
from phaseforge.audio import drpe as audio_drpe
from phaseforge.image import drpe

FAST = 1000
PASSPHRASE = "correct horse battery staple"


@pytest.fixture
def image():
    rng = np.random.default_rng(0)
    ramp = np.linspace(0, 1, 64)
    return np.clip(rng.random((1, 64, 64)) * 0.3 + ramp[None, None, :], 0, 1)


@pytest.fixture
def encrypted(image):
    return drpe.encrypt(image, PASSPHRASE, iterations=FAST)


def test_undamaged_ciphertext_decrypts_perfectly(image, encrypted):
    cipher, meta = encrypted
    recovered = drpe.decrypt(cipher, PASSPHRASE, meta)
    assert metrics.psnr(image, recovered) > 100


def test_noise_degrades_but_does_not_destroy(image, encrypted):
    cipher, meta = encrypted
    recovered = drpe.decrypt(attacks.add_noise(cipher, 0.05), PASSPHRASE, meta)
    assert metrics.normalized_correlation(image, recovered) > 0.5


def test_more_noise_degrades_further(image, encrypted):
    cipher, meta = encrypted
    mild = drpe.decrypt(attacks.add_noise(cipher, 0.02), PASSPHRASE, meta)
    harsh = drpe.decrypt(attacks.add_noise(cipher, 0.5), PASSPHRASE, meta)
    assert metrics.psnr(image, mild) > metrics.psnr(image, harsh)


def test_occlusion_is_survivable(image, encrypted):
    """DRPE spreads each pixel across the whole ciphertext, so losing a corner
    degrades the image globally rather than removing a region of it."""
    cipher, meta = encrypted
    recovered = drpe.decrypt(attacks.occlude(cipher, 0.10), PASSPHRASE, meta)
    assert metrics.normalized_correlation(image, recovered) > 0.5


def test_quantization_to_8_bits_loses_quality(image, encrypted):
    cipher, meta = encrypted
    recovered = drpe.decrypt(attacks.quantize(cipher, 8), PASSPHRASE, meta)
    assert metrics.psnr(image, recovered) < 100
    assert metrics.normalized_correlation(image, recovered) > 0.5


def test_more_bits_preserve_more(image, encrypted):
    cipher, meta = encrypted
    coarse = drpe.decrypt(attacks.quantize(cipher, 4), PASSPHRASE, meta)
    fine = drpe.decrypt(attacks.quantize(cipher, 16), PASSPHRASE, meta)
    assert metrics.psnr(image, fine) > metrics.psnr(image, coarse)


def test_clip_bounds_signal():
    signal = np.linspace(-1, 1, 100)
    assert np.max(np.abs(attacks.clip(signal, 0.5))) <= 0.5


def test_robustness_report_covers_every_attack(image, encrypted):
    cipher, meta = encrypted
    report = attacks.robustness_report(image, cipher, PASSPHRASE, meta)
    assert set(report) == {"none", "noise_5pct", "noise_20pct", "occlusion_10pct",
                           "quantize_8bit"}
    assert report["none"]["correlation"] > 0.999
    assert report["noise_20pct"]["psnr_db"] < report["noise_5pct"]["psnr_db"]


def test_wrong_key_report_shows_no_recovery(image, encrypted):
    cipher, meta = encrypted
    report = attacks.wrong_key_report(image, cipher, meta, "not the passphrase")
    assert abs(report["correlation"]) < 0.1


@pytest.fixture
def audio():
    t = np.linspace(0, 0.5, 8192, endpoint=False)
    return (0.4 * np.sin(2 * np.pi * 220 * t))[None, :]


def test_audio_robustness_report_uses_audio_metrics(audio):
    cipher, meta = audio_drpe.encrypt(audio, PASSPHRASE, 16000, iterations=FAST)
    report = attacks.robustness_report(audio, cipher, PASSPHRASE, meta)

    assert set(report) == set(attacks.AUDIO_ATTACKS)
    assert "snr_db" in report["none"]
    assert report["none"]["correlation"] > 0.999
    assert report["noise_20pct"]["snr_db"] < report["noise_5pct"]["snr_db"]


def test_audio_wrong_key_report(audio):
    cipher, meta = audio_drpe.encrypt(audio, PASSPHRASE, 16000, iterations=FAST)
    report = attacks.wrong_key_report(audio, cipher, meta, "not the passphrase")
    assert abs(report["correlation"]) < 0.1


def test_chosen_plaintext_attack_breaks_the_scheme():
    """Two probe encryptions under a reused key recover the plaintext exactly,
    with no passphrase -- DRPE's linearity is the whole vulnerability."""
    shape = (64, 64)
    oracle = attacks.build_oracle("a passphrase the attacker never learns")

    rng = np.random.default_rng(1)
    secret = rng.random(shape)
    ciphertext = oracle(secret)

    crack = attacks.chosen_plaintext_attack(oracle, shape)
    recovered = crack(ciphertext)

    assert metrics.normalized_correlation(secret, recovered) > 0.999
    assert np.max(np.abs(recovered - secret)) < 1e-8


def test_chosen_plaintext_attack_generalizes_to_new_images():
    """The recovered masks decrypt images the attacker never probed with."""
    shape = (32, 32)
    oracle = attacks.build_oracle("another secret passphrase")
    crack = attacks.chosen_plaintext_attack(oracle, shape)

    rng = np.random.default_rng(2)
    for seed in range(3):
        target = rng.random(shape)
        assert np.max(np.abs(crack(oracle(target)) - target)) < 1e-8


def test_attack_fails_when_the_key_is_not_reused():
    """Rotating the salt per message defeats the attack -- the mitigation."""
    shape = (32, 32)
    passphrase = "rotating salt"

    def fresh_oracle(image):
        cipher, _ = drpe.encrypt(image, passphrase, salt=None, iterations=FAST)
        return cipher

    crack = attacks.chosen_plaintext_attack(fresh_oracle, shape)
    rng = np.random.default_rng(3)
    secret = rng.random(shape)
    recovered = crack(fresh_oracle(secret))
    assert abs(metrics.normalized_correlation(secret, recovered)) < 0.2
