# Regression Test Suite (`docs/REGRESSION_TESTS.md`)

| Test | Verification Scope | Method | Status | Notes |
|---|---|---|---|---|
| Test A — Application startup | Only floating XERO Dynamic Island renders on startup; Studio closed | Playwright Chromium (`1440x900`) | Passed | Verified in R1 & R2 |
| Test B — Open Studio | Studio opens in independent surface while XERO remains visible & animated | Playwright Chromium | Passed | Verified in R1 & R2 |
| Test C — Config synchronization | Emotion & settings changes in Studio sync live to XERO without reset | Playwright + BroadcastChannel | Passed | Verified in R1 & R2 |
| Test D — Close Studio | Closing Studio unmounts Studio while XERO stays active | Playwright Chromium | Passed | Verified in R1 & R2 |
| Test E — Emotional preservation | All 16 emotions, blink math, gaze clamping, and sentiment rules intact | `node:test` + Playwright | Passed | 7/7 unit tests pass |
| Test F — Active voice conversation | Opening/closing Studio preserves `islandMode` & listening/chat state | Code & Store inspection | Partial | Browser speech mic requires user mic hardware |
| Test G — Repeated Studio operations | Multiple open/close cycles create 0 duplicate islands or windows | Playwright Chromium | Passed | Verified `count === 1` |
| Test H — Visual comparison | Restrained obsidian/cyan cyberpunk refinement without replacing face | Playwright screenshots | Passed | Verified R1 & R2 |
| Test I — Feature preservation | Offline engine, Local LLM discovery/proxy, Gemini SSE, timers, music, clipboard, shelf | `node:test` + Playwright + `curl` | Passed | Verified |
| Test J — Persistent configuration | Preferences persist in `localStorage` & sync via `BroadcastChannel` | Store & browser reload check | Passed | Verified |
| Test K — Safe-change recovery | Targeted patches applied cleanly without rewriting protected files | Change ledger | Passed | Documented |
| Test L — Build integrity | `tsc --noEmit`, `vite build`, `tsx --test` | CLI checks | Passed | Clean build |

## Native Windows Runtime Caveat
This environment runs in a Linux container with headless Chromium (`playwright-cli`). Native Windows capabilities (Electron/Tauri transparent always-on-top overlay, global OS hotkeys outside the browser, native Windows tray integration, and direct local screen capture) require verification on a native Windows host.
