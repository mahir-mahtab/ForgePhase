"""Audio endpoints: DRPE, noise cancellation, and voice enhancement."""

from fastapi import APIRouter, File, Form, HTTPException, UploadFile

from ...audio import denoise, drpe, enhance
from ...core import transform
from ...core.padding import is_power_of_two
import numpy as np
from .. import support

router = APIRouter(prefix="/api/audio", tags=["audio"])


@router.post("/encrypt")
async def encrypt(file: UploadFile = File(...), passphrase: str = Form(...),
                  block_size: int = Form(drpe.DEFAULT_BLOCK_SIZE),
                  backend: str = Form("numpy")):
    """Encrypt audio block by block, returning a ``.npz`` ciphertext container."""
    if not is_power_of_two(block_size):
        raise HTTPException(400, f"block_size must be a power of two, got {block_size}")

    signal, sample_rate = support.decode_audio(await support.read_upload(file))
    with transform.using_backend(backend):
        ciphertext, metadata = drpe.encrypt(signal, passphrase, sample_rate,
                                            block_size=block_size)
    return support.container_response(ciphertext, metadata, "cipher.npz")


@router.post("/decrypt")
async def decrypt(file: UploadFile = File(...), passphrase: str = Form(...),
                  backend: str = Form("numpy")):
    """Decrypt a ciphertext container back to a WAV.

    As with images, a wrong passphrase yields noise rather than an error.
    """
    ciphertext, metadata = support.decode_container(await support.read_upload(file))
    support.expect_kind(metadata, "audio")
    with transform.using_backend(backend):
        signal = drpe.decrypt(ciphertext, passphrase, metadata)
    return support.audio_response(signal, metadata["sample_rate"], "restored.wav")



@router.post("/analyze")
async def analyze_audio(file: UploadFile = File(...), frame_size: int = Form(1024),
                        preview_points: int = Form(1200), backend: str = Form("numpy")):
    """Return compact waveform, spectrum, and spectrogram data for the UI lab."""
    if frame_size not in (256, 512, 1024, 2048, 4096):
        raise HTTPException(400, "frame_size must be one of 256, 512, 1024, 2048, 4096")
    signal, sample_rate = support.decode_audio(await support.read_upload(file))
    mono = np.mean(signal, axis=0)
    n = len(mono)
    points = max(64, min(int(preview_points), 4000))
    indices = np.linspace(0, n - 1, points, dtype=int) if n else np.array([], dtype=int)
    waveform = mono[indices] if n else mono
    window = np.hanning(min(frame_size, n)) if n else np.array([])
    frame = mono[:len(window)] * window if n else mono
    if len(frame):
        spectrum = np.abs(transform.fft(frame)[:len(frame)//2 + 1])
        freqs = np.fft.rfftfreq(len(frame), 1.0 / sample_rate)
        spectrum = np.log1p(spectrum)
        spectrum /= max(float(spectrum.max()), 1e-12)
    else:
        freqs, spectrum = np.array([]), np.array([])
    hop = max(1, frame_size // 2)
    starts = range(0, max(n - frame_size + 1, 1), hop)
    rows = []
    max_frames = 96
    starts = list(starts)
    if len(starts) > max_frames:
        starts = np.linspace(0, len(starts)-1, max_frames, dtype=int).tolist()
        starts = [list(range(0, max(n - frame_size + 1, 1), hop))[i] for i in starts]
    for start in starts:
        chunk = mono[start:start + frame_size]
        if len(chunk) < frame_size:
            chunk = np.pad(chunk, (0, frame_size-len(chunk)))
        mag = np.abs(transform.fft(chunk * np.hanning(frame_size))[:frame_size//2 + 1])
        mag = np.log1p(mag)
        mag /= max(float(mag.max()), 1e-12)
        rows.append([float(x) for x in mag[::max(1, len(mag)//96)]])
    rms = float(np.sqrt(np.mean(mono**2))) if n else 0.0
    peak = float(np.max(np.abs(mono))) if n else 0.0
    return {
        "sample_rate": int(sample_rate), "channels": int(signal.shape[0]),
        "samples": int(n), "duration_seconds": float(n / sample_rate) if sample_rate else 0.0,
        "rms": rms, "peak": peak, "waveform": [float(x) for x in waveform],
        "spectrum": {"frequencies": [float(x) for x in freqs[::max(1, len(freqs)//300)]],
                     "magnitude": [float(x) for x in spectrum[::max(1, len(spectrum)//300)]]},
        "spectrogram": rows, "frame_size": frame_size
    }

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


@router.post("/security-report")
async def security_report(
    original: UploadFile = File(...),
    ciphertext: UploadFile = File(...),
    passphrase: str = Form(...),
    wrong_passphrase: str = Form(...),
    phase_error: float = Form(0.0),
    steps: int = Form(9),
    backend: str = Form("numpy"),
):
    """Compare correct/wrong-key audio recovery and run key sensitivity.

    The endpoint returns compact metrics only; audio itself is never persisted.
    """
    if not (0.0 <= phase_error <= float(np.pi)):
        raise HTTPException(400, "phase_error must be between 0 and pi radians")
    if not (3 <= steps <= 21):
        raise HTTPException(400, "steps must be between 3 and 21")
    original_signal, sample_rate = support.decode_audio(await support.read_upload(original))
    cipher, metadata = support.decode_container(await support.read_upload(ciphertext))
    support.expect_kind(metadata, "audio")
    if int(metadata["sample_rate"]) != int(sample_rate):
        raise HTTPException(400, "original and ciphertext sample rates do not match")
    if original_signal.shape != (int(metadata["channels"]), int(metadata["length"])):
        raise HTTPException(400, "original audio shape does not match ciphertext metadata")
    from ...analysis import metrics
    with transform.using_backend(backend):
        correct = drpe.decrypt(cipher, passphrase, metadata)
        wrong = drpe.decrypt(cipher, wrong_passphrase, metadata)
        errors = np.linspace(0.0, phase_error, int(steps))
        points = []
        for error in errors:
            recovered = drpe.decrypt_with_phase_perturbation(cipher, passphrase, metadata, float(error))
            summary = metrics.summarize_audio(original_signal, recovered)
            points.append({"phase_error_rad": float(error), "key_error_percent": float(error / np.pi * 100.0), **summary})
    return support.json_safe ({
        "sample_rate": int(sample_rate),
        "duration_seconds": float(metadata["length"] / sample_rate),
        "block_size": int(metadata["block_size"]),
        "channels": int(metadata["channels"]),
        "correct_key": metrics.summarize_audio(original_signal, correct),
        "wrong_key": metrics.summarize_audio(original_signal, wrong),
        "key_sensitivity": points,
    })
