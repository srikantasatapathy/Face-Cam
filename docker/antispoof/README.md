# Anti-spoof service

Scores whether a captured face is a live person or a presentation attack
(printed photo, phone screen, video replay, mask).

## Current state

**This service ships without model weights and therefore does not detect
anything yet.** It returns `spoofScore: null` and `label: "unknown"`.

That is intentional. Returning a plausible-looking fake score would make the
dashboard and any demo appear to have working liveness detection while
providing none, which is a worse outcome than an obvious gap. The API records
the null and lets the scan through, which is correct for v1's log-only mode.

`GET /health` reports `ready: false` until real weights are installed, so the
gap is visible in the platform health check rather than hidden.

## Installing real weights

The intended model is **Silent-Face-Anti-Spoofing (MiniFASNet)**, which is
small, CPU-friendly (tens of milliseconds per frame) and permissively licensed.

1. Obtain the MiniFASNet weights and place the `.pth` files in a directory.
2. Mount it into the container at `/models`:

   ```yaml
   antispoof:
     build:
       context: ./antispoof
     volumes:
       - ./antispoof/models:/models
   ```

3. Implement `Detector._load` and `Detector.score` in `app.py`. Both are
   marked with explicit placeholders. Add `torch` and `opencv-python-headless`
   to `requirements.txt` at the same time.
4. Confirm `GET /health` now reports `ready: true`.

Do not commit weight files to this repository.

## Before enabling enforce mode

`ANTISPOOF_MODE=enforce` rejects scans above a tenant's `reject_spoof_above`
threshold. Do not enable it until:

- Real weights are installed and `ready: true`.
- Several weeks of log-only data exist for the tenant's actual cameras and
  lighting.
- A threshold has been chosen from that data.

Turning on enforcement with an untuned threshold rejects legitimate staff at
the gate, which is a much more visible failure than the spoofing it prevents.

## Contract

```
GET  /health
  -> {"status": "ok", "model": "none", "ready": false}

POST /score   (multipart, field name `file`)
  -> {"spoofScore": 0.03, "label": "real", "model": "minifasnet_v2", "ready": true}
  -> {"spoofScore": null, "label": "unknown", "model": "none", "ready": false}
```

`spoofScore` is the probability the face is **fake**. Higher means more likely
an attack.
