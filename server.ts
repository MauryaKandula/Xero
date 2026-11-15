import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const ALLOWED_GEMINI_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);

function createGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function sanitizeLocalBaseUrl(rawUrl: string): string {
  const trimmed = (rawUrl || '').trim().replace(/\/+$/, '');
  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Local LLM endpoint must use http:// or https://');
  }
  return parsed.toString().replace(/\/+$/, '');
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health & capability discovery (never exposes secret values)
  app.get('/api/health', (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const geminiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
    res.json({
      ok: true,
      geminiConfigured,
      runtime: 'express-node',
      timestamp: Date.now(),
    });
  });

  // Server-side Gemini streaming endpoint
  app.post('/api/ai/gemini', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_NOT_CONFIGURED',
        message: 'Server-side GEMINI_API_KEY is not configured in environment secrets.',
      });
      return;
    }

    const { prompt, history, systemInstruction, model } = req.body ?? {};
    if (typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'INVALID_PROMPT', message: 'Prompt text is required.' });
      return;
    }

    const chosenModel = ALLOWED_GEMINI_MODELS.has(model) ? model : 'gemini-4-hydrogen';

    const conversationContext = Array.isArray(history)
      ? history
          .slice(-8)
          .map((m: { role?: string; text?: string }) => `${m.role === 'user' ? 'User' : 'XERO'}: ${String(m.text ?? '')}`)
          .join('\n')
      : '';

    const fullPrompt = conversationContext
      ? `Recent conversation:\n${conversationContext}\n\nUser: ${prompt}`
      : prompt;

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    try {
      const stream = await ai.models.generateContentStream({
        model: chosenModel,
        contents: fullPrompt,
        config: {
          systemInstruction:
            typeof systemInstruction === 'string' && systemInstruction.trim()
              ? systemInstruction
              : 'You are XERO, a helpful, concise, expressive desktop AI companion.',
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text ?? '';
        if (text) {
          res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ done: true, model: chosenModel })}\n\n`);
      res.end();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gemini request failed';
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
  });

  // Local LLM model discovery proxy (Ollama / LM Studio / OpenAI-compatible)
  app.post('/api/local/models', async (req, res) => {
    const { endpoint, format } = req.body ?? {};
    let baseUrl: string;
    try {
      baseUrl = sanitizeLocalBaseUrl(String(endpoint || 'http://127.0.0.1:11434'));
    } catch (err: unknown) {
      res.status(400).json({
        error: 'INVALID_ENDPOINT',
        message: err instanceof Error ? err.message : 'Invalid local endpoint URL',
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const start = Date.now();

    try {
      const isOllama = format !== 'openai';
      const targetUrl = isOllama
        ? `${baseUrl}/api/tags`
        : baseUrl.endsWith('/v1')
          ? `${baseUrl}/models`
          : `${baseUrl}/v1/models`;

      const upstream = await fetch(targetUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!upstream.ok) {
        res.status(upstream.status).json({
          error: 'LOCAL_ENDPOINT_ERROR',
          message: `Local LLM server responded with HTTP ${upstream.status}`,
        });
        return;
      }

      const data = (await upstream.json()) as {
        models?: Array<{ name?: string; model?: string }>;
        data?: Array<{ id?: string }>;
      };

      const models = isOllama
        ? (data.models ?? []).map((m) => m.name || m.model || '').filter(Boolean)
        : (data.data ?? []).map((m) => m.id || '').filter(Boolean);

      res.json({
        ok: true,
        latencyMs: Date.now() - start,
        models,
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      const message = err instanceof Error ? err.message : 'Could not reach local LLM endpoint';
      res.status(502).json({
        error: 'LOCAL_UNREACHABLE',
        message,
      });
    }
  });

  // Local LLM chat proxy (Ollama / OpenAI-compatible)
  app.post('/api/ai/local', async (req, res) => {
    const { endpoint, format, model, prompt, history, systemInstruction } = req.body ?? {};
    let baseUrl: string;
    try {
      baseUrl = sanitizeLocalBaseUrl(String(endpoint || 'http://127.0.0.1:11434'));
    } catch (err: unknown) {
      res.status(400).json({
        error: 'INVALID_ENDPOINT',
        message: err instanceof Error ? err.message : 'Invalid endpoint URL',
      });
      return;
    }

    if (typeof prompt !== 'string' || !prompt.trim()) {
      res.status(400).json({ error: 'INVALID_PROMPT', message: 'Prompt is required.' });
      return;
    }

    const messages = [
      {
        role: 'system',
        content:
          typeof systemInstruction === 'string' && systemInstruction.trim()
            ? systemInstruction
            : 'You are XERO, a helpful, concise desktop AI companion.',
      },
      ...(Array.isArray(history)
        ? history.slice(-8).map((m: { role?: string; text?: string }) => ({
            role: m.role === 'user' ? 'user' : 'assistant',
            content: String(m.text ?? ''),
          }))
        : []),
      { role: 'user', content: prompt },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    try {
      const isOllama = format !== 'openai';
      const targetUrl = isOllama
        ? `${baseUrl}/api/chat`
        : baseUrl.endsWith('/v1')
          ? `${baseUrl}/chat/completions`
          : `${baseUrl}/v1/chat/completions`;

      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(
          isOllama
            ? { model: model || 'llama3.2', messages, stream: false }
            : { model: model || 'local-model', messages, stream: false }
        ),
      });
      clearTimeout(timeout);

      if (!upstream.ok) {
        const errText = await upstream.text().catch(() => '');
        res.status(upstream.status).json({
          error: 'LOCAL_LLM_FAILED',
          message: errText || `Local LLM returned HTTP ${upstream.status}`,
        });
        return;
      }

      const data = (await upstream.json()) as {
        message?: { content?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };

      const replyText = isOllama
        ? data.message?.content ?? ''
        : data.choices?.[0]?.message?.content ?? '';

      res.json({
        ok: true,
        text: replyText || 'Local model returned an empty response.',
      });
    } catch (err: unknown) {
      clearTimeout(timeout);
      res.status(502).json({
        error: 'LOCAL_UNREACHABLE',
        message: err instanceof Error ? err.message : 'Unable to reach local LLM server',
      });
    }
  });

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`XERO server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start XERO server:', err);
  process.exit(1);
});
