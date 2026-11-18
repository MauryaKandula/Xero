# Changelog — PROJECT XERO

All notable changes to XERO are documented in this file.

## [1.1.0] — 2026-11-18
### Added
- **Full-Duplex Gemini Live Voice (`liveSessionController` + `/api/live/ws` + `/api/live/token`)**:
  - Single-use HMAC-SHA256 ephemeral WebSocket tokens with server-side sliding-window rate limiting while keeping `GEMINI_API_KEY` isolated on the Express backend.
  - Off-main-thread 16kHz Int16 PCM capture via `AudioWorkletNode` (`/audio/pcm-capture-worklet.js`) with automatic `ScriptProcessorNode` fallback and 24kHz gapless playback.
  - Immediate barge-in interruption that stops queued audio playback and discards late audio frames from interrupted turns (`LiveTurnTracker`).
  - Bounded exponential-backoff reconnects (`max 2` attempts), mute toggle, rapid-toggle cancellation protection, and full resource cleanup on stop, hide, `Escape`, or `pagehide`.
  - Configurable Live model (`gemini-3.8-live` default or `gemini-3.8-live-extended-thinking`) and female voice presets (`Kore` default JARVIS warmth, `Zephyr` crisp clarity) in XERO Studio.
- **Versioned Runtime Prompt & Everyday Voice Workflows (`src/core/assistantPrompt.ts`, `src/core/toolValidation.ts`)**:
  - Separated versioned system instruction (`v2.0.0`) enforcing concise, calm, interruptible answers, mixed-language matching, and non-fabricated confirmations.
  - `"Catch me up."` (session Decisions, Open Questions, Next Steps), `"Capture that."` (note/checklist extraction + Markdown export), `"Focus for 25 minutes."` + `"time left"` / `"pause timer"` / `"resume timer"` / `"cancel timer"`, `"Keep it short"` / `"Go deeper"` session response depth, and `"Remember I prefer short answers."` confirmation workflow.
  - Schema-validated tool dispatch, bounded retry write deduplication (`ToolWriteDeduplicator`), and inline confirmation banners before destructive actions or saving persistent preferences.
- **Original App Icons & Installable PWA (`vite-plugin-pwa`)**:
  - Created custom `#050608` / `#00E5FF` / `#9C6BFF` / `#EDF5FF` twin-pill signal icons (`public/icons/icon.svg`, `icon-maskable.svg`, `pwa-192x192.png`, `pwa-512x512.png`, `pwa-maskable-512x512.png`, `apple-touch-icon.png`, and `favicon.ico`).
  - Configured PWA manifest, Service Worker (`NetworkOnly` for `/api/*`), and in-Studio Install prompt (`usePWAInstall`).
- **Release & Legal Completeness**:
  - Updated `README.md`, `PRIVACY.md` (draft review markers), `TERMS.md` (draft review markers), `SECURITY.md`, `CONTRIBUTING.md`, `THIRD_PARTY_NOTICES.md`, `docs/ASSET_INVENTORY.md`, and `npm run package` archive coverage.

### Fixed
- Added `max-h-[calc(100dvh-56px)] sm:max-h-none overflow-y-auto` on expanded mobile drawer to prevent virtual keyboards from clipping the chat composer on small screens.
- Enforced `Cache-Control: no-store` on all `/api/*` endpoints so live tokens and assistant responses stay out of offline caches.

## [1.0.0] — Initial Release
- Centered OLED Dynamic Island companion (`XeroFace` 16 emotions with damped gaze tracking), HeyNixi-inspired Hide/Peek, Web Speech wake-word (`Hey Xero`), Offline Core, Local LLM (Ollama/LM Studio), D3.js System Health telemetry, and independent XERO Studio (`/?window=studio`) + Teleprompter windows.
