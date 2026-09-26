# PhaseForge

A Fourier-domain toolkit for images and audio: encryption with double random
phase encoding (DRPE), spectral watermarking, frequency filtering, speech
clean-up, and tools that show how the cipher holds up and where it breaks.

It is a Python package with a command-line interface and a FastAPI backend,
plus a React app in `frontend/` that covers every command.

> DRPE is a teaching cipher. It is linear, has no integrity check, and falls
> to a chosen-plaintext attack when a key is reused (the app demonstrates
> this). Do not use it to protect real secrets.

## Features

| Workspace | Tool | What it does |
| --- | --- | --- |
| Image | Encrypt | Scrambles an image into one noise-like 16-bit `cipher.png` |
| Image | Decrypt | Restores the image from `cipher.png` and the key |
| Image | Watermark | Hides a mark (greyscale or colour) in the magnitude spectrum, and extracts it again |
| Image | Filter | Low-, high- or band-pass with Gaussian, Butterworth or ideal masks, with a live mask preview |
| Image | Spectrum | Log-scaled magnitude spectrum of an image or of a cipher PNG |
| Image | Analysis | Robustness report, and the key-reuse attack demo |
| Audio | Encrypt | Block-by-block DRPE into one `cipher.wav` that plays as static |
| Audio | Decrypt | Restores the recording from `cipher.wav` and the key |
| Audio | Denoise | Spectral subtraction, learning the noise from the opening frames |
| Audio | Enhance | Speech-band boost plus a spectral noise gate |
| Audio | Analysis | Robustness report for an encrypted recording |

**Keys.** Anything that encrypts, decrypts or analyses a cipher takes a
passphrase, an image file or an audio file as the key. A key file's pixels or
samples are the key, so it must be byte-for-byte the same file at decryption:
prefer PNG over JPEG, and lossless audio. A passphrase is stretched with
PBKDF2 (200,000 iterations) and a fresh random salt per file, so the same
passphrase never produces the same masks twice.

**Size limits.** Encryption pads each side up to a power of two, so it accepts
images up to 1 megapixel (1024 × 1024). Watermark, Filter and Spectrum work at
the image's own size and accept up to 4 megapixels. The app flags an
oversized image, with a size that fits, before uploading it. Audio is limited
to 2,880,000 samples per channel (60 seconds at 48 kHz) and two channels.

## Getting started

You need Python 3.10 or newer (3.12 is what the project is developed on) and
Node.js with npm. The commands below are for Windows PowerShell; on macOS or
Linux use `.venv312/bin/python` in place of `.\.venv312\Scripts\python.exe`.

### 1. Backend

```powershell
cd backend
py -3.12 -m venv .venv312
.\.venv312\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv312\Scripts\python.exe dev.py
```

`dev.py` serves the API on http://127.0.0.1:8000 and restarts it whenever a
file in `phaseforge/` changes. Check it with:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/health
```

which returns `{"status":"ok","version":"0.1.0"}`.

### 2. Frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to the backend, and
the sidebar shows whether the API is reachable. Inputs with a matching demo
file offer **Use sample**.

## Using it

**Encrypt and decrypt.** Choose a file and a key and click **Encrypt**. The
result is a single `cipher.png` or `cipher.wav`; **Open in Decrypt** carries
it straight over. Keep the cipher exactly as it is: re-saving a PNG as JPEG,
resizing it, or converting a WAV to MP3 destroys it. A cipher WAV plays for
twice the original length, because it holds both the real and imaginary
halves. There is no checksum, so a wrong key gives noise, not an error.

**Watermark.** Embed a mark, then **Check with Extract** fills in the matching
size, strength, position and colour setting. Extraction compares against the
original image, so keep it. Transparent areas of a mark count as white. A
colour watermark keeps the mark's colours on a colour image, at the cost of
some coloured speckle; on a greyscale image it falls back to grey.

**Analysis.** The robustness report damages a cipher (noise, a missing block,
coarse quantization), decrypts each copy with the correct key and scores the
result against the original. The key-reuse attack encrypts two chosen probe
images under one key, recovers both masks, and decrypts a secret image without
the passphrase.

## Command line

Every tool is also a `phaseforge` command, and each panel's
**Command-line equivalent** shows the exact call for its current settings.

```powershell
cd backend
.\.venv312\Scripts\python.exe -m phaseforge --help
.\.venv312\Scripts\python.exe -m phaseforge image-encrypt photo.png cipher.png
.\.venv312\Scripts\python.exe -m phaseforge key-reuse-demo --size 64
```

A passphrase is prompted for unless `--passphrase` is given; `--key-image` or
`--key-audio` use a key file instead.

## Development

```powershell
# Backend tests
cd backend
.\.venv312\Scripts\python.exe -m pytest -q

# Frontend tests, lint and production build
cd frontend
npm test
npm run lint
npm run build
```

### Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PHASEFORGE_MAX_JOBS` | `2` | Transforms the API runs at once; each can use several hundred MB on a large image |
| `PHASEFORGE_CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Browser origins allowed when not going through the Vite proxy |
| `VITE_API_BASE_URL` | `/api` | Where a frontend build sends requests |

### Layout

```
backend/
├── dev.py            Auto-reloading development server
├── phaseforge/
│   ├── core/         FFT wrappers, padding, framing
│   ├── keys/         Passphrase and key-file derivation (PBKDF2)
│   ├── image/        DRPE, watermarking, frequency filters
│   ├── audio/        Block DRPE, denoising, speech enhancement
│   ├── analysis/     Robustness attacks, the key-reuse break, metrics
│   ├── io/           Image and audio files, cipher PNG/WAV containers
│   ├── api/          FastAPI app and routers
│   └── cli.py        The phaseforge command
├── samples/          Demo inputs and the script that makes them
└── tests/
frontend/             React app; see frontend/README.md
```

### Troubleshooting

- **Port 8000 is already in use.** Another backend is still running. Find it
  with `netstat -ano | Select-String ':8000'` and stop that process.
- **The app says the API is unreachable.** Start the backend first; the app
  re-checks when its window regains focus.
- **Backend edits don't take effect.** Run the server with `dev.py`.
  `uvicorn --reload` on Windows can hang when the server has no console
  window, leaving the old code running.
