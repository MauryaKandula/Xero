# Safe-Change Protocol (`docs/SAFE_CHANGE_PROTOCOL.md`)

All edits to Project XERO follow:

`INSPECT -> BASELINE -> BACKUP -> PLAN -> PATCH -> TEST -> COMPARE -> COMMIT OR ROLLBACK`

## Change Authorization Levels
- **GREEN**: Design tokens, CSS refinements, subtle neon edge lighting, non-breaking bug fixes, documentation, unit/regression tests.
- **AMBER**: Window lifecycle management, BroadcastChannel/storage state sync, Express proxy routes, AI provider routing, voice/audio services, dependency updates.
- **RED**: Rewrites, framework migrations, modifying XERO's facial geometry/emotional state machine (`XeroFace.tsx`, `emotions.ts`) beyond verified defect fixes, merging XERO and Studio, removing features.

## Validation Gates
1. Pure logic unit tests (`npx --yes tsx --test src/core/*.test.ts`) pass.
2. TypeScript check (`npm run lint`) passes with 0 errors.
3. Production build (`npm run build`) succeeds.
4. Browser verification (`playwright-cli`) confirms startup independence, Studio lifecycle, AI engine routing (offline/local/cloud), and visual quality.
