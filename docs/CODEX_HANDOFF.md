# Codex Handoff (`docs/CODEX_HANDOFF.md`)

## Summary
Implemented **PROJECT XERO** as two strictly independent surfaces sharing a singleton state & AI routing core:
1. **XERO (`DynamicIsland.tsx` + `XeroFace.tsx`)**: Floating Dynamic Island companion at top-center with 16 preserved emotional states, natural irregular blinking, pointer gaze tracking, speech mouth cadence, voice dictation/TTS, contextual widgets (Timers, Reminders, Web Audio Synth Music, Clipboard History, Drag-and-Drop File Shelf), and "Open Studio" trigger.
2. **XERO Studio (`XeroStudioWindow.tsx`)**: Independent draggable control centre window (plus standalone `/?window=studio` pop-out route synced via `BroadcastChannel`), suspended when closed so background overhead stays minimal.

## AI Capabilities (Offline + Local LLM + Online)
- **Offline Core (`src/core/offlineEngine.ts`)**: Deterministic execution with zero network/API keys (safe math, timers, reminders, music transport, persistent memory, emotion commands, offline conversation).
- **Local LLM (`src/core/aiClient.ts` + `server.ts`)**: Supports Ollama (`/api/chat`, `/api/tags`) and OpenAI-compatible servers like LM Studio / llama.cpp (`/v1/chat/completions`, `/v1/models`), including model discovery and connection probing.
- **Cloud Gemini (`server.ts`)**: Server-side `@google/genai` SSE streaming (`gemini-4-hydrogen`, `gemini-3.1-flash-lite`) using `process.env.GEMINI_API_KEY` with zero client key exposure or key input UI.

## Protected Files
- `src/components/xero/XeroFace.tsx`
- `src/core/emotions.ts`
- `src/components/xero/DynamicIsland.tsx`
- `src/core/store.ts`
- `src/core/offlineEngine.ts`

## Restoration & Aesthetic Constraints
- **HeyNixi-Faithful Living Notch**: Resting notch stays ultra-compact (`y=0`, inverted corner ears, status LED dot + pure-2D glowing pill eyes). Hovered bar stays assistant-first (concise label + active Mic + Studio icon + Hide-up); Screenshot, Volume, Breathe, Vitals, Timers, Music, Clipboard, and File Shelf remain integrated in the expanded drawer, voice/text commands, shortcuts, and collapsed-by-default `Preview Tools`.
- **Calibrated Palette & Typography**: `#050608` void canvas, `#0B0E12` obsidian surfaces, `#12161B` elevated cards, `#EDF5FF` primary text, `#8793A3` secondary text, `#00E5FF` / `#9C6BFF` subtle accents, `Inter` UI typography + tabular `JetBrains Mono` strictly for numeric readouts.

## Next Steps for Windows Native Packaging
- Wrap `dist/` and `server.ts` (or equivalent IPC bridge) in Electron/Tauri where XERO mounts in a transparent, frameless `alwaysOnTop` `BrowserWindow` and "Open Studio" launches a separate native `BrowserWindow` pointing to `/?window=studio`.
- Wire global OS shortcut (`globalShortcut`) to toggle XERO's `BroadcastChannel` / IPC expand command.
