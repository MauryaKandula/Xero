# Protected Components (`docs/PROTECTED_COMPONENTS.md`)

The following modules are classified as **Protected Components** and must not be replaced, simplified, or unmounted during unrelated changes:

| Component / Module | Responsibility | Protection Rule |
|---|---|---|
| `src/components/xero/XeroFace.tsx` | XERO's animated SVG facial geometry, eyes, pupils, eyebrows, mouth, cheeks | Never replace with orbs, particles, helmets, or static icons. Preserve expression transitions & gaze tracking. |
| `src/core/emotions.ts` | 16-emotion state machine, facial geometry targets, sentiment inference, blink & gaze math | Read-only unless fixing a verified defect with regression tests. |
| `src/components/xero/DynamicIsland.tsx` | Floating Dynamic Island proportions, compact/expanded states, contextual widgets, Open Studio trigger | Never embed Studio configuration panels inside the Dynamic Island. |
| `src/core/store.ts` | Single source of truth for settings, conversation, timers, clipboard, file shelf, and window lifecycle | Prevent duplicate background services; preserve live sync without resetting XERO's emotion. |
| `src/core/offlineEngine.ts` | 100% offline deterministic assistant engine (math, timers, reminders, memory, transport, conversational replies) | Never remove offline capability or gate core functionality behind paid/online accounts. |
