"""Upload handling, resource limits, and response helpers.

Everything here exists because the API accepts files from the network. The
limits are not arbitrary: DRPE pads images to a power of two and works in
complex128, so a modest-looking upload can expand dramatically in memory. A
1024x1024 RGB image becomes 3 x 1024 x 1024 x 16 bytes = 50 MB per intermediate
array, and several exist at once during a transform.

Nothing is written to disk -- uploads are decoded from memory and results are
streamed straight back, so there are no temp files to leak or clean up.
"""
import json
import io
import zipfile

import numpy as np
from fastapi import HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

from ..io import audio_io, container, image_cipher, image_io

MAX_UPLOAD_BYTES = None
MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024
MAX_IMAGE_PIXELS = 4096 * 4096
MAX_AUDIO_SAMPLES = 48_000 * 600
MAX_AUDIO_CHANNELS = 2

_CHUNK = 64 * 1024


async def read_upload(upload: UploadFile, limit=MAX_UPLOAD_BYTES):
    """Read an upload into memory.

    ``limit`` remains available to callers that need a route-specific cap, but
    uploads are unlimited by default. Reading in chunks avoids requiring one
    additional contiguous allocation while receiving the file.
    """
    chunks = []
    total = 0
    while chunk := await upload.read(_CHUNK):
        total += len(chunk)
        if limit is not None and total > limit:
            raise HTTPException(413, f"file exceeds the {limit // (1024 * 1024)} MB limit")
        chunks.append(chunk)
    if not chunks:
        raise HTTPException(400, "uploaded file is empty")
    return b"".join(chunks)


def decode_image(data, greyscale=False):
    """Decode PNG/JPEG and always return a valid numpy image."""

    try:
        image = Image.open(io.BytesIO(data))
        image.load()
    except Exception:
        raise HTTPException(400, "could not read that file as an image")

    width, height = image.size

    if width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(
            413,
            f"image is {width}x{height}; limit is {MAX_IMAGE_PIXELS} pixels"
        )

    # Accept RGB, RGBA, grayscale, palette, etc.
    if greyscale:
        image = image.convert("L")
    else:
        image = image.convert("RGB")

    array = np.asarray(image, dtype=np.float64) / 255.0

    if array.ndim == 2:
     array = array[None, :, :]
    else:
     array = np.moveaxis(array, -1, 0)


    mode = "L" if greyscale else "RGB"

    return array, mode


def decode_audio(data):
    """Decode audio bytes, rejecting anything too long to transform."""
    try:
        signal, sample_rate = audio_io.load_audio(io.BytesIO(data))
    except Exception:
        raise HTTPException(400, "could not read that file as audio")

    channels, samples = signal.shape
    if channels > MAX_AUDIO_CHANNELS:
        raise HTTPException(413, f"{channels} channels; the limit is {MAX_AUDIO_CHANNELS}")
    if samples > MAX_AUDIO_SAMPLES:
        raise HTTPException(
            413, f"audio is {samples / sample_rate:.0f}s; the limit is "
                 f"{MAX_AUDIO_SAMPLES // 48_000} minutes at 48 kHz")
    return signal, sample_rate


def decode_container(data):
    """Decode a ``.npz`` ciphertext, guarding against a decompression bomb.

    A small zip can expand to gigabytes, so the uncompressed size is checked
    from the archive index before anything is actually decompressed.
    """
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            declared = sum(entry.file_size for entry in archive.infolist())
    except zipfile.BadZipFile:
        raise HTTPException(400, "that file is not a PhaseForge container")

    if declared > MAX_DECOMPRESSED_BYTES:
        raise HTTPException(413, "container expands to more than the allowed size")

    try:
        return container.load_container(io.BytesIO(data))
    except ValueError as error:
        raise HTTPException(400, str(error))


def image_response(array, filename, mode=None):
    buffer = io.BytesIO()
    image_io.save_image(buffer, array, mode=mode, format="PNG")
    return _attachment(buffer.getvalue(), "image/png", filename)


def audio_response(array, sample_rate, filename):
    buffer = io.BytesIO()
    audio_io.save_audio(buffer, array, sample_rate, format="WAV")
    return _attachment(buffer.getvalue(), "audio/wav", filename)


def container_response(data, metadata, filename):
    buffer = io.BytesIO()
    container.save_container(buffer, data, metadata)
    return _attachment(buffer.getvalue(), "application/octet-stream", filename)


def image_cipher_response(real_png, imaginary_png, filename="cipher-pair.zip"):
    """Return a ZIP containing the two image ciphertext components."""
    buffer = io.BytesIO()
    # PNGs are already compressed; storing them avoids a second compression
    # pass and lets the browser unpack the bundle without a ZIP dependency.
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_STORED) as archive:
        archive.writestr("cipher-real.png", real_png)
        archive.writestr("cipher-imaginary.png", imaginary_png)
    return _attachment(buffer.getvalue(), "application/zip", filename)


def decode_image_cipher_pair(real_data, imaginary_data):
    """Decode a pair while applying the same resource limits as image uploads."""
    try:
        return image_cipher.decode_pair(
            real_data,
            imaginary_data,
            max_original_pixels=MAX_IMAGE_PIXELS,
            # Each spatial axis can grow to the next power of two and colour
            # channels are stacked vertically in the stored PNG.
            max_cipher_pixels=MAX_IMAGE_PIXELS * 12,
        )
    except image_cipher.CipherImageTooLarge as error:
        raise HTTPException(413, str(error)) from error
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


def _attachment(payload, media_type, filename):
    return Response(
        content=payload,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # The frontend reads the filename to name its download.
            "Access-Control-Expose-Headers": "Content-Disposition",
        },
    )


def json_safe(value):
    """Convert NumPy values and non-finite floats into JSON-safe values."""
    if isinstance(value, dict):
        return {str(key): json_safe(item) for key, item in value.items()}

    if isinstance(value, (list, tuple)):
        return [json_safe(item) for item in value]

    if isinstance(value, np.ndarray):
        return json_safe(value.tolist())

    if isinstance(value, (np.integer,)):
        return int(value)

    if isinstance(value, (np.floating, float)):
        value = float(value)

        if not np.isfinite(value):
            return None

        return value

    if isinstance(value, (np.bool_,)):
        return bool(value)

    return value

def expect_kind(metadata, kind):
    """Reject a container of the wrong type before it reaches a module."""
    actual = metadata.get("kind")
    if actual != kind:
        raise HTTPException(400, f"expected a {kind} container, got {actual!r}")
