"""FastAPI application.

A thin transport layer over the modules -- it decodes uploads, enforces
resource limits, calls one function, and streams the result back. No signal
processing happens here, and nothing is persisted: every request is
self-contained, so there is no upload store to expire, secure, or clean up.

Run it with::

    uvicorn phaseforge.api.app:app --reload
"""

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .. import __version__
from ..audio import drpe as audio_drpe
from ..core import framing
from ..image import freq_edit
from ..keys import derive
from . import support
from .routers import analysis, audio, image

DEFAULT_ORIGINS = "http://localhost:5173,http://localhost:3000"


def _allowed_origins():
    """CORS origins, overridable for deployment via PHASEFORGE_CORS_ORIGINS."""
    configured = os.environ.get("PHASEFORGE_CORS_ORIGINS", DEFAULT_ORIGINS)
    return [origin.strip() for origin in configured.split(",") if origin.strip()]


def create_app():
    app = FastAPI(
        title="PhaseForge",
        version=__version__,
        description="Fourier-domain image and audio security toolkit",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins(),
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
        expose_headers=["Content-Disposition"],
    )

    for router in (image.router, audio.router, analysis.router):
        app.include_router(router)

    @app.exception_handler(ValueError)
    async def value_error_handler(request, error):
        """Module-level validation failures are client errors, not crashes."""
        return JSONResponse(status_code=400, content={"detail": str(error)})

    @app.get("/api/health", tags=["meta"])
    async def health():
        return {"status": "ok", "version": __version__}

    @app.get("/api/info", tags=["meta"])
    async def info():
        """Defaults and limits, so the frontend need not hardcode them."""
        return {
            "version": __version__,
            "limits": {
                "max_image_pixels": support.MAX_IMAGE_PIXELS,
                "max_audio_samples": support.MAX_AUDIO_SAMPLES,
                "max_audio_channels": support.MAX_AUDIO_CHANNELS,
                "max_concurrent_jobs": support.MAX_CONCURRENT_JOBS,
                "audio_block_size": [audio_drpe.MIN_BLOCK_SIZE, audio_drpe.MAX_BLOCK_SIZE],
                "kdf_iterations": derive.MAX_ITERATIONS,
            },
            "defaults": {
                "kdf_iterations": derive.DEFAULT_ITERATIONS,
                "audio_block_size": audio_drpe.DEFAULT_BLOCK_SIZE,
                "stft_frame_length": framing.DEFAULT_FRAME_LENGTH,
                "filter_shapes": list(freq_edit.FILTER_SHAPES),
                "filter_kinds": ["low", "high", "band"],
            },
        }

    return app


app = create_app()
