# Security Policy — PROJECT XERO

## Supported Versions

Only the current release line (`1.x` on `main`) receives active security fixes.

## Key Security Architecture

- **Server-Side API Key Isolation**: `GEMINI_API_KEY` is read strictly inside `server.ts` on the Node backend via environment variables. It is never bundled into Vite client code or persisted in `localStorage`.
- **Single-Use Live Ephemeral Tokens**: `/api/live/token` is protected by a per-IP sliding-window rate limiter and mints short-lived (90s), HMAC-SHA256-signed single-use tokens (`jti` replay-checked upon `/api/live/ws` upgrade).
- **No-Store API Responses & SW Exclusions**: All `/api/*` routes return `Cache-Control: no-store`, and the Workbox PWA service worker enforces `NetworkOnly` with `navigateFallbackDenylist` for `/api/`.
- **Tool Input Validation & Confirmation Gates**: All Live/Cloud function calls pass strict schema validation (`validateAndMapToolCall`) and duplicate-write suppression (`ToolWriteDeduplicator`). Destructive actions and persistent preference saves require explicit user confirmation.
- **Safe Expression Evaluation**: Offline math (`safeEvaluateMath`) strictly whitelists digits, arithmetic operators, and `Math.sqrt` before evaluation.
- **Clipboard Secret Filtering**: `looksSensitiveCredential()` blocks bearer tokens, API keys, and PEM blocks from entering saved clipboard history.
- **Zero Hardcoded Secrets**: Never commit `.env` files (enforced by `.gitignore`).

## Reporting a Vulnerability

Please open a private GitHub Security Advisory on the repository with reproduction steps, affected files, and impact assessment rather than filing a public issue with exploit payloads.
