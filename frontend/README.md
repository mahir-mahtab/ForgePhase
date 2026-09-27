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

Start the backend first (see the [project README](../README.md)), then:

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
│   ├── layout/               Sidebar, API status, theme toggle
│   └── shared/               Operation card, dropzone, key selector, result views
├── features/
│   ├── image/                Encrypt, decrypt, watermark, filter, hybrid, analysis
│   └── audio/                Encrypt, decrypt, watermark, denoise, enhance, analysis
├── hooks/                    useOperation, useKeyInput, usePixelLimit, …
├── lib/                      Pure helpers: CLI quoting, report parsing, and
│                             ports of backend rules (mask, limits)
└── services/                 The only code that talks to the network
```

## Behaviour worth knowing

- **One request per panel.** `useOperation` aborts an in-flight request when a
  new one starts, on Cancel, and on unmount.
- **State survives navigation.** Tabs are force-mounted and visited workspaces
  stay mounted, so switching tabs or between Image and Audio keeps files and
  results.
- **One way to enter a key.** Every panel that encrypts, decrypts or analyses
  a cipher uses `KeySelector` with the `useKeyInput` hook, so a passphrase,
  key image or key audio file is validated, worded and sent the same way
  everywhere.
- **Handoffs.** Encrypt results have *Open in Decrypt*; a watermark embed
  (image or audio) has *Check with Extract*, which fills in both files.
- **Samples.** `vite.config.ts` serves the repository's `samples/` folder at
  `/samples` and copies it into the build. `lib/samples.ts` lists one entry
  per input, offered via *Use sample*; a sample cipher also fills in its
  passphrase.
- **Client-side ports.** `lib/mask.ts` mirrors `freq_edit.build_mask` for the
  live filter preview, and `lib/limits.ts` mirrors the API's pixel limits, so
  an oversized image is caught before a request. The backend
  still validates everything. Keep each in step with its Python original.
- **Blob URLs** are created and revoked by `useObjectUrl`, never by the
  services, so previews stay valid under React StrictMode.

## Design

Warm paper surfaces, near-black ink, a deep green accent and a lilac
highlight on the main action; EB Garamond for titles over Figtree, and a
single radius scale. Light and dark themes are defined as tokens on `:root`
and `.dark` in `src/index.css`; an inline script in `index.html` applies the
stored theme before first paint. Components reference tokens only, so the look
can be changed from that one file.
