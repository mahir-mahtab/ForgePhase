"""Small, bounded audit probes. Run with backend's environment from repo root.

No network calls or large allocations. Dangerous resource parameters are
intercepted before processing. This script does not modify application code.
"""
import asyncio
import io
import json
from pathlib import Path
import runpy
import sys
import time
import types
from unittest.mock import patch

import numpy as np
from fastapi import UploadFile
from fastapi.testclient import TestClient

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
from phaseforge.api.app import create_app
from phaseforge.api import support
from phaseforge.api.routers import image as image_router
from phaseforge.analysis import metrics
from phaseforge.core import transform
from phaseforge.image import watermark, freq_edit
from phaseforge.io import image_io, audio_io, container


def png(array):
    output = io.BytesIO()
    image_io.save_image(output, array, format="PNG")
    return output.getvalue()


def npz(data, metadata):
    output = io.BytesIO()
    container.save_container(output, data, metadata)
    return output.getvalue()


def emit(label, **values):
    print(json.dumps({"probe": label, **values}))


client = TestClient(create_app(), raise_server_exceptions=False)
rng = np.random.default_rng(23)
image = rng.uniform(0.2, 0.7, (1, 64, 64))
picture = png(image)

for name, meta in [
    ("missing salt", {"kind": "image"}),
    ("missing iterations", {"kind": "image", "salt": b"a" * 16}),
]:
    response = client.post("/api/image/decrypt", files={"file": ("cipher.npz", npz(np.zeros((1, 8, 8), complex), meta))}, data={"passphrase": "test"})
    emit("malformed container", case=name, status=response.status_code)

# Demonstrate unbounded client-controlled KDF cost without actually executing it.
meta = {"kind": "image", "salt": b"a" * 16, "iterations": 2_000_000_000, "original_shape": [1, 8, 8]}
with patch("phaseforge.keys.derive.derive_key", side_effect=ValueError("audit intercepted KDF")) as derive:
    client.post("/api/image/decrypt", files={"file": ("cipher.npz", npz(np.zeros((1, 8, 8), complex), meta))}, data={"passphrase": "test"})
    emit("KDF validation", reached_kdf=derive.called, iterations=derive.call_args.args[2] if derive.called else None)

wave = io.BytesIO()
audio_io.save_audio(wave, np.zeros((1, 16)), 16000, format="WAV")
with patch("phaseforge.api.routers.audio.drpe.encrypt", side_effect=ValueError("audit intercepted allocation")) as encrypt:
    response = client.post("/api/audio/encrypt", files={"file": ("tiny.wav", wave.getvalue())}, data={"passphrase": "test", "block_size": 1 << 30})
    emit("audio block resource validation", upload_bytes=len(wave.getvalue()), reached_encrypt=encrypt.called, block_size=encrypt.call_args.kwargs.get("block_size") if encrypt.called else None)

for size, position in [(64, .25), (65, .25), (64, .05)]:
    original = rng.uniform(.2, .7, (1, size, size))
    mark = rng.random((16, 16))
    marked = watermark.embed(original, mark, position=position)
    recovered = watermark.extract(original, marked, mark.shape, position=position)
    emit("watermark roundtrip", image_size=size, position=position, max_error=float(np.max(np.abs(recovered - mark))), correlation=metrics.normalized_correlation(mark, recovered))

for h, strength in [(0, .15), (8, 0)]:
    response = client.post("/api/image/watermark/extract", files={"original": ("a.png", picture), "marked": ("b.png", picture)}, data={"height": h, "width": 8, "strength": strength})
    emit("watermark parameter validation", height=h, strength=strength, status=response.status_code)

response = client.post("/api/audio/denoise", files={"file": ("a.wav", wave.getvalue())}, data={"noise_frames": 0})
emit("denoise parameter validation", noise_frames=0, status=response.status_code)

# The repository's own radix-2 test implementation rejects unpadded lengths.
reference = runpy.run_path(str(ROOT / "backend/tests/test_backend_swap.py"))
transform.register_backend("audit-radix2", types.SimpleNamespace(**{name: reference["_" + name] for name in ("fft", "ifft", "fft2", "ifft2")}))
with transform.using_backend("audit-radix2"):
    for name, operation in [("filter", lambda: freq_edit.apply_filter(np.ones((1, 63, 65)))), ("spectrum", lambda: freq_edit.spectrum_preview(np.ones((1, 63, 65)))), ("watermark", lambda: watermark.embed(np.ones((1, 63, 65)), np.ones((8, 8))))]:
        try:
            operation()
            emit("radix-2 contract", operation=name, outcome="ok")
        except ValueError as error:
            emit("radix-2 contract", operation=name, outcome=str(error))

original = rng.uniform(.2, .7, (3, 64, 64))
original[0] = 0
mark = rng.random((8, 8))
marked = watermark.embed(original, mark)
recovered = watermark.extract(original, marked, mark.shape)
emit("watermark black channel", recovered_is_finite=bool(np.isfinite(recovered).all()))

async def responsiveness():
    observed = []
    loop = asyncio.get_running_loop()
    original_encrypt = image_router.drpe.encrypt
    def monitored_encrypt(*args, **kwargs):
        loop.call_soon(lambda: observed.append(time.perf_counter()))
        return original_encrypt(*args, **kwargs)
    started = time.perf_counter()
    with patch.object(image_router.drpe, "encrypt", monitored_encrypt):
        await image_router.encrypt(UploadFile(filename="a.png", file=io.BytesIO(picture)), "audit", False)
    elapsed = time.perf_counter() - started
    emit("API event loop", elapsed_seconds=elapsed, scheduled_callback_ran=bool(observed))
    await asyncio.sleep(0)

asyncio.run(responsiveness())

response = client.post("/api/image-encrypt", files={"file": ("a.png", picture)}, data={"passphrase": "test"})
emit("frontend reference URL", path="/api/image-encrypt", status=response.status_code)

# Ordinary, permitted RGB image. Checks whether its own encrypted download is
# larger than the same API's upload cap. Under 300 MB of transform intermediates.
source = rng.uniform(.2, .7, (3, 513, 513))
response = client.post("/api/image/encrypt", files={"file": ("image.png", png(source))}, data={"passphrase": "audit"})
decrypted = client.post("/api/image/decrypt", files={"file": ("cipher.npz", response.content)}, data={"passphrase": "audit"})
emit("encrypted container roundtrip limits", image_pixels=513 * 513, encrypt_status=response.status_code, download_bytes=len(response.content), upload_limit=support.MAX_UPLOAD_BYTES, decrypt_status=decrypted.status_code)
