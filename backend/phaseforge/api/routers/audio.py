"""Audio endpoints: DRPE, noise cancellation, and voice enhancement."""

from fastapi import APIRouter, File, Form, UploadFile

from ...audio import denoise, drpe, enhance
from ...io import audio_cipher
from .. import support

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.post("/encrypt")
async def encrypt(file: UploadFile = File(...), passphrase: str = Form(...),
                  block_size: int = Form(drpe.DEFAULT_BLOCK_SIZE)):
    """Encrypt audio block by block, returning a single WAV that sounds like noise."""
    # Checked before the upload is decoded, so an absurd block size never
    # reaches an allocation.
    drpe.validate_block_size(block_size)
    payload = await support.read_upload(file)

    def work():
        signal, sample_rate = support.decode_audio(payload)
        ciphertext, metadata = drpe.encrypt(signal, passphrase, sample_rate,
                                            block_size=block_size)
        return support.audio_cipher_response(audio_cipher.encode(ciphertext, metadata))

    return await support.run_job(work)


@router.post("/decrypt")
async def decrypt(file: UploadFile = File(...), passphrase: str = Form(...)):
    """Decrypt a cipher WAV back to the original recording.

    As with images, a wrong passphrase yields noise rather than an error.
    """
    payload = await support.read_upload(file)

    def work():
        ciphertext, metadata = support.decode_audio_cipher(payload)
        signal = drpe.decrypt(ciphertext, passphrase, metadata)
        return support.audio_response(signal, metadata["sample_rate"], "restored.wav")

    return await support.run_job(work)


@router.post("/denoise")
async def denoise_audio(file: UploadFile = File(...), over_subtraction: float = Form(2.0),
                        floor: float = Form(0.05), noise_frames: int = Form(6)):
    """Reduce background noise by spectral subtraction.

    The noise profile is estimated from the opening frames, so the recording
    needs a short noise-only lead-in for this to work well.
    """
    payload = await support.read_upload(file)

    def work():
        signal, sample_rate = support.decode_audio(payload)
        cleaned = denoise.denoise_multichannel(
            signal, over_subtraction=over_subtraction, floor=floor,
            noise_frames=noise_frames)
        support.ensure_finite(cleaned, "denoised audio")
        return support.audio_response(cleaned, sample_rate, "denoised.wav")

    return await support.run_job(work)


@router.post("/enhance")
async def enhance_audio(file: UploadFile = File(...), boost: float = Form(2.0),
                        gate_threshold: float = Form(1.5), gate_floor: float = Form(0.1)):
    """Boost the speech band and gate low-energy bins."""
    payload = await support.read_upload(file)

    def work():
        signal, sample_rate = support.decode_audio(payload)
        enhanced = enhance.enhance_multichannel(
            signal, sample_rate, boost=boost, gate_threshold=gate_threshold,
            gate_floor=gate_floor)
        support.ensure_finite(enhanced, "enhanced audio")
        return support.audio_response(enhanced, sample_rate, "enhanced.wav")

    return await support.run_job(work)
