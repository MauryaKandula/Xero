#!/usr/bin/env bash
set -euo pipefail

echo "=========================================="
echo "  PROJECT XERO — Setup & Launch"
echo "=========================================="

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js (>= 20.x) is required. Install from https://nodejs.org/"
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "Error: Node.js >= 18 required (detected $(node -v))."
  exit 1
fi

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "[1/4] Created .env from .env.example (optional: add GEMINI_API_KEY)."
fi

echo "[2/4] Installing dependencies..."
npm install --no-audit --no-fund

echo "[3/4] Running unit tests & production build..."
npx --yes tsx --test src/core/*.test.ts
npm run build

echo "[4/4] Starting PROJECT XERO on http://localhost:3000 ..."
npm start
