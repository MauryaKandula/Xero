# Privacy Policy — PROJECT XERO

> **DRAFT NOTICE — REQUIRES OPERATOR REVIEW**: Replace `[OPERATOR_NAME]` and `[CONTACT_EMAIL]` and verify deployment-specific data retention settings before publishing or distributing publicly.

Last updated: November 2026

PROJECT XERO is operated by `[OPERATOR_NAME]` (contact: `[CONTACT_EMAIL]`) and is engineered around a **local-first, privacy-minimal architecture**.

## 1. Local Browser Storage & Retention Defaults

- **Transcript Persistence (Opt-In, Default Off)**: Chat and voice transcripts live strictly in volatile runtime memory by default (`privacy.persistChatHistory: false`). Nothing is written to `localStorage` unless you explicitly opt in inside **XERO Studio → Voice & Audio**.
- **Audio Recordings (Never Retained)**: Live microphone input and spoken replies stream transiently in memory over WebSocket (`16kHz` PCM up / `24kHz` PCM down) and are **never saved to browser storage or server disk** (`privacy.retainAudioRecordings: false` locked).
- **Offline Cache Exclusions**: The PWA Service Worker excludes all `/api/*` requests (`NetworkOnly`) and server endpoints send `Cache-Control: no-store`, ensuring private tokens and assistant outputs never enter offline caches.
- **Preferences, Notes & Memory**: Appearance settings, saved preferences (`xero.memory.v1`), timers, to-do lists, notes, and shelf items remain local in your browser. Sensitive clipboard patterns (API keys, bearer tokens, PEM blocks) are automatically rejected before saving. You can inspect, export, or wipe all local data anytime via **XERO Studio → Personalization** or **Clear Local Data**.

## 2. AI & Live Voice Processing Modes

You control which backend processes each interaction inside **XERO Studio → AI & Local LLM**:

1. **Offline Core**: Zero network traffic. Timers, notes, math, unit conversions, catch-up summaries, and workspace controls execute locally in browser code.
2. **Local LLM (Ollama / LM Studio / OpenAI-compatible)**: Prompts are proxied only to the local endpoint you configure (e.g. `http://127.0.0.1:11434`).
3. **Gemini Cloud & Gemini Live Voice (Optional)**: When online and `GEMINI_API_KEY` is configured on the Express server, prompts and transient Live audio frames are relayed securely from the backend server to the Google Gemini API (`@google/genai`). Browser clients authenticate to `/api/live/ws` using short-lived, single-use session tokens (`/api/live/token`); the long-lived `GEMINI_API_KEY` never leaves the server.

## 3. Microphone & Display Permissions

- **Microphone**: Requested strictly upon user gesture (clicking the microphone icon or enabling Voice Wakeup). Capturing stops immediately when Live voice ends, XERO minimizes/hides, or the tab unloads (`pagehide`).
- **Display Sharing (`getDisplayMedia`)**: Requested only when you explicitly click **Screen Assist**.
