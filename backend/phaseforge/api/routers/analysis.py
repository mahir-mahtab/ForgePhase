"""Analysis endpoints: robustness reporting and the chosen-plaintext break."""

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ...analysis import attacks, metrics
from .. import support

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class KpaRequest(BaseModel):
    size: int = Field(default=64, ge=8, le=256,
                      description="side length of the probe image; a power of two")


@router.post("/attack-report")
async def attack_report(original: UploadFile = File(...), passphrase: str = Form(...),
                        ciphertext: UploadFile | None = File(None),
                        real_file: UploadFile | None = File(None),
                        imaginary_file: UploadFile | None = File(None)):
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

    try:
        report = attacks.robustness_report(reference, cipher_data, passphrase, metadata)
    except ValueError as error:
        raise HTTPException(400, str(error))
    return {"kind": metadata.get("kind"), "report": support.json_safe(report)}


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
