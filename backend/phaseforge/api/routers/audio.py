"""Audio endpoints: DRPE, noise cancellation, and voice enhancement."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ...audio import denoise, drpe, enhance
from ...core.padding import is_power_of_two
from .. import support

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.post("/encrypt")
async def encrypt(file: UploadFile = File(...), passphrase: str = Form(...),
                  block_size: int = Form(drpe.DEFAULT_BLOCK_SIZE)):
    """Encrypt audio block by block, returning a ``.npz`` ciphertext container."""
    if not is_power_of_two(block_size):
        raise HTTPException(400, f"block_size must be a power of two, got {block_size}")

    signal, sample_rate = support.decode_audio(await support.read_upload(file))
    ciphertext, metadata = drpe.encrypt(signal, passphrase, sample_rate,
                                        block_size=block_size)
    return support.container_response(ciphertext, metadata, "cipher.npz")


@router.post("/decrypt")
async def decrypt(file: UploadFile = File(...), passphrase: str = Form(...)):
    """Decrypt a ciphertext container back to a WAV.

    As with images, a wrong passphrase yields noise rather than an error.
    """
    ciphertext, metadata = support.decode_container(await support.read_upload(file))
    support.expect_kind(metadata, "audio")
    signal = drpe.decrypt(ciphertext, passphrase, metadata)
    return support.audio_response(signal, metadata["sample_rate"], "restored.wav")


@router.post("/denoise")
async def denoise_audio(file: UploadFile = File(...), over_subtraction: float = Form(2.0),
                        floor: float = Form(0.05), noise_frames: int = Form(6)):
    """Reduce background noise by spectral subtraction.

    The noise profile is estimated from the opening frames, so the recording
    needs a short noise-only lead-in for this to work well.
    """
    signal, sample_rate = support.decode_audio(await support.read_upload(file))
    try:
        cleaned = denoise.denoise_multichannel(
            signal, over_subtraction=over_subtraction, floor=floor,
            noise_frames=noise_frames)
    except ValueError as error:
        raise HTTPException(400, str(error))
    return support.audio_response(cleaned, sample_rate, "denoised.wav")


@router.post("/enhance")
async def enhance_audio(file: UploadFile = File(...), boost: float = Form(2.0),
                        gate_threshold: float = Form(1.5), gate_floor: float = Form(0.1)):
    """Boost the speech band and gate low-energy bins."""
    signal, sample_rate = support.decode_audio(await support.read_upload(file))
    try:
        enhanced = enhance.enhance_multichannel(
            signal, sample_rate, boost=boost, gate_threshold=gate_threshold,
            gate_floor=gate_floor)
    except ValueError as error:
        raise HTTPException(400, str(error))
    return support.audio_response(enhanced, sample_rate, "enhanced.wav")
