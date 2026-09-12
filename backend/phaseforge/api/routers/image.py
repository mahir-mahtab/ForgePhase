"""Image endpoints: DRPE, watermarking, and frequency editing."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ...core import transform
from ...image import drpe, freq_edit, watermark
from ...io import image_cipher, image_io
from .. import support

router = APIRouter(prefix="/api/image", tags=["image"])


@router.post("/encrypt")
async def encrypt(file: UploadFile = File(...), passphrase: str = Form(...),
                  greyscale: bool = Form(False), backend: str = Form("numpy")):
    """Encrypt an image, returning real and imaginary PNGs in a ZIP."""
    image, mode = support.decode_image(await support.read_upload(file), greyscale)
    with transform.using_backend(backend):
        ciphertext, metadata = drpe.encrypt(image, passphrase)
    metadata["mode"] = mode
    real_png, imaginary_png = image_cipher.encode_pair(ciphertext, metadata)
    return support.image_cipher_response(real_png, imaginary_png)


@router.post("/decrypt")
async def decrypt(real_file: UploadFile = File(...), imaginary_file: UploadFile = File(...),
                  passphrase: str = Form(...),
                  backend: str = Form("numpy")):
    """Decrypt a real/imaginary ciphertext PNG pair back to a PNG.

    A wrong passphrase does not error -- DRPE has no integrity check, so it
    simply produces noise. Telling the two apart is the caller's job.
    """
    ciphertext, metadata = support.decode_image_cipher_pair(
        await support.read_upload(real_file),
        await support.read_upload(imaginary_file),
    )
    with transform.using_backend(backend):
        image = drpe.decrypt(ciphertext, passphrase, metadata)
    return support.image_response(image, "restored.png", metadata.get("mode"))


@router.post("/spectrum")
async def spectrum(file: UploadFile | None = File(None),
                   real_file: UploadFile | None = File(None),
                   imaginary_file: UploadFile | None = File(None),
                   gamma: float = Form(1.0)):
    """Render a magnitude spectrum as a viewable PNG.

    Accepts an ordinary image or a real/imaginary ciphertext pair.
    """
    if file is not None and (real_file is not None or imaginary_file is not None):
        raise HTTPException(400, "provide either an image or a cipher pair, not both")
    if file is not None:
        data, _ = support.decode_image(await support.read_upload(file))
    elif real_file is not None and imaginary_file is not None:
        data, _ = support.decode_image_cipher_pair(
            await support.read_upload(real_file),
            await support.read_upload(imaginary_file),
        )
    else:
        raise HTTPException(400, "provide an image or both cipher components")
    return support.image_response(freq_edit.spectrum_preview(data, gamma), "spectrum.png")


@router.post("/filter")
async def filter_image(file: UploadFile = File(...), kind: str = Form("low"),
                       cutoff: float = Form(0.3), high_cutoff: float | None = Form(None),
                       filter_shape: str = Form("gaussian"), order: int = Form(2)):
    """Low-, high-, or band-pass an image in the frequency domain."""
    image, mode = support.decode_image(await support.read_upload(file))
    try:
        filtered = freq_edit.apply_filter(image, kind, cutoff, high_cutoff,
                                          filter_shape, order)
    except ValueError as error:
        raise HTTPException(400, str(error))
    return support.image_response(filtered, "filtered.png", mode)


@router.post("/watermark/embed")
async def watermark_embed(file: UploadFile = File(...), watermark_file: UploadFile = File(...),
                          strength: float = Form(0.15), position: float = Form(0.25)):
    """Embed a watermark into the image's mid-frequency spectrum."""
    image, mode = support.decode_image(await support.read_upload(file))
    mark, _ = support.decode_image(await support.read_upload(watermark_file), greyscale=True)
    try:
        marked = watermark.embed(image, mark[0], strength, position)
    except ValueError as error:
        raise HTTPException(400, str(error))
    return support.image_response(marked, "watermarked.png", mode)


@router.post("/watermark/extract")
async def watermark_extract(original: UploadFile = File(...), marked: UploadFile = File(...),
                            height: int = Form(...), width: int = Form(...),
                            strength: float = Form(0.15), position: float = Form(0.25)):
    """Recover an embedded watermark by differencing the two spectra."""
    original_image, _ = support.decode_image(await support.read_upload(original))
    marked_image, _ = support.decode_image(await support.read_upload(marked))
    if original_image.shape != marked_image.shape:
        raise HTTPException(400, "the two images must have the same dimensions")

    try:
        recovered = watermark.extract(original_image, marked_image, (height, width),
                                      strength, position)
    except ValueError as error:
        raise HTTPException(400, str(error))

    return support.image_response(image_io.normalize(recovered), "watermark.png")
