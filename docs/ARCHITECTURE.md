# Architecture (`docs/ARCHITECTURE.md`)

## Core Separation: XERO vs. XERO Studio

```text
DESKTOP / BROWSER WORKSPACE
│
├── XERO (src/components/xero/DynamicIsland.tsx)
│   ├── Floating Dynamic Island (fixed top-center, compact / hovered / expanded / minimized)
│   ├── Protected Animated Face (src/components/xero/XeroFace.tsx)
│   ├── 16-Emotion State Machine (src/core/emotions.ts)
│   ├── Voice Dictation & Speech Synthesis (src/core/audioEngine.ts)
│   ├── AI Conversation (Offline Core / Local LLM / Server-Side Gemini)
│   ├── Contextual Widgets (Timers, Reminders, Music, Clipboard, Drag-and-Drop File Shelf)
│   └── "Open Studio" trigger
│           │
│           ▼
│   XERO STUDIO (src/components/studio/XeroStudioWindow.tsx)
│   ├── Independent floating desktop window OR standalone pop-out window (/?window=studio)
│   ├── General, Appearance, AI & Local LLM, Voice & Audio, Personalization, Expressions, Diagnostics
│   └── Suspended when closed (zero background render cost)
│
└── Shared Singleton Services
    ├── src/core/store.ts (useSyncExternalStore + localStorage + BroadcastChannel)
    ├── src/core/aiClient.ts (Auto / Offline / Local LLM / Gemini routing)
    ├── src/core/offlineEngine.ts (Zero-network deterministic skills)
    └── server.ts (Express + Vite + @google/genai + Local LLM proxy)
```

## AI Engine Modes
1. **Offline Core (`offlineEngine.ts`)**: Runs 100% locally with zero network or API keys. Supports arithmetic/math, timers, reminders, ambient synth music, persistent local memory, expression shifts, and conversational replies.
2. **Local LLM (`aiClient.ts` + `/api/ai/local` + `/api/local/models`)**: Connects to Ollama (`/api/chat`, `/api/tags`) or OpenAI-compatible servers such as LM Studio / llama.cpp (`/v1/chat/completions`, `/v1/models`). Supports both server proxy and browser-direct localhost fallback.
3. **Cloud Gemini (`server.ts` `/api/ai/gemini`)**: Uses `@google/genai` server-side with `process.env.GEMINI_API_KEY` and SSE streaming (`gemini-4-hydrogen` / `gemini-3.1-flash-lite`), keeping keys strictly server-side with zero key UI.
4. **Auto Smart Routing**: Evaluates network state, server key status, and local LLM availability, falling back smoothly to Offline Core if remote or local endpoints are unreachable.
