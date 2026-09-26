"""Analysis endpoints: robustness reporting and the chosen-plaintext break."""

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ...analysis import attacks, metrics
from ...image import drpe
from ...core import transform
from .. import support

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class KpaRequest(BaseModel):
    size: int = Field(default=64, ge=8, le=256,
                      description="side length of the probe image; a power of two")


@router.post("/attack-report")
async def attack_report(original: UploadFile = File(...), passphrase: str = Form(...),
                        ciphertext: UploadFile | None = File(None),
                        real_file: UploadFile | None = File(None),
                        imaginary_file: UploadFile | None = File(None),
                        level: float = Form(0.10),
                        profile: str = Form("all")):
    """Damage a ciphertext in several ways and report what survives decryption.

    Image reports use a real/imaginary PNG pair. Audio reports continue to use
    the NPZ container format.
    """
    payload = await support.read_upload(original)
    if ciphertext is not None and (real_file is not None or imaginary_file is not None):
        raise HTTPException(400, "provide either an audio container or an image pair")
    if ciphertext is not None:
        cipher_data, metadata = support.decode_container(await support.read_upload(ciphertext))
    elif real_file is not None and imaginary_file is not None:
        cipher_data, metadata = support.decode_image_cipher_pair(
            await support.read_upload(real_file),
            await support.read_upload(imaginary_file),
        )
    else:
        raise HTTPException(400, "provide an audio container or both image components")

    if metadata.get("kind") == "audio":
        reference, _ = support.decode_audio(payload)
    else:
        reference, _ = support.decode_image(payload)

    if not (0.0 <= level <= 1.0):
        raise HTTPException(400, "level must be between 0 and 1")
    try:
        if metadata.get("kind") == "audio":
            available = {**attacks.AUDIO_ATTACKS, **attacks.AUDIO_EXTRA_ATTACKS}
        else:
            available = {**attacks.IMAGE_ATTACKS, **attacks.IMAGE_EXTRA_ATTACKS}
        selected = (attacks.AUDIO_ATTACKS if metadata.get("kind") == "audio" else attacks.IMAGE_ATTACKS) if profile == "all" else {name: available[name] for name in profile.split(",") if name in available}
        if not selected:
            raise ValueError("no valid attacks selected")
        report = attacks.robustness_report(reference, cipher_data, passphrase, metadata, selected, level)
    except ValueError as error:
        raise HTTPException(400, str(error))
    return {"kind": metadata.get("kind"), "report": support.json_safe(report)}



@router.post("/key-sensitivity")
async def key_sensitivity(
    original: UploadFile = File(...),
    real_file: UploadFile = File(...),
    imaginary_file: UploadFile = File(...),
    passphrase: str = Form(...),
    max_phase_error: float = Form(1.0),
    steps: int = Form(9),
):
    """Measure reconstruction degradation as a controlled phase-key error grows."""
    if not (0.0 < max_phase_error <= 3.141592653589793):
        raise HTTPException(400, "max_phase_error must be in (0, pi]")
    if not (3 <= steps <= 21):
        raise HTTPException(400, "steps must be between 3 and 21")
    try:
        reference, _ = support.decode_image(await support.read_upload(original))
        ciphertext, metadata = support.decode_image_cipher_pair(
            await support.read_upload(real_file), await support.read_upload(imaginary_file)
        )
        if reference.shape != tuple(metadata["original_shape"]):
            # Metadata stores channel-first dimensions.
            raise ValueError("original image does not match the ciphertext metadata")
        deltas = np.linspace(0.0, max_phase_error, steps)
        rows = []
        for delta in deltas:
            recovered = drpe.decrypt_with_phase_perturbation(ciphertext, passphrase, metadata, float(delta))
            quality = metrics.summarize(reference, recovered)
            rows.append({
                "phase_error_rad": float(delta),
                "key_error_percent": float(delta / max_phase_error * 100.0) if max_phase_error else 0.0,
                **quality,
                "difference_mean": float(np.mean(np.abs(metrics._gray(reference) - metrics._gray(recovered)))),
            })
    except (ValueError, KeyError) as error:
        raise HTTPException(400, str(error))
    return support.json_safe({"max_phase_error_rad": max_phase_error, "steps": steps, "points": rows})

@router.post("/kpa-demo")
async def kpa_demo(request: KpaRequest):
    """Recover a plaintext with no passphrase, given a reused DRPE key.

    Two probe encryptions are enough: DRPE is linear, so an impulse probe
    exposes the frequency mask and a flat probe exposes the spatial one. This
    is the concrete argument for why key reuse is fatal here.
    """
    shape = (request.size, request.size)
    if request.size & (request.size - 1):
        raise HTTPException(400, f"size must be a power of two, got {request.size}")

    oracle = attacks.build_oracle("a passphrase the attacker never learns")
    secret = np.random.default_rng(0).random(shape)
    recovered = attacks.chosen_plaintext_attack(oracle, shape)(oracle(secret))

    return {
        "probes_used": 2,
        "size": request.size,
        "correlation": metrics.normalized_correlation(secret, recovered),
        "max_absolute_error": float(np.max(np.abs(recovered - secret))),
        "passphrase_guessed": False,
    }

@router.post("/image-report")
async def image_report(
    original: UploadFile = File(...),
    restored: UploadFile = File(...),
    real_file: UploadFile = File(...),
    imaginary_file: UploadFile = File(...),
    wrong_key: UploadFile | None = File(None),
):
    """Return a compact security/quality dashboard for one DRPE experiment."""
    try:
        original_image, _ = support.decode_image(await support.read_upload(original))
        restored_image, _ = support.decode_image(await support.read_upload(restored))
        ciphertext, _ = support.decode_image_cipher_pair(
            await support.read_upload(real_file), await support.read_upload(imaginary_file)
        )
        wrong_image = None
        if wrong_key is not None:
            wrong_image, _ = support.decode_image(await support.read_upload(wrong_key))
        if original_image.shape != restored_image.shape:
            raise ValueError("original and restored images must have the same dimensions")
        if wrong_image is not None and wrong_image.shape != original_image.shape:
            raise ValueError("wrong-key image must have the same dimensions as the original")
    except ValueError as error:
        raise HTTPException(400, str(error))

    original_gray = metrics._gray(original_image)
    restored_gray = metrics._gray(restored_image)
    magnitude = np.abs(ciphertext)
    cipher_display = metrics._gray(magnitude)
    cipher_display = (cipher_display - cipher_display.min()) / max(float(cipher_display.max() - cipher_display.min()), 1e-12)
    # Crop the padded ciphertext display back to the original image size
    h_original, w_original = original_image.shape[-2:]
    cipher_display = cipher_display[:h_original, :w_original]
    h, w = original_gray.shape
    spectrum = np.abs(np.fft.fftshift(transform.fft2(original_gray)))
    yy, xx = np.ogrid[:h, :w]
    radius = np.sqrt((yy - h / 2) ** 2 + (xx - w / 2) ** 2) / max(min(h, w) / 2, 1.0)
    energy = np.abs(spectrum) ** 2
    total = max(float(energy.sum()), 1e-12)

    def band(low, high):
        return float(energy[(radius >= low) & (radius < high)].sum() / total * 100.0)

    result = {
        "dimensions": {"width": int(w), "height": int(h), "channels": int(original_image.shape[0])},
        "original": {
            "entropy": metrics.entropy(original_image),
            "histogram": metrics.histogram(original_image),
            "correlation": metrics.adjacent_correlations(original_image),
        },
        "ciphertext": {
            "entropy": metrics.entropy(cipher_display),
            "histogram": metrics.histogram(cipher_display),
            "correlation": metrics.adjacent_correlations(cipher_display),
            "npcr_percent": metrics.npcr(original_image, cipher_display),
            "uaci_percent": metrics.uaci(original_image, cipher_display),
        },
        "reconstruction": {
            **metrics.summarize(original_image, restored_image),
            "difference_mean": float(np.mean(np.abs(original_gray - restored_gray))),
        },
        "difference_heatmap": metrics.difference_heatmap(original_image, restored_image).tolist(),
        "frequency_energy": {
            "low_percent": band(0.0, 0.25),
            "mid_percent": band(0.25, 0.60),
            "high_percent": band(0.60, 2.0),
        },
    }
    if wrong_image is not None:
        result["wrong_key"] = {
            **metrics.summarize(original_image, wrong_image),
            "difference_mean": float(np.mean(np.abs(original_gray - metrics._gray(wrong_image)))),
        }
    return support.json_safe(result)
