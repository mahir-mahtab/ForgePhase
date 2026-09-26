"""Audio endpoints: DRPE, noise cancellation, and voice enhancement."""

from fastapi import APIRouter, File, Form, UploadFile

from ...audio import denoise, drpe, enhance
from ...io import audio_cipher
from .. import support

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.post("/encrypt")
async def encrypt(file: UploadFile = File(...),
                  passphrase: str | None = Form(None),
                  key_file: UploadFile | None = File(None),
                  key_mode: str = Form("passphrase"),
                  block_size: int = Form(drpe.DEFAULT_BLOCK_SIZE)):
    """Encrypt audio block by block, returning a single WAV that sounds like noise."""
    # Checked before the upload is decoded, so an absurd block size never
    # reaches an allocation.
    drpe.validate_block_size(block_size)
    payload = await support.read_upload(file)
    key_payload = await support.read_upload(key_file) if (key_file is not None and key_file.filename) else None

    def work():
        key = support.resolve_key_material(key_mode, passphrase, key_payload)
        signal, sample_rate = support.decode_audio(payload)
        ciphertext, metadata = drpe.encrypt(signal, key, sample_rate,
                                            block_size=block_size)
        return support.file_response(
            audio_cipher.encode(ciphertext, metadata), "audio/wav", "cipher.wav")

    return await support.run_job(work)


@router.post("/decrypt")
async def decrypt(file: UploadFile = File(...),
                  passphrase: str | None = Form(None),
                  key_file: UploadFile | None = File(None),
                  key_mode: str = Form("passphrase")):
    """Decrypt a cipher WAV back to the original recording.

    As with images, a wrong passphrase yields noise rather than an error.
    """
    payload = await support.read_upload(file)
    key_payload = await support.read_upload(key_file) if (key_file is not None and key_file.filename) else None

    def work():
        key = support.resolve_key_material(key_mode, passphrase, key_payload)
        ciphertext, metadata = support.decode_audio_cipher(payload)
        signal = drpe.decrypt(ciphertext, key, metadata)
        return support.audio_response(signal, metadata["sample_rate"], "restored.wav")

    return await support.run_job(work)


@router.post("/denoise")
async def denoise_audio(file: UploadFile = File(...),
                        reduction_db: float = Form(denoise.DEFAULT_REDUCTION_DB),
                        smoothing: float = Form(denoise.DEFAULT_SMOOTHING),
                        noise_frames: int = Form(denoise.DEFAULT_NOISE_FRAMES)):
    """Suppress background noise with the OM-LSA estimator.

    The noise is tracked through the whole recording; the opening frames
    only seed the estimate.
    """
    payload = await support.read_upload(file)

    def work():
        signal, sample_rate = support.decode_audio(payload)
        cleaned = denoise.denoise_multichannel(
            signal, reduction_db=reduction_db, smoothing=smoothing,
            noise_frames=noise_frames)
        support.ensure_finite(cleaned, "denoised audio")
        return support.audio_response(cleaned, sample_rate, "denoised.wav")

    return await support.run_job(work)


@router.post("/enhance")
async def enhance_audio(file: UploadFile = File(...),
                        reduction_db: float = Form(enhance.DEFAULT_REDUCTION_DB),
                        harmonics: float = Form(enhance.DEFAULT_HARMONICS),
                        clarity_db: float = Form(enhance.DEFAULT_CLARITY_DB),
                        normalize: bool = Form(True)):
    """Two-step noise reduction with harmonic regeneration, clarity EQ and levelling."""
    payload = await support.read_upload(file)

    def work():
        signal, sample_rate = support.decode_audio(payload)
        enhanced = enhance.enhance_multichannel(
            signal, sample_rate, reduction_db=reduction_db, harmonics=harmonics,
            clarity_db=clarity_db, normalize=normalize)
        support.ensure_finite(enhanced, "enhanced audio")
        return support.audio_response(enhanced, sample_rate, "enhanced.wav")

    return await support.run_job(work)
