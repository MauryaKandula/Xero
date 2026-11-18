# PROJECT XERO — Capability Verification Status Matrix

This ledger classifies every Protocol 02 & Protocol 03 capability honestly across browser preview (`http://localhost:3000`) and future Windows desktop Electron/Tauri builds.

| Capability | Classification | Notes & Verification Basis |
| --- | --- | --- |
| Dynamic Island resting notch, hover reveal, spring expand/collapse, hide-up/peek | **Already implemented and verified** | Physics springs (`NOTCH_OPEN_SPRING`, `NOTCH_CLOSE_SPRING`), animated bezel corner ears, deterministic width targets |
| Protected 16 Facial Expressions + 2D pill eyes + additive nuances | **Newly implemented and verified** | `ALL_EMOTIONS` (16 states preserved) + 8 complementary `EmotionNuance` modifiers in `XeroFace.tsx` |
| Drag-out-of-notch to free-floating companion + snap/button re-dock + persistence | **Newly implemented and verified** | Pointer drag on notch capsule bar persists coordinates (`xero.position.v1`); Re-dock button + top-center magnetic snap |
| Living pet behaviors (inactivity sleepiness, natural waking, spontaneous moods, greeting, Studio toggle) | **Newly implemented and verified** | Controlled by `settings.general.spontaneousBehavior` |
| Compact Contextual Menu (`Widgets`, `System`, `Apps`, `Music`, `Productivity`, `Shelf`, `Appearance`, `Studio`) | **Newly implemented and verified** | In-notch menu (`NotchContextMenu.tsx`) with 9 Appearance presets, notch shapes (`bezel`, `pill`, `squircle`), opacity & edge glow |
| Independent `COMMAND` / `DICTATE` / `WRITE` interaction modes | **Newly implemented and verified** | Distinct UI panels, `dictationEngine.ts` spoken punctuation/`"scratch that"`/custom vocab, offline & AI write transforms |
| Voice Recognition, Wake-word stripping, Music ducking, Silence cutoff, Language & Mic selection | **Newly implemented and verified** | `stripWakeWordPrefix`, `audioService.setDucked`, `enumerateDevices()`, multi-language (`en-US`, `en-IN`, `hi-IN`, `te-IN`, etc.) |
| Personality Voice Response Modes (`silent`, `chimes`, `system-voice`, `tts-provider`) | **Newly implemented and verified** | `SITUATION_VOICE_LINES` & `audioService.speakText` |
| Timestamp timers, Pomodoro/break presets, Stopwatch (lap/reset), To-Do/Shopping multi-item lists, Notes, Water tracker, World Clocks | **Newly implemented and verified** | `computeRemainingSeconds` prevents drift; `parseMultiListItems` tested via `node:test` |
| Music scrubbable seek, artwork accent, genuine timestamp-aligned Synced Lyrics + Pin Lyrics | **Newly implemented and verified** | `getActiveLyricIndex` & click-to-seek lyrics; floating `xero-pinned-lyrics` strip |
| File Shelf drag-and-drop, Document summarizer & Canvas Image Tools (`50%`, `Rotate 90°`, `Compress`, `PNG` — NEW copy) | **Newly implemented and verified** | `shelfTools.ts` & `transformShelfImageCopy` never overwrite originals |
| Privacy Clipboard Guard (`captureClipboardHistory` + `looksSensitiveCredential`) | **Newly implemented and verified** | Skips API keys, tokens, private keys, password strings |
| Pinned App/Web Shortcuts (up to 8, reorder, pin, remove, voice alias) | **Newly implemented and verified** | Persisted in `xero.shortcuts.v1` |
| Independent Floating Teleprompter (`import`, `fontSize`, `scrollSpeed`, `play/pause`, `progress`, click-to-jump, resize) | **Newly implemented and verified** | `TeleprompterWindow.tsx` isolated from Studio and XERO |
| Night Light warm optical filter, Brightness dimmer, Battery probe, Wake Lock, CapsLock/locale/audio output probe | **Browser preview only** | Works cleanly across the web app surface using Web APIs (`getBattery`, `wakeLock`, `enumerateDevices`) |
| Explicit Screen Assistance (`getDisplayMedia` capture + 2D workspace snapshot fallback) | **Browser preview only** | Captures live display stream when granted or falls back cleanly to 2D workspace snapshot |
| Global OS-wide hotkeys (`Right Ctrl` / `Right Alt` / `F9` outside browser), Wi-Fi / Bluetooth hardware toggles, Lock Screen, OS backlight, external app active-window text injection | **Implemented but requires Windows testing** | Honest guidance shown in UI & `offlineEngine`; requires native Windows Electron/Tauri host APIs |
| Live Local Ollama / LM Studio & optional GitHub remote push | **Blocked by a missing dependency or permission** | UI/client ready; requires local model runtime or authenticated git remote in environment |
