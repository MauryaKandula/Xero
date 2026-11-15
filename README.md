# XERO — Intelligence with a personality

Floating 2D animated Dynamic Island desktop AI companion (**XERO**) paired with an independent control centre (**XERO Studio**), supporting **Offline Core**, **Local LLM (Ollama / LM Studio / OpenAI-compatible)**, and **Server-Side Gemini**.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

### Production Build

```bash
npm run build
npm start
```

### Environment Variables (Optional for Cloud Gemini)

Copy `.env.example` to `.env` if you want cloud Gemini streaming alongside Offline Core and Local LLM:

```env
GEMINI_API_KEY="your-key-here"
```

## AI Modes

- **Auto Routing**: Uses Gemini when online and configured, falls back to your Local LLM endpoint if running, or handles requests locally via Offline Core.
- **Offline Core**: Zero-network built-in engine for math, timers, reminders, ambient synth music, clipboard history, file shelf, persistent memory, and companion reactions.
- **Local LLM**: Configure Ollama (`http://127.0.0.1:11434`) or LM Studio / llama.cpp (`http://127.0.0.1:1234/v1`) inside **XERO Studio → AI & Local LLM**.

## Publish to GitHub

```bash
git remote add origin https://github.com/<your-github-username>/Xero.git
git push -u origin main
```

## Verification

```bash
npx --yes tsx --test src/core/core.test.ts
npm run lint
npm run build
```
