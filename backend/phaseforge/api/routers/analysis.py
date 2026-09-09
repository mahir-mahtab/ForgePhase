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
async def attack_report(ciphertext: UploadFile = File(...), original: UploadFile = File(...),
                        passphrase: str = Form(...)):
    """Damage a ciphertext in several ways and report what survives decryption.

    Works for image and audio containers alike; the attack set and metrics are
    chosen from the container's own metadata.
    """
    cipher_data, metadata = support.decode_container(await support.read_upload(ciphertext))
    payload = await support.read_upload(original)

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
