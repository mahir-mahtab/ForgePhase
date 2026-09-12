# PhaseForge setup and running guide

## Prerequisites

- Windows PowerShell
- Python environment already created at `backend\.venv312`
- Node.js and npm

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

## Image encryption workflow

1. Open the Image workspace.
2. Select an input image and enter a passphrase.
3. Run **Encrypt image**.
4. Download either component separately or download the ZIP bundle:
   - `cipher-real.png`
   - `cipher-imaginary.png`
   - `cipher-pair.zip`
5. In the Decrypt tab, upload both PNG components and enter the same passphrase.

Image ciphertext is stored as two metadata-bearing 16-bit PNGs. Audio encryption
continues to use its `.npz` container.

## Useful checks

Backend tests:

```powershell
cd D:\code\forgePhase\backend
.\.venv312\Scripts\python.exe -m pytest -q -p no:cacheprovider --basetemp D:\code\forgePhase\.pytest-tmp
```

Frontend build and lint:

```powershell
cd D:\code\forgePhase\frontend
npm run build
npm run lint
```

## Stop the services

- Press `Ctrl+C` in each running terminal.
- If port 8000 is still occupied, identify it with:

```powershell
netstat -ano | Select-String ':8000'
```
