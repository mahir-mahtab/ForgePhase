"""Image endpoints: DRPE, watermarking, and frequency editing.

Each route reads its uploads on the event loop, then hands everything that
touches pixels -- decoding, transforms, encoding -- to :func:`support.run_job`.
"""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ...image import drpe, freq_edit, watermark
from ...io import image_cipher, image_io
from .. import support

router = APIRouter(prefix="/api/image", tags=["image"])


@router.post("/encrypt")
async def encrypt(file: UploadFile = File(...), passphrase: str = Form(...),
                  greyscale: bool = Form(False)):
    """Encrypt an image, returning a single PNG that looks like pure noise."""
    payload = await support.read_upload(file)

    def work():
        image, mode = support.decode_image(payload, greyscale)
        ciphertext, metadata = drpe.encrypt(image, passphrase)
        metadata["mode"] = mode
        return support.image_cipher_png_response(image_cipher.encode(ciphertext, metadata))

    return await support.run_job(work)


@router.post("/decrypt")
async def decrypt(file: UploadFile = File(...), passphrase: str = Form(...)):
    """Decrypt a cipher PNG back to the original image.

    A wrong passphrase does not error -- DRPE has no integrity check, so it
    simply produces noise. Telling the two apart is the caller's job.
    """
    payload = await support.read_upload(file)

    def work():
        ciphertext, metadata = support.decode_image_cipher(payload)
        image = drpe.decrypt(ciphertext, passphrase, metadata)
        return support.image_response(image, "restored.png", metadata.get("mode"))

    return await support.run_job(work)


@router.post("/spectrum")
async def spectrum(file: UploadFile = File(...), gamma: float = Form(1.0)):
    """Render a magnitude spectrum as a viewable PNG.

    Accepts an ordinary image or a cipher PNG; a cipher is recognised by its
    embedded metadata and shown as the complex ciphertext it holds.
    """
    payload = await support.read_upload(file)

    def work():
        if image_cipher.is_cipher_png(payload):
            data, _ = support.decode_image_cipher(payload)
        else:
            data, _ = support.decode_image(payload)
        return support.image_response(freq_edit.spectrum_preview(data, gamma), "spectrum.png")

    return await support.run_job(work)


@router.post("/filter")
async def filter_image(file: UploadFile = File(...), kind: str = Form("low"),
                       cutoff: float = Form(0.3), high_cutoff: float | None = Form(None),
                       filter_shape: str = Form("gaussian"), order: int = Form(2)):
    """Low-, high-, or band-pass an image in the frequency domain."""
    payload = await support.read_upload(file)

    def work():
        image, mode = support.decode_image(payload)
        filtered = freq_edit.apply_filter(image, kind, cutoff, high_cutoff,
                                          filter_shape, order)
        return support.image_response(filtered, "filtered.png", mode)

    return await support.run_job(work)


@router.post("/watermark/embed")
async def watermark_embed(file: UploadFile = File(...), watermark_file: UploadFile = File(...),
                          strength: float = Form(0.15), position: float = Form(0.25)):
    """Embed a watermark into the image's mid-frequency spectrum."""
    carrier = await support.read_upload(file)
    mark_data = await support.read_upload(watermark_file)

    def work():
        image, mode = support.decode_image(carrier)
        mark, _ = support.decode_image(mark_data, greyscale=True)
        marked = watermark.embed(image, mark[0], strength, position)
        return support.image_response(marked, "watermarked.png", mode)

    return await support.run_job(work)


@router.post("/watermark/extract")
async def watermark_extract(original: UploadFile = File(...), marked: UploadFile = File(...),
                            height: int = Form(...), width: int = Form(...),
                            strength: float = Form(0.15), position: float = Form(0.25)):
    """Recover an embedded watermark by differencing the two spectra."""
    if height < 1 or width < 1:
        raise HTTPException(400, "watermark height and width must be positive")
    original_data = await support.read_upload(original)
    marked_data = await support.read_upload(marked)

    def work():
        original_image, _ = support.decode_image(original_data)
        marked_image, _ = support.decode_image(marked_data)
        if original_image.shape != marked_image.shape:
            raise HTTPException(400, "the two images must have the same dimensions "
                                     "and colour mode")
        recovered = watermark.extract(original_image, marked_image, (height, width),
                                      strength, position)
        return support.image_response(image_io.normalize(recovered), "watermark.png")

    return await support.run_job(work)

