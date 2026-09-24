"""Upload handling, resource limits, and response helpers.

Everything here exists because the API accepts files from the network. The
limits are not arbitrary: DRPE pads images to a power of two and works in
complex128, so a modest-looking upload can expand dramatically in memory. A
1024x1024 RGB image becomes 3 x 1024 x 1024 x 16 bytes = 50 MB per intermediate
array, and several exist at once during a transform.

Nothing is written to disk -- uploads are decoded from memory and results are
streamed straight back, so there are no temp files to leak or clean up.
"""

import io
import os
import zipfile

import anyio
import numpy as np
from fastapi import HTTPException, UploadFile
from fastapi.responses import Response
from PIL import Image

from ..core import transform
from ..io import audio_cipher, audio_io, container, image_cipher, image_io

MAX_UPLOAD_BYTES = None
MAX_DECOMPRESSED_BYTES = 512 * 1024 * 1024
MAX_IMAGE_PIXELS = 1024 * 1024
MAX_AUDIO_SAMPLES = 48_000 * 60
MAX_AUDIO_CHANNELS = 2

_CHUNK = 64 * 1024

# How many transforms may run at once. Each can hold several complex128 copies
# of a padded image, so this bounds peak memory rather than CPU alone.
MAX_CONCURRENT_JOBS = max(1, int(os.environ.get("PHASEFORGE_MAX_JOBS", "2")))
_limiter = None


def _job_limiter():
    # Created lazily: a limiter binds to the running event loop.
    global _limiter
    if _limiter is None:
        _limiter = anyio.CapacityLimiter(MAX_CONCURRENT_JOBS)
    return _limiter


async def run_job(work, *args, backend=None):
    """Run CPU-bound ``work(*args)`` in a worker thread.

    Decoding, PBKDF2, transforms and encoding all hold the CPU for a long
    time; running them on the event loop would stall every other request,
    including health checks. ``backend`` selects the DFT implementation for
    this call only -- the selection is a context variable, so concurrent
    requests never see each other's choice.
    """
    if backend is not None:
        if backend not in transform.available_backends():
            raise HTTPException(
                400, f"unknown backend {backend!r}; available: "
                     f"{', '.join(transform.available_backends())}")

    def job():
        if backend is None:
            return work(*args)
        with transform.using_backend(backend):
            return work(*args)

    return await anyio.to_thread.run_sync(job, limiter=_job_limiter())


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
    """Decode image bytes, rejecting anything too large to transform."""
    try:
        with Image.open(io.BytesIO(data)) as probe:
            width, height = probe.size  # lazy: no pixels decoded yet
    except Exception:
        raise HTTPException(400, "could not read that file as an image")

    if width < 1 or height < 1:
        raise HTTPException(400, "image has no pixels")
    if width * height > MAX_IMAGE_PIXELS:
        raise HTTPException(
            413, f"image is {width}x{height}; the limit is {MAX_IMAGE_PIXELS} pixels "
                 "(transforms pad to a power of two and work in complex128)")

    try:
        return image_io.load_image(io.BytesIO(data), greyscale=greyscale)
    except Exception:
        raise HTTPException(400, "could not decode that image")


def decode_audio(data):
    """Decode audio bytes, rejecting anything too long to transform."""
    try:
        signal, sample_rate = audio_io.load_audio(io.BytesIO(data))
    except Exception:
        raise HTTPException(400, "could not read that file as audio")

    channels, samples = signal.shape
    if samples == 0:
        raise HTTPException(400, "audio file contains no samples")
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


def audio_cipher_response(wav, filename="cipher.wav"):
    """Return the single noise-like WAV that holds an audio ciphertext."""
    return _attachment(wav, "audio/wav", filename)


def decode_audio_cipher(data):
    """Decode a cipher WAV, rejecting anything too long to transform."""
    try:
        return audio_cipher.decode(data, max_samples=MAX_AUDIO_SAMPLES)
    except audio_cipher.CipherAudioTooLarge as error:
        raise HTTPException(413, str(error)) from error
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


def container_response(data, metadata, filename):
    buffer = io.BytesIO()
    container.save_container(buffer, data, metadata)
    return _attachment(buffer.getvalue(), "application/octet-stream", filename)


def image_cipher_png_response(png, filename="cipher.png"):
    """Return the single noise-like PNG that holds an image ciphertext."""
    return _attachment(png, "image/png", filename)


# Each spatial axis can grow to the next power of two, and colour channels are
# stacked vertically in the stored PNG.
_MAX_CIPHER_PIXELS = MAX_IMAGE_PIXELS * 12


def decode_image_cipher(data):
    """Decode a single cipher PNG with the same resource limits as image uploads."""
    try:
        return image_cipher.decode(
            data,
            max_original_pixels=MAX_IMAGE_PIXELS,
            # Real and imaginary planes double the stored height.
            max_cipher_pixels=_MAX_CIPHER_PIXELS * 2,
        )
    except image_cipher.CipherImageTooLarge as error:
        raise HTTPException(413, str(error)) from error
    except ValueError as error:
        raise HTTPException(400, str(error)) from error


def decode_image_cipher_pair(real_data, imaginary_data):
    """Decode a pair while applying the same resource limits as image uploads."""
    try:
        return image_cipher.decode_pair(
            real_data,
            imaginary_data,
            max_original_pixels=MAX_IMAGE_PIXELS,
            max_cipher_pixels=_MAX_CIPHER_PIXELS,
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
    """Replace infinities and NaN, which are not valid JSON, with strings."""
    if isinstance(value, dict):
        return {key: json_safe(item) for key, item in value.items()}
    if isinstance(value, (float, np.floating)):
        value = float(value)
        return value if np.isfinite(value) else str(value)
    return value


def ensure_finite(array, what="result"):
    """Refuse to encode a result that went non-finite during processing."""
    if not np.all(np.isfinite(array)):
        raise HTTPException(422, f"the {what} contains invalid values; try different parameters")
    return array


def expect_kind(metadata, kind):
    """Reject a container of the wrong type before it reaches a module."""
    actual = metadata.get("kind")
    if actual != kind:
        raise HTTPException(400, f"expected a {kind} container, got {actual!r}")
