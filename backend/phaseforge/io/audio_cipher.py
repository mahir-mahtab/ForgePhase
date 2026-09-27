"""WAV codec for audio DRPE ciphertext.

Block DRPE produces complex ``(channels, n_blocks, block_size)`` data. It is
stored as a single 32-bit float WAV that plays as white noise: each channel
holds its real samples followed by its imaginary samples, so the file keeps the
input's channel count and runs twice as long. Samples are scaled into
``[-1, 1]`` so players do not clip them; the scale and the non-secret DRPE
metadata travel in a private RIFF chunk that ordinary players ignore.
"""

import base64
import io
import json
import struct

import numpy as np
import soundfile as sf

from ..audio import drpe
from ..keys import derive

FORMAT_VERSION = 1
CHUNK_ID = b"pfge"


class CipherAudioTooLarge(ValueError):
    """Raised before decoding a cipher WAV that exceeds configured limits."""


def encode(ciphertext, metadata):
    """Return one noise-like WAV holding a complex audio ciphertext."""
    ciphertext = np.asarray(ciphertext)
    if ciphertext.ndim != 3 or not np.iscomplexobj(ciphertext):
        raise ValueError("audio ciphertext must be a 3D complex array")
    if not np.all(np.isfinite(ciphertext)):
        raise ValueError("audio ciphertext contains non-finite values")

    channels, n_blocks, block_size = ciphertext.shape
    flat = ciphertext.reshape(channels, n_blocks * block_size)
    samples = np.concatenate([flat.real, flat.imag], axis=1)
    scale = float(np.max(np.abs(samples))) or 1.0

    payload = {
        "format_version": FORMAT_VERSION,
        "kind": "audio",
        "salt": base64.b64encode(bytes(metadata["salt"])).decode("ascii"),
        "iterations": int(metadata["iterations"]),
        "sample_rate": int(metadata["sample_rate"]),
        "block_size": int(metadata["block_size"]),
        "channels": int(metadata["channels"]),
        "length": int(metadata["length"]),
        "scale": scale,
    }

    buffer = io.BytesIO()
    sf.write(buffer, (samples / scale).T.astype(np.float32), payload["sample_rate"],
             subtype="FLOAT", format="WAV")
    return _append_chunk(buffer.getvalue(), CHUNK_ID,
                         json.dumps(payload, separators=(",", ":")).encode("utf-8"))


def is_cipher_wav(payload):
    """True if ``payload`` is a WAV carrying PhaseForge cipher metadata."""
    try:
        return _find_chunk(payload, CHUNK_ID) is not None
    except ValueError:
        return False


def decode(payload, *, max_samples=None):
    """Decode and validate a cipher WAV made by :func:`encode`.

    Returns ``(complex_ciphertext, metadata)`` in the shape
    :func:`phaseforge.audio.drpe.decrypt` expects, including salt bytes.
    """
    raw = _find_chunk(payload, CHUNK_ID)
    if raw is None:
        raise ValueError("that file is not a PhaseForge cipher WAV")
    try:
        stored = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        raise ValueError("cipher WAV metadata is unreadable") from None
    if not isinstance(stored, dict):
        raise ValueError("cipher WAV metadata must be an object")
    if stored.get("format_version") != FORMAT_VERSION:
        raise ValueError(f"unsupported cipher WAV version {stored.get('format_version')!r}")

    try:
        salt = base64.b64decode(stored["salt"], validate=True)
        scale = float(stored["scale"])
        metadata = {
            "kind": stored["kind"],
            "salt": salt,
            "iterations": int(stored["iterations"]),
            "sample_rate": int(stored["sample_rate"]),
            "block_size": int(stored["block_size"]),
            "channels": int(stored["channels"]),
            "length": int(stored["length"]),
        }
    except (KeyError, TypeError, ValueError):
        raise ValueError("cipher WAV metadata is incomplete or invalid") from None
    if len(salt) != derive.SALT_BYTES:
        raise ValueError("cipher WAV contains an invalid salt length")
    if not np.isfinite(scale) or scale <= 0:
        raise ValueError("cipher WAV has an invalid scale")
    drpe.validate_block_size(metadata["block_size"])

    channels, block_size = metadata["channels"], metadata["block_size"]
    if metadata["length"] < 1 or channels < 1:
        raise ValueError("cipher WAV metadata has invalid dimensions")
    n_blocks = -(-metadata["length"] // block_size)
    frames = 2 * n_blocks * block_size
    if max_samples is not None and metadata["length"] > max_samples:
        raise CipherAudioTooLarge("encrypted audio exceeds the length limit")

    try:
        info = sf.info(io.BytesIO(payload))
        if info.channels != channels or info.frames != frames:
            raise ValueError("cipher WAV dimensions do not match its metadata")
        samples, _ = sf.read(io.BytesIO(payload), dtype="float64", always_2d=True)
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("could not read the cipher WAV") from error

    samples = samples.T * scale
    half = n_blocks * block_size
    ciphertext = (samples[:, :half] + 1j * samples[:, half:]).reshape(
        channels, n_blocks, block_size)
    drpe.validate_ciphertext(ciphertext, metadata)
    return ciphertext, metadata


def _append_chunk(wav, chunk_id, data):
    if wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        raise ValueError("expected a RIFF/WAVE file")
    chunk = chunk_id + struct.pack("<I", len(data)) + data + (b"\0" if len(data) % 2 else b"")
    body = wav[8:] + chunk
    return b"RIFF" + struct.pack("<I", len(body)) + body


def _find_chunk(wav, chunk_id):
    """Return the contents of the first ``chunk_id`` chunk, or ``None``."""
    if len(wav) < 12 or wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        return None
    offset = 12
    while offset + 8 <= len(wav):
        current, size = wav[offset:offset + 4], struct.unpack("<I", wav[offset + 4:offset + 8])[0]
        start = offset + 8
        if start + size > len(wav):
            raise ValueError("truncated RIFF chunk")
        if current == chunk_id:
            return wav[start:start + size]
        offset = start + size + (size % 2)
    return None
