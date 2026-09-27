"""Passphrase-derived key material."""

import numpy as np
import pytest

from phaseforge.keys import derive

FAST = 1000


def test_same_passphrase_and_salt_reproduce_masks():
    salt = b"fixed-salt-16byt"
    first = derive.derive_masks("correct horse", salt, (16, 16), iterations=FAST)
    second = derive.derive_masks("correct horse", salt, (16, 16), iterations=FAST)
    for a, b in zip(first, second):
        assert np.array_equal(a, b)


def test_different_passphrase_gives_different_masks():
    salt = b"fixed-salt-16byt"
    a = derive.derive_masks("correct horse", salt, (16, 16), iterations=FAST)[0]
    b = derive.derive_masks("correct horsf", salt, (16, 16), iterations=FAST)[0]
    assert not np.allclose(a, b)


def test_different_salt_gives_different_masks():
    a = derive.derive_masks("same pass", b"salt-one-1234567", (16, 16), iterations=FAST)[0]
    b = derive.derive_masks("same pass", b"salt-two-1234567", (16, 16), iterations=FAST)[0]
    assert not np.allclose(a, b)


def test_index_separates_masks():
    key = derive.derive_key("pass", b"salt-value-16byt", FAST)
    first = derive.masks_from_key(key, (32,), index=0)[0]
    second = derive.masks_from_key(key, (32,), index=1)[0]
    assert not np.allclose(first, second)


def test_mask_pair_within_one_call_is_independent():
    key = derive.derive_key("pass", b"salt-value-16byt", FAST)
    a, b = derive.masks_from_key(key, (64,), count=2, index=0)
    assert not np.allclose(a, b)


def test_masks_are_uniform_in_unit_interval():
    key = derive.derive_key("pass", b"salt-value-16byt", FAST)
    mask = derive.masks_from_key(key, (256, 256), count=1)[0]
    assert mask.min() >= 0.0 and mask.max() < 1.0
    assert abs(mask.mean() - 0.5) < 0.01


def test_phase_mask_is_unit_modulus():
    key = derive.derive_key("pass", b"salt-value-16byt", FAST)
    mask = derive.masks_from_key(key, (128,), count=1)[0]
    assert np.allclose(np.abs(derive.phase_mask(mask)), 1.0)


def test_conjugate_mask_inverts_phase_mask():
    key = derive.derive_key("pass", b"salt-value-16byt", FAST)
    mask = derive.masks_from_key(key, (128,), count=1)[0]
    product = derive.phase_mask(mask) * derive.conjugate_phase_mask(mask)
    assert np.allclose(product, 1.0)


def test_new_salt_is_random_and_correct_length():
    salts = {derive.new_salt() for _ in range(10)}
    assert len(salts) == 10
    assert all(len(s) == derive.SALT_BYTES for s in salts)


@pytest.mark.parametrize("passphrase", ["ascii pass", "পাসওয়ার্ড", "emoji \U0001f510"])
def test_unicode_passphrases_work(passphrase):
    salt = b"fixed-salt-16byt"
    a = derive.derive_masks(passphrase, salt, (8, 8), iterations=FAST)[0]
    b = derive.derive_masks(passphrase, salt, (8, 8), iterations=FAST)[0]
    assert np.array_equal(a, b)


def test_numpy_array_key_reproduces_masks():
    salt = b"fixed-salt-16byt"
    key_arr = np.random.default_rng(42).random((3, 32, 32))
    a = derive.derive_masks(key_arr, salt, (16, 16), iterations=FAST)
    b = derive.derive_masks(key_arr.copy(), salt, (16, 16), iterations=FAST)
    for mask_a, mask_b in zip(a, b):
        assert np.array_equal(mask_a, mask_b)


def test_different_numpy_array_gives_different_masks():
    salt = b"fixed-salt-16byt"
    key1 = np.ones((2, 100))
    key2 = np.ones((2, 100))
    key2[0, 0] = 1.0001
    a = derive.derive_masks(key1, salt, (16, 16), iterations=FAST)[0]
    b = derive.derive_masks(key2, salt, (16, 16), iterations=FAST)[0]
    assert not np.allclose(a, b)


def test_numpy_array_invalid_rejected():
    salt = b"fixed-salt-16byt"
    with pytest.raises(ValueError, match="non-finite"):
        derive.derive_key(np.array([1.0, float("nan")]), salt, FAST)

    with pytest.raises(ValueError, match="empty"):
        derive.derive_key(np.array([]), salt, FAST)

    with pytest.raises(TypeError):
        derive.derive_key(12345, salt, FAST)

