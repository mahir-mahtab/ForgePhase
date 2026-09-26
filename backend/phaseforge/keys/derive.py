"""Passphrase-derived random phase masks.

The masks are DRPE's key material. They are never stored: a passphrase plus the
(non-secret) salt regenerates them exactly, on any machine, forever.

Cost is deliberately split. :func:`derive_key` runs PBKDF2 and is slow by
design -- that is what makes brute-forcing a weak passphrase expensive. It runs
once per file. :func:`masks_from_key` is cheap and runs per channel or per audio
block, so encrypting a long signal does not pay the PBKDF2 cost thousands of
times over.
"""

import hashlib
import secrets

import numpy as np

DEFAULT_ITERATIONS = 200_000
SALT_BYTES = 16
_KEY_BYTES = 32


def new_salt():
    """A fresh random salt. Not secret -- it is stored beside the ciphertext."""
    return secrets.token_bytes(SALT_BYTES)


def derive_key(passphrase, salt, iterations=DEFAULT_ITERATIONS):
    """Stretch a passphrase into a 32-byte master key (PBKDF2-HMAC-SHA256)."""
    if isinstance(passphrase, str):
        passphrase = passphrase.encode("utf-8")
    return hashlib.pbkdf2_hmac("sha256", passphrase, salt, iterations, _KEY_BYTES)


def masks_from_key(key, shape, count=2, index=0):
    """Generate ``count`` uniform ``[0, 1)`` mask arrays of ``shape``.

    ``index`` namespaces the masks so that separate colour channels and audio
    blocks never reuse the same random field, which would leak structure.
    """
    entropy = [int.from_bytes(key, "big"), int(index)]
    rng = np.random.default_rng(np.random.SeedSequence(entropy))
    return [rng.random(shape) for _ in range(count)]


def derive_masks(passphrase, salt, shape, count=2, index=0, iterations=DEFAULT_ITERATIONS):
    """Convenience wrapper: passphrase straight to mask arrays."""
    return masks_from_key(derive_key(passphrase, salt, iterations), shape, count, index)


def phase_mask(uniform):
    """Turn a uniform ``[0, 1)`` array into a unit-modulus phase factor."""
    return np.exp(2j * np.pi * uniform)


def conjugate_phase_mask(uniform):
    """The decryption counterpart of :func:`phase_mask`."""
    return np.exp(-2j * np.pi * uniform)
