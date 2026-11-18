# Contributing to PROJECT XERO

Thank you for helping improve XERO! Before submitting a pull request, please review our engineering constraints in `AGENTS.md`:

## Core Rules

1. **Keep XERO & Studio Independent**: `DynamicIsland` and `XeroStudioWindow` (`/?window=studio`) must maintain separate lifecycles.
2. **Protect XERO's Facial System**: `src/components/xero/XeroFace.tsx` and `src/core/emotions.ts` preserve all 16 emotional expressions, capsule-pill geometry, gaze tracking, and blinking.
3. **Verify Before Opening a PR**:
   ```bash
   npx --yes tsx --test src/core/*.test.ts
   npm run lint
   npm run build
   ```
4. **Document Changes**: Record behavioral or architectural changes concisely in `docs/CHANGE_LEDGER.md`.
