# PhaseForge setup and running guide

## Prerequisites

- Windows PowerShell
- Python environment already created at `backend\.venv312`
- Node.js and npm

To create the Python environment from scratch instead, install the package
with its API and test extras (this also registers the `phaseforge` command):

```powershell
cd D:\code\forgePhase\backend
py -3.12 -m venv .venv312
.\.venv312\Scripts\python.exe -m pip install -e ".[dev]"
```

## Start the backend

Open a terminal and run:

```powershell
cd D:\code\forgePhase\backend
.\.venv312\Scripts\python.exe -m uvicorn phaseforge.api.app:app --reload --host 127.0.0.1 --port 8000
```

Keep this terminal running.

Check that the backend is healthy:

```powershell
Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8000/api/health
```

Expected response:

```json
{"status":"ok","version":"0.1.0"}
```

## Start the frontend

Open a second terminal and run:

```powershell
cd D:\code\forgePhase\frontend
npm install
npm run dev
```

Open the URL printed by Vite, normally:

```text
http://localhost:5173
```

The Vite development server proxies `/api` requests to the backend on port 8000.

The header shows whether the API is reachable. All transforms use NumPy's
built-in FFT. Inputs that have a matching demo file offer **Use sample**.

## Image encryption workflow

1. Open the Image workspace.
2. Select an input image and enter a passphrase.
3. Click **Encrypt**.
4. Download `cipher.png` -- a single picture that looks like pure noise.
5. Click **Open in Decrypt** (or, later, upload `cipher.png` in the Decrypt
   tab) and enter the same passphrase.

Image ciphertext is stored as one metadata-bearing 16-bit PNG: the real planes
of the complex ciphertext stacked above the imaginary planes. Keep it as a PNG;
re-saving as JPEG or resizing destroys it.

Audio works the same way: encryption gives one `cipher.wav` that plays as
static (for twice the original length, since it holds both the real and
imaginary halves), and decryption needs only that WAV and the passphrase. Keep
it as a WAV; converting to MP3 or editing it destroys it.

## What else is in the app

| Workspace | Tab | Does |
| --- | --- | --- |
| Image | Watermark | Embed a mark in the spectrum; **Check with Extract** recovers it |
| Image | Filter | Low/high/band-pass with a live mask preview |
| Image | Spectrum | Magnitude spectrum of an image or of a cipher PNG |
| Image | Analysis | Robustness report, and the key-reuse (chosen-plaintext) attack demo |
| Audio | Denoise | Spectral subtraction using the opening frames as the noise profile |
| Audio | Enhance | Speech-band boost plus a noise gate |
| Audio | Analysis | Robustness report for an encrypted audio WAV |

## Command line

The same operations are available without the UI; each panel's
**Command-line equivalent** shows the exact call. For example:

```powershell
cd D:\code\forgePhase\backend
.\.venv312\Scripts\python.exe -m phaseforge --help
.\.venv312\Scripts\python.exe -m phaseforge kpa-demo
```

## Useful checks

Backend tests:

```powershell
cd D:\code\forgePhase\backend
.\.venv312\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp D:\code\forgePhase\.pytest-tmp
```

Frontend tests, build and lint:

```powershell
cd D:\code\forgePhase\frontend
npm test
npm run build
npm run lint
```

## Configuration

| Variable | Default | Meaning |
| --- | --- | --- |
| `PHASEFORGE_MAX_JOBS` | `2` | Transforms the API runs at once; each can use a few hundred MB for large images |
| `PHASEFORGE_CORS_ORIGINS` | `http://localhost:5173,http://localhost:3000` | Allowed browser origins when not using the Vite proxy |
| `VITE_API_BASE_URL` | `/api` | Where a frontend build sends requests |

## Stop the services

- Press `Ctrl+C` in each running terminal.
- If port 8000 is still occupied, identify it with:

```powershell
netstat -ano | Select-String ':8000'
```
