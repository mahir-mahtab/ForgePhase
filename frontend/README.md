# PhaseForge — frontend

React interface for the `phaseforge` Fourier-domain image and audio security
toolkit. Two workspaces, one per domain, covering every command the Python CLI
exposes.

Image and audio encryption/decryption are connected to the Python API. The
remaining service calls are typed stubs that resolve with a `not-implemented`
result, which the UI renders as a calm "Backend not connected" panel alongside
the equivalent CLI invocation. Forms, validation, cancellation, loading, error
and result states are all live.

## Stack

| Concern | Choice | Why |
| --- | --- | --- |
| Build | Vite 8 | The backend is Python, so there is no server-side React to host. |
| UI | React 19 + TypeScript (strict) | |
| Styling | Tailwind v4 | Tokens live in `src/index.css`; no config file needed. |
| Primitives | shadcn/ui on Radix | Accessible, unstyled, and vendored as source in `src/components/ui`. |
| Icons | lucide-react | |

## Getting started

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck, then a production bundle in `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | oxlint |

## Layout

```
src/
├── main.tsx                  Entry point
├── App.tsx                   Section state, backend state, code splitting
├── index.css                 Design tokens and base layer
├── components/
│   ├── ui/                   shadcn primitives (vendored source)
│   ├── layout/               App shell, sidebar, header, theme toggle
│   └── shared/               Cross-domain pieces: dropzone, result panel, …
├── features/
│   ├── image/                Image workspace and its six panels
│   └── audio/                Audio workspace and its five panels
├── hooks/                    useOperation, useTheme, useLatest, useObjectUrl
├── lib/                      cn, formatters, file-accept constants
└── services/                 Backend contract — the only place that will do I/O
```

Each workspace is a lazily loaded chunk, so opening the app downloads one
domain, not both.

## Sections

**Image** — `image-encrypt`, `image-decrypt`, `watermark-embed`,
`watermark-extract`, `filter`, `spectrum`, `attack-report`.

**Audio** — `audio-encrypt`, `audio-decrypt`, `denoise`, `enhance`,
`attack-report`.

The DFT backend selector in the header maps to the CLI's global `--backend`
flag and covers both `numpy` and `custom`.

## Wiring up the backend

The encryption/decryption operations demonstrate the connection pattern. Image
encryption returns a ZIP containing two metadata-bearing 16-bit PNGs (real and
imaginary components); image decryption uploads that pair. Audio encryption
continues to use its `.npz` container.

1. **`src/services/types.ts`** already describes every request and response.
   Each field carries the CLI flag it corresponds to.
2. **`src/services/client.ts`** holds the multipart HTTP helpers and
   `notImplemented()` for operations that remain disconnected.
3. **`src/services/imageService.ts`** and **`audioService.ts`** have one
   function per command. Connected operations pack their requests into
   `FormData`; the remaining functions still call `notImplemented()`.

`AbortSignal` is already threaded through every layer, so cancellation works
the moment a real request exists.

Point Vite at the Python process with `VITE_API_BASE_URL`, or leave it unset:
the dev server proxies `/api` to `http://127.0.0.1:8000` (see
`vite.config.ts`), which keeps requests same-origin and avoids needing CORS.

## Design notes

The organising idea is **an instrument with two channels**. CH1 is the image
path, CH2 the audio path, and they are the only two saturated colours in the
system — signal orange and electric blue. Everything structural is a cool
neutral, so colour always means routing, never decoration.

- **Flat colour, no gradients.** Every fill is solid. Hierarchy comes from value
  steps, borders, and the channel accent.
- **Radii carry hierarchy.** Instruments (spectrum plates, waveform strips,
  result images) are square. Controls are soft-cornered. Cards sit between.
  Nothing shares one radius by default.
- **One family, two widths.** Archivo carries a width axis, and width is the
  expressive device: headings widen to 115%, dense metadata narrows to 88%,
  body sits at 100%. Spline Sans Mono is reserved for machine text — CLI
  strings, metric values, channel ids — never for labels.
- **The live mask is the one bold element.** `src/lib/mask.ts` ports
  `freq_edit.build_mask` to the browser, so the filter panel plots the exact
  gain field the backend would build, with no round trip. The plate is a
  contour plot; the trace beneath it is the continuous function.
- **Light and dark.** Tokens are defined on `:root` and overridden under
  `.dark`. An inline script in `index.html` applies the stored theme before
  first paint, so there is no flash of the wrong one.
- **Accessibility floor.** Body text is 15.8:1, both channel colours clear
  4.5:1 on card in both themes, keyboard focus is a 2px offset outline on every
  control, and `prefers-reduced-motion` is respected.

Rebrand by editing `src/index.css` alone — components only reference tokens.
