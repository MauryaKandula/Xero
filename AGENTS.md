# AGENTS.md — Permanent Development Constraints for PROJECT XERO

1. **XERO and Studio Must Remain Independent**:
   - XERO (`DynamicIsland` / assistant surface) and XERO Studio (`XeroStudioWindow` / `/?window=studio`) are separate rendering surfaces with independent lifecycles.
   - Never merge Studio controls into XERO's Dynamic Island.
   - Never replace XERO's assistant surface with Studio when Studio opens.
   - Closing or minimizing Studio must never close, unmount, or reset XERO.

2. **XERO's Facial Expressions and Emotional Behaviours Are Protected**:
   - `src/components/xero/XeroFace.tsx` and `src/core/emotions.ts` are protected components.
   - Never replace XERO's face with generic orbs, particles, robotic helmets, or static emojis.
   - Preserve all 16 emotional expressions, natural irregular blinking, gaze tracking, and speech mouth modulation.
   - Neon cyberpunk accents apply to the interface surrounding the face, never overwriting the face's expressive character.

3. **Existing Working Functionality Must Not Be Removed**:
   - Preserve offline built-in AI engine, Local LLM (Ollama / LM Studio / OpenAI-compatible) support, server-side Gemini integration, voice dictation/TTS, timers, reminders, music transport, clipboard history, file shelf drag-and-drop, persistent memory, and keyboard shortcuts.

4. **Changes Must Be Incremental, Tested, and Reversible**:
   - Follow the Safe-Change Protocol (`docs/SAFE_CHANGE_PROTOCOL.md`).
   - Run unit tests (`npx --yes tsx --test src/core/*.test.ts`), `npm run lint`, and `npm run build` after changes.
   - Record meaningful modifications in `docs/CHANGE_LEDGER.md`.

5. **Native Functionality Must Not Be Misrepresented**:
   - Browser preview uses an independent floating window surface plus optional native browser pop-out (`/?window=studio`) synced via `BroadcastChannel`.
   - Clearly distinguish browser-simulated desktop overlay behavior from native Windows Electron/Tauri overlay behavior.

6. **Destructive Changes Require Explicit Authorization**:
   - Never perform complete rewrites, framework migrations, face replacements, or feature removals without explicit user approval.
