# Samples

One folder per operation. Each holds that operation's inputs, and what it
produces from them as `result_*`. Every panel in the app has a **Use sample**
button that loads the inputs from here.

Everything encrypted here uses the passphrase **`phaseforge-sample`**.
The app fills it in when you load a sample cipher.

| Folder | Inputs | Settings | Result |
| --- | --- | --- | --- |
| `image-encrypt` | `image.png` | passphrase | `result_cipher.png` (noise-like 16-bit PNG) |
| `image-decrypt` | `cipher.png` | passphrase | `result_restored.png` |
| `watermark-embed` | `image.png`, `watermark.png` | none | `result_watermarked.png` |
| `watermark-extract` | `original.png`, `watermarked.png` | none | `result_extracted.png` |
| `filter` | `image.png` | Gaussian, cutoff 0.04 | `result_low_pass.png`, `result_high_pass.png` |
| `hybrid` | `near.png` (angry), `far.png` (happy) | near cutoff 0.12, far cutoff 0.03 | `result_hybrid.png`, `result_distance.png` |
| `image-analysis` | `cipher.png`, `original.png` | passphrase | `result_report.json` |
| `audio-encrypt` | `speech.wav` | passphrase, block size 4096 | `result_cipher.wav` |
| `audio-decrypt` | `cipher.wav` | passphrase | `result_restored.wav` |
| `denoise` | `noisy.wav` | defaults | `result_denoised.wav` |
| `enhance` | `noisy.wav` | defaults | `result_enhanced.wav` |
| `audio-watermark-embed` | `speech.wav`, `chime.wav` | none | `result_watermarked.wav` |
| `audio-watermark-extract` | `original.wav`, `watermarked.wav` | none | `result_extracted.wav` |
| `audio-analysis` | `cipher.wav`, `original.wav` | passphrase | `result_report.json` |

The key-reuse attack needs no files: it makes its own images.

A cipher's salt is random, so regenerating gives a different `cipher.png` or
`cipher.wav` that still decrypts with the same passphrase.

## Regenerating

From the repository root:

```powershell
.\backend\.venv312\Scripts\python.exe samples\make_samples.py
```

The script rebuilds every folder. The inputs are drawn or synthesized in code,
so no outside files are needed.
