# PhaseForge implementation audit

Date: 2026-09-10

The NumPy backend has substantial working functionality and passing tests, but ordinary inputs expose correctness and round-trip failures. Address the two P1 findings first, then watermark correctness and API validation. Frontend transport and the custom FFT are explicitly unfinished; their absence is treated as planned work, with integration risks called out separately.

## Scope and verification

Reviewed the Python processing modules, API, CLI, container handling, backend interface, tests, and React services, hooks, forms, and result components. No application source was changed. Audit files were added, and the frontend build regenerated `dist`.

- Backend: **190 passed, 8 skipped** using the existing virtual environment. The skips are for the unimplemented custom FFT. Two dependency deprecation warnings appeared.
- Frontend: **production build passed**. Lint completed with two React Fast Refresh export warnings in the vendored button/badge components.
- Additional probes: [reproduce.py](D:/code/forgePhase/audit/reproduce.py), with saved [evidence.txt](D:/code/forgePhase/audit/evidence.txt).
- No browser interaction, deployed-service load test, fresh-environment install, or formal cryptographic review was performed. Resource abuse probes intercepted dangerous parameters before computation or allocation.
- The workspace has no Git repository, so this is an audit of the current files, not a commit or diff review.

## Confirmed findings

### 1. P1 — The API cannot decrypt some containers it successfully produces

Location: [support.py:23](D:/code/forgePhase/backend/phaseforge/api/support.py:23), [image decrypt:30](D:/code/forgePhase/backend/phaseforge/api/routers/image.py:30).

The same 32 MiB upload cap applies to source media and encrypted containers. DRPE pads image dimensions to powers of two and writes complex128 ciphertext, so accepted images can produce much larger downloads.

**Reproduction:** a 513×513 RGB image is only 263,169 pixels, well below the 1,048,576-pixel limit. Encryption returned HTTP 200 and a 48,164,740-byte NPZ. Uploading that exact response to image decryption returned **HTTP 413**. This blocks the core encrypt/download/decrypt workflow even with the correct passphrase and an untouched file.

**Fix:** budget source inputs, padded transform memory, and ciphertext uploads together. Either accept every container that permitted encryption can produce, with appropriate decoded-memory bounds, or reject source inputs before encryption when their output cannot be supported. Add an API round-trip case just beyond a power-of-two boundary.

### 2. P1 — Request parameters bypass intended processing resource limits

Location: [audio.py:16](D:/code/forgePhase/backend/phaseforge/api/routers/audio.py:16), [image DRPE decryption](D:/code/forgePhase/backend/phaseforge/image/drpe.py:75), [container.py:38](D:/code/forgePhase/backend/phaseforge/io/container.py:38).

The audio endpoint checks only whether `block_size` is a power of two. Container loading checks the format version but does not bound the metadata's KDF iteration count. Both values reach expensive processing directly.

**Reproduction:** a 76-byte WAV with `block_size=1073741824` reached `drpe.encrypt`. Even its first padded mono float64 buffer would require 8 GiB, before masks and complex intermediates. A tiny image NPZ with `iterations=2000000000` reached the KDF unchanged. Both calls were intercepted before expensive work; no large allocation or long KDF was executed.

**Fix:** enforce a supported block-size range and total padded allocation budget. Validate container metadata before processing, including bounded positive iterations, salt, supported dtype/dimensions/channels, and agreement between array shape and metadata. A compressed archive-size check alone does not bound all later allocations or work.

### 3. P2 — CPU-heavy processing blocks the API event loop

Location: [image.py:13](D:/code/forgePhase/backend/phaseforge/api/routers/image.py:13); the audio and analysis routes use the same pattern.

Routes are `async def`, but after reading uploads they call decoding, PBKDF2, transforms, and response compression synchronously. These operations occupy the event-loop thread, preventing that worker from servicing unrelated requests during processing.

**Reproduction:** a callback scheduled immediately before actual image encryption had still not run when the route returned. The small 64×64 case occupied approximately 74 ms including request work; the test establishes blocking, not a production throughput measurement. Larger images and attack reports do more work.

**Fix:** move the decode/process/encode section into a bounded worker executor or processing queue. Set concurrency according to memory needs. Verify that health checks remain responsive while an operation runs. Aborting a frontend fetch alone will not cancel this CPU work.

### 4. P2 — Watermark mirroring is incorrect for odd image dimensions

Location: [watermark.py:27](D:/code/forgePhase/backend/phaseforge/image/watermark.py:27), [watermark.py:62](D:/code/forgePhase/backend/phaseforge/image/watermark.py:62).

`_mirror` always reverses and rolls both axes by one, but it operates on a shifted spectrum. The correct conjugate partner mapping differs for odd and even axis lengths. The incorrect pairings break Hermitian symmetry; discarding the reconstruction's imaginary part then loses watermark information.

**Reproduction:** with an asymmetric random 16×16 watermark and default position, a 64×64 carrier round-tripped to about `4.4e-14` maximum error. A 65×65 carrier had maximum error **0.485** and correlation **0.692**, before any PNG quantization or attack.

**Fix:** mirror in unshifted coordinates or use a parity-aware mapping. Cover even/even, odd/odd, and mixed-parity carriers with asymmetric marks.

### 5. P2 — Allowed watermark positions can overlap the mirrored mark

Location: [watermark.py:32](D:/code/forgePhase/backend/phaseforge/image/watermark.py:32), [WatermarkPanel.tsx](D:/code/forgePhase/frontend/src/features/image/components/WatermarkPanel.tsx).

`block_slice` rejects oversized marks and a top-boundary overflow, but does not ensure that the selected block and its conjugate mirror are disjoint. Embedding adds both fields, while extraction assumes the selected region contains only the original mark.

**Reproduction:** a 64×64 carrier, 16×16 mark, and `position=0.05` are accepted and lie within the UI slider range. The round-trip maximum error was **0.993**, with correlation **0.658**. The slider also permits values up to 0.95, many of which necessarily place the block outside the spectrum.

**Fix:** validate placement against carrier and watermark dimensions, including mirrored-region intersection and boundaries. Derive the UI's valid range from the same geometry. Correct the position description to match the actual height-based offset.

### 6. P2 — A zero-energy color channel poisons watermark extraction

Location: [watermark.py:82](D:/code/forgePhase/backend/phaseforge/image/watermark.py:82).

Extraction divides by each channel's mean spectral magnitude. If a channel is entirely black, its scale is zero. This creates NaNs, and the final channel mean propagates them across the recovered watermark, even when the other channels contain a valid mark.

**Reproduction:** a three-channel carrier with one all-zero channel produced a non-finite recovered watermark. Separately, `strength=0` was accepted by the API and returned HTTP 200 after invalid-value warnings and image casting.

**Fix:** validate finite, positive strength; combine only channels with usable spectral energy. Define an explicit outcome when no channel can carry a mark. Test pure-color images as well as fully black carriers.

### 7. P2 — Structurally invalid containers escape as server errors

Location: [container.py:36](D:/code/forgePhase/backend/phaseforge/io/container.py:36), [image.py:31](D:/code/forgePhase/backend/phaseforge/api/routers/image.py:31).

Valid ZIP/NPZ syntax plus a recognized version is insufficient to establish a valid ciphertext container. Required metadata fields are accessed later with dictionary indexing; the API maps `ValueError` to a client error but leaves these `KeyError` cases unhandled.

**Reproduction:** containers with `kind="image"` but missing either `salt` or `iterations` each returned **HTTP 500**. Existing tests cover non-ZIP files and missing archive entries, but not incomplete metadata.

**Fix:** use a per-kind container schema before invoking decryptors. Reject malformed metadata and mismatched arrays with a useful 400/422 response. Keep this validation separate from broad exception suppression so programming errors remain observable.

### 8. P2 — Zero noise-profile frames produces an invalid successful denoise response

Location: [denoise.py:36](D:/code/forgePhase/backend/phaseforge/audio/denoise.py:36), [audio.py:38](D:/code/forgePhase/backend/phaseforge/api/routers/audio.py:38).

`noise_frames` is exposed as an unrestricted integer. Zero takes the mean of an empty spectrum slice, causing NaNs to propagate through reconstruction.

**Reproduction:** posting a valid small WAV with `noise_frames=0` returned **HTTP 200** while emitting empty-slice and invalid-division warnings. The automated tests reject an invalid subtraction factor but do not cover this parameter.

**Fix:** require a positive frame count in both the API and processing function; reject non-finite numeric controls before DSP. Add a check that successful DSP results are finite before encoding them.

### 9. P2 — The promised radix-2-only backend interface is not upheld

Location: [custom_backend.py:19](D:/code/forgePhase/backend/phaseforge/core/backends/custom_backend.py:19), [freq_edit.py:67](D:/code/forgePhase/backend/phaseforge/image/freq_edit.py:67), [watermark.py:59](D:/code/forgePhase/backend/phaseforge/image/watermark.py:59).

The custom backend's documented contract guarantees power-of-two inputs and says implementing four FFT functions is sufficient. Image DRPE pads its input, but filtering, spectrum rendering, and watermarking pass arbitrary image sizes directly to `fft2`.

**Reproduction:** registering the repository's own independent radix-2 reference backend caused all three operations on a 63×65 carrier to fail with `length must be a power of two, got 65`. Existing swap tests use power-of-two carriers for these operations.

**Fix:** decide whether arbitrary-length transforms belong in the backend contract or whether the processing modules will pad consistently. If padding, preserve filter geometry, watermark placement, extraction agreement, and output cropping. Include non-power-of-two carriers in backend-swap tests before implementing the custom FFT.

## Planned integration work with existing contract conflicts

The frontend deliberately returns `not-implemented`; that is not counted as a broken completed feature. However, its documented transport replacement is not currently mechanical.

| Concern | Frontend expectation | Existing API |
| --- | --- | --- |
| Paths | `/api/image-encrypt`, `/api/filter`, etc. | `/api/image/encrypt`, `/api/image/filter`, etc. |
| Artifact responses | JSON `ArtifactResult`, including URL and details | Binary NPZ/PNG/WAV attachments |
| Robustness response | `{kind, rows: [{attack, metrics}]}` | `{kind, report: {attack: metrics}}` |
| Metric fields | `psnrDb`, `snrDb`, `segmentalSnrDb`, numeric values | Snake-case keys; non-finite values become strings |
| FFT selector | Every request includes `backend` | Routes accept no per-request backend selection |

The URL mismatch was confirmed with HTTP 404. [client.ts:107](D:/code/forgePhase/frontend/src/services/client.ts:107) always calls `response.json()`, so fixing paths alone still cannot handle successful file responses. The report requires explicit normalization before [MetricsTable.tsx](D:/code/forgePhase/frontend/src/components/shared/MetricsTable.tsx) can render it.

Implement an operation-to-endpoint map, request field mapping, blob handling with object-URL cleanup, and report normalization. Handle NaN separately from positive/negative infinity: the current [formatMetric](D:/code/forgePhase/frontend/src/lib/format.ts:25) displays NaN as negative infinity. Keep the unfinished custom option unavailable until supported. If adding per-request backend selection, avoid using the process-global `_active` setting concurrently without request isolation.

## Other completion gaps

- `pyproject.toml` declares only numerical/media runtime dependencies and pytest in the dev extra. API dependencies and httpx exist only in `requirements.txt`. A package-based installation with the dev extra is therefore insufficient to run the full test suite/API. Consolidate dependency declarations or document separate installation paths.
- The UI's fallback commands invoke `phaseforge`, but there is no `[project.scripts]` console entry point. Register one or generate `python -m phaseforge` commands. Quote file arguments so names containing spaces work.
- No frontend test script is configured. The highest-value next coverage is one real image and audio round trip, response/download rendering, report normalization, cancellation, and error display once transport exists.
- The code explicitly documents that DRPE has no integrity check and wrong keys return noise. Preserve that distinction when completing the UI; this audit does not certify it as production cryptography.

## Suggested order

1. Align encryption/decryption size limits and constrain KDF/block allocation costs.
2. Validate containers and DSP parameters, then repair watermark geometry and zero-energy handling.
3. Offload processing with bounded concurrency.
4. Resolve the frontend/API contract and verify real round trips.
5. Settle the transform length contract, implement the custom FFT, and remove the corresponding test skips.

Run the audit probes from the workspace root with `backend\.venv\Scripts\python.exe audit\reproduce.py`. They are diagnostic reproductions, not a replacement for regression assertions in the existing suite.


## Resolution status (2026-09-24)

All findings above have been addressed. Regression tests live in
`backend/tests/test_hardening.py` and are named after the finding they guard.

| # | Finding | Resolution |
| --- | --- | --- |
| 1 | API cannot decrypt containers it produced | Image ciphertext is now a 16-bit PNG pair whose decode budget covers every padded shape encryption can produce. Verified live: a 513x513 RGB image encrypts to a 12 MB pair and decrypts exactly. |
| 2 | Parameters bypass resource limits | `block_size` must be a power of two in [64, 65536], checked before the upload is decoded. KDF iterations are bounded to [1, 2,000,000] in `derive_key` itself, so every container path is covered. |
| 3 | CPU work blocks the event loop | All decode/transform/encode work runs in worker threads behind a capacity limiter (`PHASEFORGE_MAX_JOBS`, default 2). Verified live: `/api/health` answered in 15-30 ms during a 2.4 s encryption. |
| 4 | Watermark mirror wrong for odd sizes | Mirroring is parity-aware; round trips are exact (error < 1e-8) for even, odd and mixed carriers. |
| 5 | Positions overlapping the mirror | `block_slice` requires the block to sit strictly in the upper half-plane and reports the valid range. `position_range` is ported to the UI, which blocks invalid positions before sending. |
| 6 | Zero-energy channels, zero strength | Strength must be finite and positive; extraction skips channels with no spectral energy, and a fully black carrier is a clear 400. |
| 7 | Malformed containers return 500 | Audio containers are validated as a whole (fields, types, salt, shape and block count against metadata, finiteness) before decryption; unreadable archives are 400. |
| 8 | `noise_frames=0` produces NaN | `noise_frames >= 1` and all numeric DSP controls must be finite; DSP results are checked for finiteness before encoding. |
| 9 | Custom backend is radix-2 only | The custom backend handles any length via Bluestein's algorithm over its own radix-2 FFT; filter, spectrum and watermark run on 63x65 carriers under it. |

The frontend/API contract table is also resolved: every operation is wired to
its real endpoint, binary responses are handled as files, robustness reports
are normalized (`lib/report.ts`, with NaN and infinities parsed separately),
and every processing route accepts a per-request `backend`, isolated per
request with a context variable rather than a module global.

Other gaps: `pyproject.toml` now has `api` and `dev` extras and a `phaseforge`
console script; CLI commands shown in the UI quote their arguments; the
frontend has a Vitest suite (`npm test`).

The DRPE caveats stand: there is no integrity check, a wrong passphrase yields
noise, and key reuse is fatal (demonstrated in the UI's key-reuse attack
panel). This is still not production cryptography.
