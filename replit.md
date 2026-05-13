# Scribe Studio

AI-powered subtitle generator that transcribes audio and video files using ElevenLabs Scribe-v2 and exports SRT/VTT subtitle files.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080)
- `pnpm --filter @workspace/subtitle-gen run dev` — run the frontend (port 22463)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required env: `ELEVENLABS_API_KEY` — ElevenLabs API key for Scribe-v2

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite, Tailwind CSS, shadcn/ui, framer-motion
- API: Express 5 with multer for file uploads
- Transcription: ElevenLabs Scribe-v2 (`/v1/speech-to-text`)
- Build: Vite (frontend), esbuild (API server)

## Where things live

- `artifacts/subtitle-gen/src/pages/SubtitleGenerator.tsx` — main UI component
- `artifacts/subtitle-gen/src/App.tsx` — app entry point
- `artifacts/subtitle-gen/api/transcribe.ts` — Vercel serverless function
- `artifacts/subtitle-gen/vercel.json` — Vercel deployment config
- `artifacts/api-server/src/routes/transcribe.ts` — Express transcription route (Replit dev)

## Architecture decisions

- Dual API target: Express route (`/api/transcribe`) for Replit dev, Vercel serverless function (`api/transcribe.ts`) for Vercel deployment
- File uploads handled with multer (server) / formidable (Vercel function) — both stream to memory
- Files forwarded to ElevenLabs using native Node.js Blob + FormData (no extra npm package)
- SRT/VTT generated entirely client-side from the word-level timestamps returned by Scribe-v2
- PORT and BASE_PATH are optional in vite.config.ts so Vercel can build without them

## Product

- Upload any audio or video file (MP4, MP3, WAV, OGG, M4A, FLAC, MOV, AVI, WebM, MKV, AAC) up to 500MB
- ElevenLabs Scribe-v2 transcribes with word-level timestamps and speaker diarization
- Download transcript as SRT or VTT subtitle file
- Detected language shown in results

## Vercel Deployment

1. Push to GitHub
2. Import project on Vercel
3. Set **Root Directory** to `artifacts/subtitle-gen`
4. Build Command: `vite build`
5. Output Directory: `dist/public`
6. Add environment variable: `ELEVENLABS_API_KEY`

## User preferences

- Deployable on Vercel

## Gotchas

- Vercel serverless functions have a ~100MB request body limit; very large files work better on Replit deployment
- `PORT` and `BASE_PATH` env vars are required by Replit workflows but optional for Vercel builds
