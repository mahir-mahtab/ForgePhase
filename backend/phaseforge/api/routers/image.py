"""Image endpoints: DRPE, watermarking, and frequency editing.

Each route reads its uploads on the event loop, then hands everything that
touches pixels -- decoding, transforms, encoding -- to :func:`support.run_job`.
"""

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ...image import drpe, freq_edit, hybrid, watermark
from ...io import image_cipher, image_io
from .. import support

router = APIRouter(prefix="/api/image", tags=["image"])


@router.post("/encrypt")
async def encrypt(file: UploadFile = File(...),
                  passphrase: str | None = Form(None),
                  key_file: UploadFile | None = File(None),
                  key_mode: str = Form("passphrase"),
                  greyscale: bool = Form(False)):
    """Encrypt an image, returning a single PNG that looks like pure noise."""
    payload = await support.read_upload(file)
    key_payload = await support.read_upload(key_file) if (key_file is not None and key_file.filename) else None

    def work():
        key = support.resolve_key_material(key_mode, passphrase, key_payload)
        image, mode = support.decode_image(payload, greyscale)
        ciphertext, metadata = drpe.encrypt(image, key)
        metadata["mode"] = mode
        return support.file_response(
            image_cipher.encode(ciphertext, metadata), "image/png", "cipher.png")

    return await support.run_job(work)


@router.post("/decrypt")
async def decrypt(file: UploadFile = File(...),
                  passphrase: str | None = Form(None),
                  key_file: UploadFile | None = File(None),
                  key_mode: str = Form("passphrase")):
    """Decrypt a cipher PNG back to the original image.

    A wrong passphrase does not error -- DRPE has no integrity check, so it
    simply produces noise. Telling the two apart is the caller's job.
    """
    payload = await support.read_upload(file)
    key_payload = await support.read_upload(key_file) if (key_file is not None and key_file.filename) else None

    def work():
        key = support.resolve_key_material(key_mode, passphrase, key_payload)
        ciphertext, metadata = support.decode_image_cipher(payload)
        image = drpe.decrypt(ciphertext, key, metadata)
        return support.image_response(image, "restored.png", metadata.get("mode"))

    return await support.run_job(work)


@router.post("/filter")
async def filter_image(file: UploadFile = File(...), kind: str = Form("low"),
                       cutoff: float = Form(0.3), high_cutoff: float | None = Form(None),
                       filter_shape: str = Form("gaussian"), order: int = Form(2)):
    """Low-, high-, or band-pass an image in the frequency domain."""
    payload = await support.read_upload(file)

    def work():
        image, mode = support.decode_image(payload, max_pixels=support.MAX_EDIT_PIXELS)
        filtered = freq_edit.apply_filter(image, kind, cutoff, high_cutoff,
                                          filter_shape, order)
        return support.image_response(filtered, "filtered.png", mode)

    return await support.run_job(work)


HYBRID_VIEWS = ("hybrid", "distance", "low", "high")


@router.post("/hybrid")
async def hybrid_image(near: UploadFile = File(...), far: UploadFile = File(...),
                       near_cutoff: float = Form(hybrid.DEFAULT_NEAR_CUTOFF),
                       far_cutoff: float = Form(hybrid.DEFAULT_FAR_CUTOFF),
                       filter_shape: str = Form("gaussian"), near_gain: float = Form(1.0),
                       greyscale: bool = Form(False), view: str = Form("hybrid")):
    """Blend two aligned images into one that changes with viewing distance.

    ``view`` picks what comes back: the hybrid itself, a ``distance`` strip of
    it at shrinking sizes, or either band on its own (``low`` or ``high``).
    """
    if view not in HYBRID_VIEWS:
        raise HTTPException(400, f"view must be one of {HYBRID_VIEWS}, got {view!r}")
    near_data = await support.read_upload(near)
    far_data = await support.read_upload(far)

    def work():
        near_image, _ = support.decode_image(near_data, greyscale, support.MAX_EDIT_PIXELS)
        far_image, _ = support.decode_image(far_data, greyscale, support.MAX_EDIT_PIXELS)
        args = (near_image, far_image, near_cutoff, far_cutoff, filter_shape, near_gain)
        if view == "low":
            return support.image_response(hybrid.components(*args)[0], "low.png")
        if view == "high":
            return support.image_response(hybrid.components(*args)[1] + 0.5, "high.png")
        result = hybrid.hybrid(*args)
        if view == "distance":
            return support.image_response(hybrid.distance_preview(result), "distance.png")
        return support.image_response(result, "hybrid.png")

    return await support.run_job(work)


@router.post("/watermark/embed")
async def watermark_embed(file: UploadFile = File(...), watermark_file: UploadFile = File(...),
                          strength: float = Form(0.15), position: float = Form(0.25),
                          colour: bool = Form(False)):
    """Embed a watermark into the image's mid-frequency spectrum."""
    carrier = await support.read_upload(file)
    mark_data = await support.read_upload(watermark_file)

    def work():
        image, mode = support.decode_image(carrier, max_pixels=support.MAX_EDIT_PIXELS)
        # A greyscale carrier has one channel, so it can only hold a grey mark.
        in_colour = colour and image.shape[0] > 1
        mark, _ = support.decode_image(mark_data, greyscale=not in_colour, max_pixels=support.MAX_EDIT_PIXELS)
        mark = np.broadcast_to(mark, image.shape[:1] + mark.shape[1:]) if in_colour else mark[0]
        marked = watermark.embed(image, mark, strength, position)
        return support.image_response(marked, "watermarked.png", mode)

    return await support.run_job(work)


@router.post("/watermark/extract")
async def watermark_extract(original: UploadFile = File(...), marked: UploadFile = File(...),
                            height: int = Form(...), width: int = Form(...),
                            strength: float = Form(0.15), position: float = Form(0.25),
                            colour: bool = Form(False)):
    """Recover an embedded watermark by differencing the two spectra."""
    if height < 1 or width < 1:
        raise HTTPException(400, "watermark height and width must be positive")
    original_data = await support.read_upload(original)
    marked_data = await support.read_upload(marked)

    def work():
        original_image, _ = support.decode_image(original_data, max_pixels=support.MAX_EDIT_PIXELS)
        marked_image, _ = support.decode_image(marked_data, max_pixels=support.MAX_EDIT_PIXELS)
        if original_image.shape != marked_image.shape:
            raise HTTPException(400, "the two images must have the same dimensions "
                                     "and colour mode")
        recovered = watermark.extract(original_image, marked_image, (height, width),
                                      strength, position, colour=colour)
        return support.image_response(image_io.normalize(recovered), "watermark.png")

    return await support.run_job(work)

