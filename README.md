# PROJECT XERO

An original, real-time voice and desktop companion built around a centered OLED **Dynamic Island (`XERO`)** paired with an independent **XERO Studio** control centre (`/?window=studio`). Combines full-duplex **Gemini Live voice** (female JARVIS-calibrated `Kore` / `Zephyr` presets), **HeyNixi-inspired top-bezel Hide/Peek**, **Offline Core**, and **Local LLM (Ollama / LM Studio)** support.

> **Release Note**: Binary archives created via `npm run package` (`release/XERO-Desktop-Suite.zip`) contain unsigned portable web/Node source and compiled production assets. Installers and code-signed native OS binaries are not included.

---

## Prerequisites

- **Node.js 20+** (LTS 22 recommended) and **npm**
- Modern Chromium, Edge, Firefox, or Safari browser with Web Audio API (`AudioWorklet` + automatic `ScriptProcessorNode` fallback)
- Optional: `GEMINI_API_KEY` for cloud Gemini chat & Gemini Live voice streaming
- Optional: Local Ollama (`http://127.0.0.1:11434`) or LM Studio (`http://127.0.0.1:1234/v1`) server

---

## Setup & Secrets Configuration

1. **Install dependencies**:
   ```bash
   npm install
   ```
   Or use one-click scripts:
   - **Linux / macOS**: `chmod +x setup.sh && ./setup.sh`
   - **Windows**: Double-click `setup.bat` (or launch standalone chromeless app mode with `powershell -ExecutionPolicy Bypass -File scripts/launch-xero.ps1`)

2. **Configure environment secrets** (optional for Gemini Live / Gemini Cloud):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and set your server-side key (`GEMINI_API_KEY` is never exposed to browser JS):
   ```env
   GEMINI_API_KEY="your-gemini-api-key"
   PORT=3000
   ```

---

## Run, Verify & Build Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Express + Vite development server on port `3000` |
| `npm test` | Run core unit test suite (`tsx --test src/core/*.test.ts`) |
| `npm run lint` | TypeScript strict typecheck (`tsc --noEmit`) |
| `npm run build` | Build production frontend bundle & PWA assets into `dist/` |
| `npm start` | Start Express backend serving production `dist/` on port `3000` |
| `npm run package` | Package unsigned portable archive into `release/XERO-Desktop-Suite.zip` |

Open `http://localhost:3000` in your browser (or `http://localhost:3000/?window=studio` for standalone Studio).

---

## Install as an App (PWA)

PROJECT XERO ships with a Web App Manifest (`/manifest.webmanifest`) and Service Worker (`vite-plugin-pwa`) that keep `/api/*` responses, transcripts, and audio streams strictly out of offline caches (`NetworkOnly`):

- **Desktop Chrome / Edge**: Click the **Install** icon in the address bar or open **XERO Studio → Diagnostics → Install App**.
- **iOS Safari**: Tap **Share → Add to Home Screen**.
- **Android Chrome**: Tap **Install app** from the browser prompt or menu.

---

## Supported Features & Voice Workflow

- **Real-Time Gemini Live Voice**: Click the notch microphone icon in **Command** mode to start a full-duplex `16kHz` PCM stream (`gemini-3.8-live` or `gemini-3.8-live-extended-thinking`). Speak over XERO anytime to trigger immediate barge-in interruption and playback flush.
- **Voice Wakeup**: Enable `"Hey Xero"` (or a custom wake phrase) in **XERO Studio → Voice & Privacy** for lightweight Web Speech triggering.
- **Everyday Voice & Chat Commands**:
  - `"Catch me up."` — Summarizes Decisions, Open Questions, and Next Steps.
  - `"Capture that."` — Extracts recent highlights or checklist items into Notes (exportable as `.md` from the Notes tab).
  - `"Focus for 25 minutes."` — Starts an app-local focus timer; also supports `"time left"`, `"pause timer"`, `"resume timer"`, and confirmation-gated `"cancel timer"`.
  - `"Keep it short"` / `"Go deeper"` — Adjusts session response depth without adding main-screen clutter.
  - `"Remember I prefer short answers."` — Prompts local confirmation before saving persistent preferences (inspect/edit/clear in **XERO Studio → Personalization**).
- **Protected 2D Expressive Companion**: 16 emotional states, natural irregular blinking, damped cursor tracking, petting/boop reactions, music synth + synced lyrics, clipboard guard, and file shelf Canvas image tools.

---

## Microphone & Audio Troubleshooting

1. **Permission Denied / Blocked in Iframe**: Click the padlock/site-settings icon beside the URL bar, set **Microphone → Allow**, then toggle the XERO mic button again. In embedded iframes, ensure `microphone` is permitted in the host frame (`metadata.json`).
2. **Audio Output Silent**: Browser autoplay policies may pause audio contexts until a click or tap occurs—tap the XERO notch or toggle mute once to resume playback.
3. **Missing Microphone or No `GEMINI_API_KEY`**: XERO falls back cleanly to typed chat (`Offline Core` / Local LLM) and surfaces non-blocking status feedback inside the notch without locking the UI.

---

## Legal & Project Policies

- [License (MIT)](./LICENSE)
- [Changelog](./CHANGELOG.md)
- [Privacy Policy (Draft)](./PRIVACY.md)
- [Terms of Use (Draft)](./TERMS.md)
- [Security Policy](./SECURITY.md)
- [Third-Party Notices](./THIRD_PARTY_NOTICES.md)
- [Contributing](./CONTRIBUTING.md)
