"""
Face-Cam anti-spoofing service.

Contract (consumed by apps/api):

    GET  /health  -> {"status": "ok", "model": "<name>", "ready": <bool>}
    POST /score   -> multipart image field `file`
                     {"spoofScore": float|null, "label": str, "model": str, "ready": bool}

`spoofScore` is the probability that the presented face is a PRESENTATION
ATTACK (a photo, a screen, a mask) rather than a live person. Higher means more
likely fake.

IMPORTANT — this service ships WITHOUT model weights.

Until weights are installed it returns `spoofScore: null` and `label:
"unknown"`. It deliberately does NOT return a fabricated score. A made-up
number here would be worse than no number at all: it would look like a working
liveness check in the dashboard and in demos while providing zero protection,
which is exactly the failure mode this service exists to prevent.

The API records a null score without blocking the scan, which is correct for
v1's log-only mode (see PROJECT_DESCRIPTION.md section 7). Before enabling
enforce mode, install real weights. See README.md in this directory.
"""

import io
import os
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from PIL import Image

MODEL_DIR = Path(os.environ.get("MODEL_DIR", "/models"))
MAX_IMAGE_BYTES = 8 * 1024 * 1024

app = FastAPI(title="Face-Cam Anti-Spoof", version="0.1.0")


class Detector:
    """Wraps the anti-spoof model. Reports `ready=False` when no weights exist."""

    def __init__(self) -> None:
        self.model = None
        self.name = "none"
        self._load()

    def _load(self) -> None:
        weights = sorted(MODEL_DIR.glob("*.pth")) if MODEL_DIR.is_dir() else []
        if not weights:
            return

        # Placeholder for the real loader. Implement alongside the weights so
        # that `ready` only ever becomes True when scoring genuinely works.
        # from minifasnet import MiniFASNet
        # self.model = MiniFASNet.load(weights[0])
        # self.name = weights[0].stem
        return

    @property
    def ready(self) -> bool:
        return self.model is not None

    def score(self, image: Image.Image) -> float:
        if self.model is None:
            raise RuntimeError("No anti-spoof model loaded")
        raise NotImplementedError("Wire the real model inference here")


detector = Detector()


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model": detector.name, "ready": detector.ready}


@app.post("/score")
async def score(file: UploadFile = File(...)) -> dict:
    raw = await file.read()

    if not raw:
        raise HTTPException(status_code=400, detail="Empty image")
    if len(raw) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=413, detail="Image too large")

    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception:
        raise HTTPException(status_code=400, detail="Not a decodable image")

    if not detector.ready:
        # Honest "I don't know" rather than a fabricated score.
        return {
            "spoofScore": None,
            "label": "unknown",
            "model": detector.name,
            "ready": False,
        }

    value = detector.score(image)
    return {
        "spoofScore": value,
        "label": "spoof" if value >= 0.5 else "real",
        "model": detector.name,
        "ready": True,
    }
