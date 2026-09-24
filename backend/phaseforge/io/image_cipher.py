"""PNG codec for image DRPE ciphertext.

The image transform produces complex values, while ordinary image formats only
store real pixels.  The default format is a single 16-bit grayscale PNG that
looks like pure noise: every real plane is stacked above every imaginary plane,
colour channels one after another, and the non-secret transform metadata rides
along as PNG text data.
"""

import base64
import io
import json
from copy import deepcopy

import numpy as np
from PIL import Image, PngImagePlugin

from ..keys import derive


FORMAT_VERSION = 1
METADATA_KEY = "phaseforge"
_UINT16_MAX = np.iinfo(np.uint16).max


class CipherImageTooLarge(ValueError):
    """Raised before decoding a cipher PNG that exceeds configured limits."""


def encode(ciphertext, metadata):
    """Return one noise-like PNG holding a complex image ciphertext."""
    ciphertext, common = _prepare(ciphertext, metadata)
    planes = np.concatenate([np.real(ciphertext), np.imag(ciphertext)], axis=0)
    return _encode_planes(planes, common)


def decode(payload, *, max_original_pixels=None, max_cipher_pixels=None):
    """Decode and validate a cipher PNG made by :func:`encode`.

    Returns ``(complex_ciphertext, metadata)`` where metadata uses the shape the
    DRPE decryptor expects, including salt bytes.
    """
    planes, raw = _decode_planes(payload, max_cipher_pixels)
    channels = planes.shape[0] // 2
    ciphertext = planes[:channels] + 1j * planes[channels:]
    return ciphertext, _validated_metadata(raw, ciphertext.shape, max_original_pixels)


def is_cipher_png(payload):
    """True if ``payload`` is a PNG carrying PhaseForge cipher metadata."""
    try:
        with Image.open(io.BytesIO(payload)) as image:
            return image.format == "PNG" and METADATA_KEY in image.info
    except Exception:
        return False


def _prepare(ciphertext, metadata):
    ciphertext = np.asarray(ciphertext)
    if ciphertext.ndim != 3 or not np.iscomplexobj(ciphertext):
        raise ValueError("image ciphertext must be a 3D complex array")
    if not np.all(np.isfinite(ciphertext)):
        raise ValueError("image ciphertext contains non-finite values")

    channels, height, width = ciphertext.shape
    common = {
        "format_version": FORMAT_VERSION,
        "kind": "image",
        "salt": base64.b64encode(_salt_bytes(metadata.get("salt"))).decode("ascii"),
        "iterations": int(metadata["iterations"]),
        "original_shape": [int(value) for value in metadata["original_shape"]],
        "padded_shape": [int(value) for value in metadata.get(
            "padded_shape", [channels, height, width])],
        "mode": metadata.get("mode"),
    }
    if common["padded_shape"] != [channels, height, width]:
        raise ValueError("ciphertext shape does not match padded_shape metadata")
    return ciphertext, common


def _validated_metadata(raw, shape, max_original_pixels=None):
    """Check stored metadata against the decoded array; return DRPE metadata."""
    padded_shape = _shape(raw.get("padded_shape"), "padded_shape")
    if tuple(padded_shape) != tuple(shape):
        raise ValueError("cipher dimensions do not match padded_shape")
    original_shape = _shape(raw.get("original_shape"), "original_shape")
    if max_original_pixels is not None and original_shape[1] * original_shape[2] > max_original_pixels:
        raise CipherImageTooLarge("original image exceeds the pixel limit")
    if original_shape[0] != padded_shape[0]:
        raise ValueError("original and padded channel counts must match")
    if any(original > padded for original, padded in zip(original_shape, padded_shape)):
        raise ValueError("original_shape cannot exceed padded_shape")
    if raw.get("kind") != "image":
        raise ValueError("cipher is not an image ciphertext")

    try:
        salt = base64.b64decode(raw["salt"], validate=True)
    except (KeyError, ValueError):
        raise ValueError("cipher contains an invalid salt") from None
    if len(salt) != derive.SALT_BYTES:
        raise ValueError("cipher contains an invalid salt length")

    try:
        iterations = int(raw["iterations"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("cipher contains invalid KDF iterations") from None
    if not 1 <= iterations <= derive.MAX_ITERATIONS:
        raise ValueError("cipher KDF iterations are out of range")
    mode = raw.get("mode")
    if mode not in ("L", "RGB"):
        raise ValueError("cipher contains an unsupported image mode")

    return {
        "kind": "image",
        "salt": salt,
        "iterations": iterations,
        "original_shape": original_shape,
        "padded_shape": padded_shape,
        "mode": mode,
    }


def _encode_planes(planes, common):
    planes = np.asarray(planes, dtype=np.float64)
    channels, height, width = planes.shape
    flat = planes.reshape(channels * height, width)
    low = float(np.min(flat))
    high = float(np.max(flat))
    if not np.isfinite(low) or not np.isfinite(high):
        raise ValueError("cipher planes contain non-finite values")
    if high - low < 1e-15:
        encoded = np.zeros(flat.shape, dtype=np.uint16)
        high = low
    else:
        encoded = np.round((flat - low) / (high - low) * _UINT16_MAX)
        encoded = np.clip(encoded, 0, _UINT16_MAX).astype(np.uint16)

    payload = deepcopy(common)
    payload.update({"scale_min": low, "scale_max": high})
    info = PngImagePlugin.PngInfo()
    info.add_text(METADATA_KEY, json.dumps(payload, separators=(",", ":")))
    buffer = io.BytesIO()
    Image.fromarray(encoded).save(buffer, format="PNG", pnginfo=info)
    return buffer.getvalue()


def _decode_planes(payload, max_cipher_pixels=None):
    try:
        with Image.open(io.BytesIO(payload)) as image:
            if image.format != "PNG":
                raise ValueError("cipher component must be a PNG")
            raw_metadata = image.info.get(METADATA_KEY)
            if not isinstance(raw_metadata, str):
                raise ValueError("cipher component is missing PhaseForge metadata")
            metadata = json.loads(raw_metadata)
            if not isinstance(metadata, dict):
                raise ValueError("cipher component metadata must be an object")
            if metadata.get("format_version") != FORMAT_VERSION:
                raise ValueError(
                    f"unsupported cipher PNG version {metadata.get('format_version')!r}")
            required = ("kind", "salt", "iterations", "original_shape",
                        "padded_shape", "mode", "scale_min", "scale_max")
            missing = [key for key in required if key not in metadata]
            if missing:
                raise ValueError(f"cipher component metadata is missing {missing}")
            if image.mode != "I;16":
                raise ValueError("cipher component must be a 16-bit grayscale PNG")
            channels, height, width = _shape(metadata.get("padded_shape"), "padded_shape")
            channels *= 2  # real planes stacked above imaginary planes
            if max_cipher_pixels is not None and channels * height * width > max_cipher_pixels:
                raise CipherImageTooLarge("cipher component exceeds the pixel limit")
            pixels = np.asarray(image).copy()
    except ValueError:
        raise
    except Exception as error:
        raise ValueError("could not read cipher component PNG") from error

    if pixels.shape != (channels * height, width):
        raise ValueError("cipher component dimensions do not match metadata")
    if pixels.dtype != np.uint16:
        raise ValueError("cipher component must use 16-bit pixels")
    try:
        low = float(metadata["scale_min"])
        high = float(metadata["scale_max"])
    except (KeyError, TypeError, ValueError):
        raise ValueError("cipher component has invalid scaling metadata") from None
    if not np.isfinite(low) or not np.isfinite(high) or high < low:
        raise ValueError("cipher component has invalid scaling range")

    values = pixels.astype(np.float64)
    if high - low < 1e-15:
        decoded = np.full(values.shape, low, dtype=np.float64)
    else:
        decoded = low + values / _UINT16_MAX * (high - low)
    return decoded.reshape(channels, height, width), metadata


def _shape(value, label):
    if not isinstance(value, list) or len(value) != 3:
        raise ValueError(f"{label} must contain three dimensions")
    try:
        result = tuple(int(item) for item in value)
    except (TypeError, ValueError):
        raise ValueError(f"{label} contains an invalid dimension") from None
    if any(item <= 0 for item in result):
        raise ValueError(f"{label} dimensions must be positive")
    return result


def _salt_bytes(value):
    if isinstance(value, (bytes, bytearray)):
        return bytes(value)
    if isinstance(value, str):
        try:
            return base64.b64decode(value, validate=True)
        except ValueError:
            pass
    raise ValueError("image ciphertext metadata is missing a valid salt")
