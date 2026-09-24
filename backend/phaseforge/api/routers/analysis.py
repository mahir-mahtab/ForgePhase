"""Analysis endpoints: robustness reporting and the chosen-plaintext break."""

import base64
import io

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from ...analysis import attacks, metrics
from ...io import audio_cipher, image_cipher, image_io
from .. import support

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


class KpaRequest(BaseModel):
    size: int = Field(default=64, ge=8, le=256,
                      description="side length of the probe image; a power of two")


@router.post("/attack-report")
async def attack_report(original: UploadFile = File(...), passphrase: str = Form(...),
                        ciphertext: UploadFile = File(...)):
    """Damage a ciphertext in several ways and report what survives decryption.

    ``ciphertext`` is an image cipher PNG or an audio cipher WAV.
    """
    cipher_upload = await support.read_upload(ciphertext)
    payload = await support.read_upload(original)

    def work():
        if audio_cipher.is_cipher_wav(cipher_upload):
            cipher_data, metadata = support.decode_audio_cipher(cipher_upload)
            reference, _ = support.decode_audio(payload)
        elif image_cipher.is_cipher_png(cipher_upload):
            cipher_data, metadata = support.decode_image_cipher(cipher_upload)
            reference, _ = support.decode_image(payload,
                                                greyscale=cipher_data.shape[0] == 1)
        else:
            raise HTTPException(400, "that file is not a PhaseForge cipher PNG or WAV")
        expected = tuple(metadata.get("original_shape") or
                         (metadata.get("channels"), metadata.get("length")))
        if tuple(reference.shape) != expected:
            raise HTTPException(
                400, "the original file does not match the ciphertext "
                     f"(expected shape {list(expected)}, got {list(reference.shape)})")
        report = attacks.robustness_report(reference, cipher_data, passphrase, metadata)
        return {"kind": metadata.get("kind"), "report": support.json_safe(report)}

    return await support.run_job(work)


def _probe_image(size):
    """A recognisable test card, so the recovered plaintext is visibly right."""
    y, x = np.mgrid[0:size, 0:size] / size
    radius = np.hypot(x - 0.5, y - 0.5)
    rings = 0.5 + 0.5 * np.cos(radius * 40.0)
    checker = ((np.floor(x * 8) + np.floor(y * 8)) % 2).astype(float)
    card = 0.55 * rings + 0.25 * checker + 0.2 * x
    card[radius < 0.12] = 1.0
    return np.clip(card, 0.0, 1.0)


def _png_data_url(array):
    buffer = io.BytesIO()
    image_io.save_image(buffer, array, format="PNG")
    return "data:image/png;base64," + base64.b64encode(buffer.getvalue()).decode("ascii")


@router.post("/kpa-demo")
async def kpa_demo(request: KpaRequest):
    """Recover a plaintext with no passphrase, given a reused DRPE key.

    Two probe encryptions are enough: DRPE is linear, so an impulse probe
    exposes the frequency mask and a flat probe exposes the spatial one. This
    is the concrete argument for why key reuse is fatal here.
    """
    size = request.size
    if size & (size - 1):
        raise HTTPException(400, f"size must be a power of two, got {size}")

    def work():
        oracle = attacks.build_oracle("a passphrase the attacker never learns")
        secret = _probe_image(size)
        ciphertext = oracle(secret)
        recovered = attacks.chosen_plaintext_attack(oracle, (size, size))(ciphertext)
        return {
            "probes_used": 2,
            "size": size,
            "correlation": metrics.normalized_correlation(secret, recovered),
            "max_absolute_error": float(np.max(np.abs(recovered - secret))),
            "passphrase_guessed": False,
            "images": {
                "secret": _png_data_url(secret),
                "ciphertext": _png_data_url(image_io.normalize(np.abs(np.squeeze(ciphertext)))),
                "recovered": _png_data_url(recovered),
            },
        }

    return await support.run_job(work)
