# Baseline Report (`docs/BASELINE.md`)

## Initial Repository Inspection (Phase 0)

- **Inspected Date**: 2026-11-15
- **Workspace Root**: `/app/applet`
- **Git Status**: Not initialized as a Git repository (`fatal: not a git repository`). No prior commit history or `codex://threads/01a1b259-202a-7181-a1f9-9e58c7491850` thread files exist inside this container.
- **Initial File Tree**:
  - `package.json` (`react@^19.0.1`, `react-dom@^19.0.1`, `vite@^8.3.0`, `@tailwindcss/vite@^4.3.3`, `@google/genai@^2.4.0` [installed `2.32.0`], `express@^4.21.2`, `lucide-react@^0.546.0`, `motion@^12.23.24`, `dotenv@^17.2.3`, `tsx@^4.21.0`, `typescript@^7.0.2`)
  - `index.html`, `src/App.tsx` (empty starter `<div></div>`), `src/main.tsx`, `src/index.css`, `tsconfig.json`, `vite.config.ts`, `metadata.json`, `.env.example`
- **Pre-existing Code State**:
  - Clean Vite + React 19 + Tailwind v4 starter template with no pre-existing HeyNixi / XERO components, no backend `server.ts`, and no tests.
- **Runtime Environment Constraints**:
  - Linux container running headless Chromium (`playwright-cli`) and Node.js server on port `3000`.
  - Native Windows APIs (Electron/Tauri desktop overlay, global OS hotkeys, system tray, native screen capture) cannot execute directly in this Linux/browser preview and must be explicitly scoped via runtime adapters and clearly labeled when simulated in browser preview.
