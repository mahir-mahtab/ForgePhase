# PhaseForge — frontend

React interface for the `phaseforge` Fourier-domain image and audio security
toolkit. Every command the Python CLI exposes is available here and talks to
the FastAPI backend.

## Stack

| Concern | Choice |
| --- | --- |
| Build | Vite 8 |
| UI | React 19 + TypeScript (strict) |
| Styling | Tailwind v4, tokens in `src/index.css` |
| Primitives | shadcn/ui on Radix, vendored in `src/components/ui` |
| Icons | lucide-react |
| Tests | Vitest |

## Getting started

Start the backend first (see `../SETUP.md`), then:

```bash
npm install
npm run dev
```

Open http://localhost:5173. The dev server proxies `/api` to
`http://127.0.0.1:8000`, so no CORS setup is needed. To talk to a backend
elsewhere, set `VITE_API_BASE_URL` at build time.

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Typecheck, then a production bundle in `dist/` |
| `npm run preview` | Serve the built bundle |
| `npm run lint` | oxlint |
| `npm test` | Vitest unit tests for `src/lib` |

## Layout

```
src/
├── App.tsx                   Workspace switching
├── index.css                 Design tokens (light and dark)
├── components/
│   ├── ui/                   shadcn primitives (vendored source)
│   ├── layout/               Top bar, API status, theme toggle
│   └── shared/               Operation card, dropzone, result views, tables
├── features/
│   ├── image/                Encrypt, decrypt, watermark, filter, spectrum, analysis
│   └── audio/                Encrypt, decrypt, denoise, enhance, analysis
├── hooks/                    useOperation, useBackendStatus, useImageSize, …
├── lib/                      Pure helpers: CLI quoting, report
│                             parsing, filter mask and watermark-range ports
└── services/                 The only code that talks to the network
```

## Behaviour worth knowing

- **One request per panel.** `useOperation` aborts an in-flight request when a
  new one starts, on Cancel, and on unmount.
- **State survives navigation.** Tabs are force-mounted and visited workspaces
  stay mounted, so switching tabs or between Image and Audio keeps files and
  results.
- **Handoffs.** Encrypt results have *Open in Decrypt*; a watermark embed has
  *Check with Extract*, which fills in the matching size, strength and
  position.
- **Samples.** `public/samples` holds a test image, a watermark and two speech
  clips, offered via *Use sample* on the relevant inputs.
- **Client-side ports.** `lib/mask.ts` mirrors `freq_edit.build_mask` for the
  live filter preview, and `lib/watermark.ts` mirrors
  `watermark.position_range` so invalid watermark positions are caught before
  a request. Both are unit-tested against values from the Python side.
- **Blob URLs** are created and revoked by `useObjectUrl`, never by the
  services, so previews stay valid under React StrictMode.

## Design

Deliberately plain: neutral surfaces, one indigo accent, the system font, and
a single radius scale. Light and dark themes are defined as tokens on `:root`
and `.dark` in `src/index.css`; an inline script in `index.html` applies the
stored theme before first paint. Components reference tokens only, so the look
can be changed from that one file.
