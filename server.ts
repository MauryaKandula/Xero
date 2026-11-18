import express from 'express';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { WebSocketServer, type WebSocket as WsSocket } from 'ws';
import {
  Behavior,
  type FunctionDeclaration,
  FunctionResponseScheduling,
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  Type,
} from '@google/genai';
import { computeCpuUsagePercent, type CpuSnapshotTotals } from './src/core/systemHealth';
import { ToolWriteDeduplicator, validateAndMapToolCall } from './src/core/toolValidation';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;
const ALLOWED_GEMINI_MODELS = new Set(['gemini-4-hydrogen', 'gemini-3.1-flash-lite']);
const ALLOWED_LIVE_MODELS = new Set(['gemini-3.8-live', 'gemini-3.8-live-extended-thinking']);
const ALLOWED_LIVE_VOICES = new Set(['Kore', 'Zephyr']);
const LIVE_TOKEN_SECRET = process.env.LIVE_TOKEN_SECRET?.trim() || crypto.randomBytes(32).toString('hex');
const LIVE_TOKEN_TTL_MS = 90_000;

const JARVIS_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'manage_timer',
    description: 'Start a countdown timer, start a 25m Pomodoro focus timer, or clear timers.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: { type: Type.STRING, description: 'start, pomodoro, stopwatch, or clear' },
        seconds: { type: Type.NUMBER, description: 'Timer duration in seconds when starting a timer' },
        label: { type: Type.STRING, description: 'Short label for the timer' },
      },
      required: ['command'],
    },
  },
  {
    name: 'manage_productivity',
    description: 'Create todos, shopping items, quick notes, reminders, hydration logs, or persistent memory facts.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        kind: { type: Type.STRING, description: 'todo, shopping, note, reminder, water, or memory' },
        items: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: 'List of todo or shopping items when kind is todo or shopping',
        },
        text: { type: Type.STRING, description: 'Note, reminder, or memory text' },
        delaySeconds: { type: Type.NUMBER, description: 'Reminder delay in seconds' },
        ml: { type: Type.NUMBER, description: 'Milliliters of water to log (default 250)' },
      },
      required: ['kind'],
    },
  },
  {
    name: 'control_workspace',
    description: 'Control music, volume, brightness dimmer, Night Light, Keep Awake, screenshot, theme, breathing HUD, notch hide/tab, Studio, or Teleprompter.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'play_music, pause_music, next_track, prev_track, set_volume, toggle_mute, toggle_night_light, set_brightness, toggle_awake, take_screenshot, start_breathing, show_system_hud, open_studio, open_teleprompter, hide_notch, open_tab, set_mode, or set_theme',
        },
        value: { type: Type.STRING, description: 'Optional tab name, mode, theme preset, or numeric percentage as string' },
      },
      required: ['action'],
    },
  },
  {
    name: 'run_jarvis_protocol',
    description: 'Execute a coordinated multi-action Jarvis protocol routine (focus, stealth, meeting, break).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        protocol: { type: Type.STRING, description: 'focus, stealth, meeting, or break' },
      },
      required: ['protocol'],
    },
  },
  {
    name: 'update_setting',
    description: 'Change a XERO basic setting (gamingMode, soundEffects, ttsEnabled, spontaneousBehavior, reducedMotion, launchMinimized, wakeWordEnabled, notchShape, providerMode, autoHideDelayMs, autoCollapseMs, islandOpacity, glowIntensity).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        key: { type: Type.STRING, description: 'Setting key name' },
        value: { type: Type.STRING, description: 'New value as string (true/false, number, or mode name)' },
        summary: { type: Type.STRING, description: 'Short confirmation label' },
      },
      required: ['key', 'value'],
    },
  },
];

function buildLiveToolDeclarations(nonBlocking: boolean): FunctionDeclaration[] {
  const base: FunctionDeclaration[] = [
    {
      name: 'manage_timer',
      description: 'Start a focus timer, start a 25m pomodoro, check remaining time (status), pause, resume, or clear timers.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          command: { type: Type.STRING, description: 'start, pomodoro, stopwatch, status, pause, resume, or clear' },
          seconds: { type: Type.NUMBER, description: 'Duration in seconds when starting a timer' },
          label: { type: Type.STRING, description: 'Short timer label' },
        },
        required: ['command'],
      },
    },
    {
      name: 'manage_productivity',
      description: 'Create notes, todos, shopping items, reminders, hydration logs, or propose saving a local user preference.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          kind: { type: Type.STRING, description: 'note, todo, shopping, reminder, water, or preference' },
          text: { type: Type.STRING, description: 'Note, reminder, or preference text' },
          items: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'List items for todo or shopping' },
          delaySeconds: { type: Type.NUMBER, description: 'Reminder delay in seconds' },
          ml: { type: Type.NUMBER, description: 'Water amount in ml' },
        },
        required: ['kind'],
      },
    },
    {
      name: 'set_response_depth',
      description: 'Adjust spoken/transcript response length for this session when user says "keep it short" or "go deeper".',
      parameters: {
        type: Type.OBJECT,
        properties: {
          depth: { type: Type.STRING, description: 'concise, balanced, or detailed' },
        },
        required: ['depth'],
      },
    },
    {
      name: 'catch_me_up',
      description: 'Summarize the current session into decisions, open questions, and next steps.',
      parameters: { type: Type.OBJECT, properties: {} },
    },
    {
      name: 'capture_that',
      description: 'Capture the recent conversation highlight into a note or checklist ready for Markdown export.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          summary: { type: Type.STRING, description: 'Highlight text to save' },
          asChecklist: { type: Type.BOOLEAN, description: 'True to format as a checklist' },
        },
      },
    },
    {
      name: 'control_workspace',
      description: 'Control ambient music, volume, mute, Night Light, display dimmer, notch tab, or hide notch.',
      parameters: {
        type: Type.OBJECT,
        properties: {
          action: {
            type: Type.STRING,
            description: 'play_music, pause_music, next_track, prev_track, set_volume, toggle_mute, toggle_night_light, set_brightness, open_tab, set_mode, open_studio, or hide_notch',
          },
          value: { type: Type.STRING, description: 'Tab name, mode, or percentage string' },
        },
        required: ['action'],
      },
    },
  ];
  return nonBlocking ? base.map((fn) => ({ ...fn, behavior: Behavior.NON_BLOCKING })) : base;
}

interface LiveTokenClaims {
  jti: string;
  model: 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking';
  voiceName: 'Kore' | 'Zephyr';
  exp: number;
}

const issuedLiveTokens = new Map<string, number>();
const tokenRateLimitBuckets = new Map<string, number[]>();

function checkTokenRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60_000;
  const maxRequests = 20;
  const recent = (tokenRateLimitBuckets.get(ip) ?? []).filter((ts) => now - ts < windowMs);
  if (recent.length >= maxRequests) {
    tokenRateLimitBuckets.set(ip, recent);
    return false;
  }
  recent.push(now);
  tokenRateLimitBuckets.set(ip, recent);
  if (tokenRateLimitBuckets.size > 200) {
    const oldestKey = tokenRateLimitBuckets.keys().next().value;
    if (oldestKey) tokenRateLimitBuckets.delete(oldestKey);
  }
  return true;
}

function signLiveToken(claims: LiveTokenClaims): string {
  const payloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
  const sigB64 = crypto
    .createHmac('sha256', LIVE_TOKEN_SECRET)
    .update(payloadB64)
    .digest('base64url');
  issuedLiveTokens.set(claims.jti, claims.exp);
  if (issuedLiveTokens.size > 500) {
    const now = Date.now();
    for (const [k, exp] of issuedLiveTokens.entries()) {
      if (exp < now) issuedLiveTokens.delete(k);
    }
  }
  return `${payloadB64}.${sigB64}`;
}

function verifyAndConsumeLiveToken(token: string | null): LiveTokenClaims | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const expectedSig = crypto
    .createHmac('sha256', LIVE_TOKEN_SECRET)
    .update(payloadB64)
    .digest('base64url');
  const a = Buffer.from(sigB64);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as LiveTokenClaims;
    if (!claims?.jti || !claims.exp || Date.now() > claims.exp) return null;
    if (!issuedLiveTokens.has(claims.jti)) return null;
    issuedLiveTokens.delete(claims.jti);
    return claims;
  } catch {
    return null;
  }
}

interface MappedAction {
  type: string;
  payload?: Record<string, string | number | boolean | string[]>;
}

function mapFunctionCallToActions(name: string | undefined, args: Record<string, unknown> | undefined): MappedAction[] {
  const a = args ?? {};
  if (name === 'manage_timer') {
    const cmd = String(a.command || 'start').toLowerCase();
    if (cmd === 'pomodoro') return [{ type: 'start-pomodoro' }];
    if (cmd === 'stopwatch') return [{ type: 'start-stopwatch' }];
    if (cmd === 'clear') return [{ type: 'clear-timers' }];
    return [{
      type: 'start-timer',
      payload: {
        seconds: Math.max(5, Math.round(Number(a.seconds) || 60)),
        label: String(a.label || 'Focus Timer').slice(0, 36),
      },
    }];
  }
  if (name === 'manage_productivity') {
    const kind = String(a.kind || 'note').toLowerCase();
    if (kind === 'todo' && Array.isArray(a.items)) {
      return [{ type: 'add-todo', payload: { items: a.items.map(String) } }];
    }
    if (kind === 'shopping' && Array.isArray(a.items)) {
      return [{ type: 'add-shopping', payload: { items: a.items.map(String) } }];
    }
    if (kind === 'reminder') {
      return [{
        type: 'add-reminder',
        payload: {
          text: String(a.text || 'Check in with XERO'),
          seconds: Math.max(5, Math.round(Number(a.delaySeconds) || 60)),
        },
      }];
    }
    if (kind === 'water') {
      return [{ type: 'log-water', payload: { ml: Math.max(50, Math.round(Number(a.ml) || 250)) } }];
    }
    if (kind === 'memory') {
      return [{ type: 'remember-fact', payload: { fact: String(a.text || '') } }];
    }
    return [{ type: 'add-note', payload: { text: String(a.text || '') } }];
  }
  if (name === 'control_workspace') {
    const act = String(a.action || '').toLowerCase();
    const val = a.value !== undefined ? String(a.value) : '';
    switch (act) {
      case 'play_music': return [{ type: 'music-play' }];
      case 'pause_music': return [{ type: 'music-pause' }];
      case 'next_track': return [{ type: 'music-next' }];
      case 'prev_track': return [{ type: 'music-prev' }];
      case 'set_volume': return [{ type: 'set-volume', payload: { volume: Math.min(100, Math.max(0, Number(val) || 60)) } }];
      case 'toggle_mute': return [{ type: 'toggle-mute' }];
      case 'toggle_night_light': return [{ type: 'toggle-night-light' }];
      case 'set_brightness': return [{ type: 'set-brightness', payload: { brightness: Math.min(100, Math.max(35, Number(val) || 85)) } }];
      case 'toggle_awake': return [{ type: 'toggle-awake' }];
      case 'take_screenshot': return [{ type: 'take-screenshot' }];
      case 'start_breathing': return [{ type: 'start-breathing' }];
      case 'show_system_hud': return [{ type: 'show-system-hud' }];
      case 'open_studio': return [{ type: 'open-studio' }];
      case 'open_teleprompter': return [{ type: 'open-teleprompter' }];
      case 'hide_notch': return [{ type: 'minimize-island' }];
      case 'open_tab': return [{ type: 'open-tab', payload: { tab: val || 'timers' } }];
      case 'set_mode': return [{ type: 'set-mode', payload: { mode: val || 'command' } }];
      case 'set_theme': return [{ type: 'set-appearance-preset', payload: { preset: val || 'Cyan' } }];
      default: return [];
    }
  }
  if (name === 'run_jarvis_protocol') {
    const proto = String(a.protocol || '').toLowerCase();
    if (proto === 'focus') {
      return [{ type: 'start-pomodoro' }, { type: 'music-play' }, { type: 'open-tab', payload: { tab: 'timers' } }];
    }
    if (proto === 'stealth') {
      return [{ type: 'music-pause' }, { type: 'set-brightness', payload: { brightness: 75 } }, { type: 'minimize-island' }];
    }
    if (proto === 'meeting') {
      return [{ type: 'music-pause' }, { type: 'toggle-awake' }, { type: 'open-teleprompter' }];
    }
    if (proto === 'break') {
      return [{ type: 'start-timer', payload: { seconds: 300, label: '5m Recharge' } }, { type: 'log-water', payload: { ml: 250 } }, { type: 'start-breathing' }];
    }
  }
  if (name === 'update_setting') {
    const k = String(a.key || '').trim();
    const raw = a.value;
    const coerced =
      raw === 'true' || raw === true
        ? true
        : raw === 'false' || raw === false
          ? false
          : !Number.isNaN(Number(raw)) && String(raw).trim() !== ''
            ? Number(raw)
            : String(raw ?? '');
    if (k) {
      return [{ type: 'update-setting', payload: { key: k, value: coerced, summary: String(a.summary || `${k} updated`) } }];
    }
  }
  return [];
}

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
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  // Health & capability discovery (never exposes secret values)
  app.get('/api/health', (_req, res) => {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    const geminiConfigured = Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
    res.json({
      ok: true,
      geminiConfigured,
      liveSupported: geminiConfigured,
      liveModels: Array.from(ALLOWED_LIVE_MODELS),
      liveVoices: Array.from(ALLOWED_LIVE_VOICES),
      runtime: 'express-node',
      timestamp: Date.now(),
    });
  });

  // Short-lived, single-use, rate-limited token minting for Live voice WebSocket
  app.post('/api/live/token', (req, res) => {
    const clientIp = req.ip || req.socket.remoteAddress || 'local';
    if (!checkTokenRateLimit(clientIp)) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        message: 'Too many Live voice connection requests. Wait a moment and try again.',
      });
      return;
    }

    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_NOT_CONFIGURED',
        message: 'Server-side GEMINI_API_KEY is missing. Offline Core and typed chat remain ready.',
      });
      return;
    }

    const rawModel = String(req.body?.model || 'gemini-3.8-live');
    if (!ALLOWED_LIVE_MODELS.has(rawModel)) {
      res.status(400).json({
        error: 'UNSUPPORTED_MODEL',
        message: `Unsupported Live model "${rawModel}". Supported: ${Array.from(ALLOWED_LIVE_MODELS).join(', ')}.`,
      });
      return;
    }

    const rawVoice = String(req.body?.voiceName || 'Kore');
    const voiceName = ALLOWED_LIVE_VOICES.has(rawVoice)
      ? (rawVoice as 'Kore' | 'Zephyr')
      : 'Kore';

    const claims: LiveTokenClaims = {
      jti: crypto.randomUUID(),
      model: rawModel as 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking',
      voiceName,
      exp: Date.now() + LIVE_TOKEN_TTL_MS,
    };

    res.json({
      ok: true,
      token: signLiveToken(claims),
      expiresAt: claims.exp,
      model: claims.model,
      voiceName: claims.voiceName,
    });
  });

  // Portable software zip download
  app.get('/api/release/download', (_req, res) => {
    const zipPath = path.join(__dirname, 'release', 'XERO-Desktop-Suite.zip');
    if (!fs.existsSync(zipPath)) {
      res.status(404).json({
        error: 'PACKAGE_NOT_BUILT',
        message: 'Run "npm run package" to generate release/XERO-Desktop-Suite.zip first.',
      });
      return;
    }
    res.download(zipPath, 'XERO-Desktop-Suite.zip');
  });

  // Live host CPU, Memory & optional Ollama /api/ps telemetry for System Health D3 charts
  const readCpuTotals = (): CpuSnapshotTotals => {
    let idle = 0;
    let total = 0;
    for (const cpu of os.cpus()) {
      idle += cpu.times.idle;
      total +=
        cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
    }
    return { idle, total };
  };
  let prevCpuSnapshot = readCpuTotals();

  app.get('/api/system/health', async (req, res) => {
    const currentCpu = readCpuTotals();
    const cpus = os.cpus();
    const cpuPercent = computeCpuUsagePercent(prevCpuSnapshot, currentCpu);
    prevCpuSnapshot = currentCpu;

    const totalBytes = os.totalmem();
    const freeBytes = os.freemem();
    const usedBytes = Math.max(0, totalBytes - freeBytes);
    const totalMb = Math.round(totalBytes / (1024 * 1024));
    const freeMb = Math.round(freeBytes / (1024 * 1024));
    const usedMb = Math.round(usedBytes / (1024 * 1024));
    const memoryPercent =
      totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 1000) / 10 : 0;
    const processRssMb = Math.round(process.memoryUsage().rss / (1024 * 1024));

    let localLlm:
      | { reachable: boolean; runningModels: Array<{ name: string; sizeVramMb?: number }> }
      | undefined;

    const rawEndpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : '';
    const format = req.query.format === 'openai' ? 'openai' : 'ollama';
    if (rawEndpoint) {
      try {
        const base = sanitizeLocalBaseUrl(rawEndpoint);
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort(), 450);
        try {
          const probeUrl =
            format === 'ollama'
              ? `${base}/api/ps`
              : base.endsWith('/v1')
                ? `${base}/models`
                : `${base}/v1/models`;
          const upstream = await fetch(probeUrl, { signal: controller.signal });
          if (upstream.ok) {
            const payload = (await upstream.json()) as {
              models?: Array<{ name?: string; size_vram?: number }>;
              data?: Array<{ id?: string }>;
            };
            const runningModels =
              format === 'ollama'
                ? (payload.models ?? []).map((m) => ({
                    name: m.name || 'local-model',
                    sizeVramMb:
                      typeof m.size_vram === 'number'
                        ? Math.round(m.size_vram / (1024 * 1024))
                        : undefined,
                  }))
                : (payload.data ?? []).slice(0, 4).map((m) => ({
                    name: m.id || 'local-model',
                  }));
            localLlm = { reachable: true, runningModels };
          } else {
            localLlm = { reachable: false, runningModels: [] };
          }
        } finally {
          clearTimeout(t);
        }
      } catch {
        localLlm = { reachable: false, runningModels: [] };
      }
    }

    res.json({
      ok: true,
      timestamp: Date.now(),
      cpu: {
        percent: cpuPercent,
        cores: cpus.length || 1,
        model: cpus[0]?.model || 'Host CPU',
        load1m: Math.round((os.loadavg()[0] ?? 0) * 100) / 100,
      },
      memory: {
        percent: memoryPercent,
        usedMb,
        totalMb,
        freeMb,
        processRssMb,
      },
      localLlm,
      uptimeSec: Math.round(os.uptime()),
    });
  });

  // Server-side Gemini streaming endpoint with J.A.R.V.I.S. tool calling
  app.post('/api/ai/gemini', async (req, res) => {
    const ai = createGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_NOT_CONFIGURED',
        message: 'Server-side GEMINI_API_KEY is not configured in environment secrets.',
      });
      return;
    }

    const { prompt, history, systemInstruction, model, telemetry } = req.body ?? {};
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

    const telemetryBlock =
      telemetry && typeof telemetry === 'object'
        ? `\nLive Workspace Telemetry: ${JSON.stringify(telemetry)}`
        : '';

    const fullPrompt = `${telemetryBlock ? `${telemetryBlock}\n` : ''}${
      conversationContext ? `Recent conversation:\n${conversationContext}\n\n` : ''
    }User: ${prompt}`;

    const sysInst =
      typeof systemInstruction === 'string' && systemInstruction.trim()
        ? systemInstruction
        : 'You are XERO, a helpful, concise, expressive J.A.R.V.I.S.-grade desktop AI companion. Use provided tools whenever the user asks you to control timers, tasks, notes, music, display, or routines.';

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    try {
      const firstTurn = await ai.models.generateContent({
        model: chosenModel,
        contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
        config: {
          systemInstruction: sysInst,
          tools: [{ functionDeclarations: JARVIS_TOOL_DECLARATIONS }],
        },
      });

      const fnCalls = firstTurn.functionCalls;
      if (fnCalls && fnCalls.length > 0) {
        const mappedActions = fnCalls.flatMap((fc) =>
          mapFunctionCallToActions(fc.name, fc.args as Record<string, unknown> | undefined)
        );
        if (mappedActions.length > 0) {
          res.write(`data: ${JSON.stringify({ toolActions: mappedActions })}\n\n`);
        }

        const previousContent = firstTurn.candidates?.[0]?.content;
        if (previousContent) {
          const followUpStream = await ai.models.generateContentStream({
            model: chosenModel,
            contents: [
              { role: 'user', parts: [{ text: fullPrompt }] },
              previousContent,
              {
                role: 'user',
                parts: fnCalls.map((fc) => ({
                  functionResponse: {
                    id: fc.id,
                    name: fc.name || 'control_workspace',
                    response: { status: 'executed', args: fc.args ?? {} },
                  },
                })),
              },
            ],
            config: {
              systemInstruction: sysInst,
              tools: [{ functionDeclarations: JARVIS_TOOL_DECLARATIONS }],
            },
          });

          for await (const chunk of followUpStream) {
            const text = chunk.text ?? '';
            if (text) {
              res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
            }
          }
        } else if (firstTurn.text) {
          res.write(`data: ${JSON.stringify({ chunk: firstTurn.text })}\n\n`);
        }
        res.write(`data: ${JSON.stringify({ done: true, model: chosenModel })}\n\n`);
        res.end();
        return;
      }

      const directText = firstTurn.text ?? '';
      if (directText) {
        res.write(`data: ${JSON.stringify({ chunk: directText })}\n\n`);
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

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (clientWs: WsSocket, _req: http.IncomingMessage, claims: LiveTokenClaims) => {
    const ai = createGeminiClient();
    if (!ai) {
      clientWs.close(4003, 'Gemini API key unavailable');
      return;
    }

    type LiveSessionType = Awaited<ReturnType<typeof ai.live.connect>>;
    let liveSession: LiveSessionType | null = null;
    let currentTurnId = `turn-${Date.now()}`;
    let closed = false;
    const deduper = new ToolWriteDeduplicator();

    const safeSend = (payload: unknown) => {
      if (!closed && clientWs.readyState === clientWs.OPEN) {
        try {
          clientWs.send(JSON.stringify(payload));
        } catch {
          // Ignore send race during disconnect
        }
      }
    };

    const closeBoth = (code = 1000, reason = 'Session closed') => {
      if (closed) return;
      closed = true;
      deduper.clear();
      try {
        liveSession?.close();
      } catch {
        // Ignore upstream close error
      }
      liveSession = null;
      if (clientWs.readyState === clientWs.OPEN || clientWs.readyState === clientWs.CONNECTING) {
        try {
          clientWs.close(code, reason);
        } catch {
          // Ignore ws close error
        }
      }
    };

    clientWs.on('message', async (rawData) => {
      let msg: { type?: string; data?: string; systemInstruction?: string };
      try {
        msg = JSON.parse(String(rawData || ''));
      } catch {
        return;
      }

      if (msg.type === 'setup' && !liveSession) {
        const isExtended = claims.model === 'gemini-3.8-live-extended-thinking';
        const sysInst =
          typeof msg.systemInstruction === 'string' && msg.systemInstruction.trim()
            ? msg.systemInstruction.trim().slice(0, 4000)
            : 'You are XERO, a calm, concise, female-voiced JARVIS assistant.';

        try {
          liveSession = await ai.live.connect({
            model: claims.model,
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: claims.voiceName },
                },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction: sysInst,
              tools: [{ functionDeclarations: buildLiveToolDeclarations(isExtended) }],
              ...(isExtended
                ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
                : {}),
            },
            callbacks: {
              onopen: () => {
                safeSend({ type: 'ready', model: claims.model, voiceName: claims.voiceName });
              },
              onmessage: (serverMsg) => {
                const sc = serverMsg.serverContent;
                if (sc) {
                  if (sc.interrupted) {
                    safeSend({ type: 'interrupted', turnId: currentTurnId });
                    currentTurnId = `turn-${Date.now()}`;
                  }
                  const parts = sc.modelTurn?.parts ?? [];
                  for (const part of parts) {
                    if (part.inlineData?.data) {
                      safeSend({
                        type: 'audio',
                        turnId: currentTurnId,
                        data: part.inlineData.data,
                      });
                    }
                  }
                  if (sc.inputTranscription?.text) {
                    safeSend({ type: 'inputTranscript', text: sc.inputTranscription.text });
                  }
                  if (sc.outputTranscription?.text) {
                    safeSend({
                      type: 'outputTranscript',
                      turnId: currentTurnId,
                      text: sc.outputTranscription.text,
                    });
                  }
                  if (sc.turnComplete) {
                    safeSend({ type: 'turnComplete', turnId: currentTurnId });
                    currentTurnId = `turn-${Date.now()}`;
                  }
                }

                if (serverMsg.toolCall?.functionCalls && serverMsg.toolCall.functionCalls.length > 0) {
                  const calls = serverMsg.toolCall.functionCalls;
                  const responses = [];
                  for (const fc of calls) {
                    const args = fc.args as Record<string, unknown> | undefined;
                    if (deduper.isDuplicate(fc.name || '', args, fc.id)) {
                      responses.push({
                        id: fc.id,
                        name: fc.name || 'control_workspace',
                        response: { status: 'deduplicated' },
                        ...(isExtended ? { scheduling: FunctionResponseScheduling.WHEN_IDLE } : {}),
                      });
                      continue;
                    }
                    const validated = validateAndMapToolCall(fc.name, args);
                    if (!validated.valid) {
                      responses.push({
                        id: fc.id,
                        name: fc.name || 'control_workspace',
                        response: { status: 'rejected', error: validated.error },
                        ...(isExtended ? { scheduling: FunctionResponseScheduling.WHEN_IDLE } : {}),
                      });
                      continue;
                    }
                    if (validated.requiresConfirmation) {
                      safeSend({
                        type: 'toolConfirmation',
                        confirmation: validated.requiresConfirmation,
                      });
                      responses.push({
                        id: fc.id,
                        name: fc.name || 'control_workspace',
                        response: { status: 'awaiting_user_confirmation', summary: validated.requiresConfirmation.summary },
                        ...(isExtended ? { scheduling: FunctionResponseScheduling.WHEN_IDLE } : {}),
                      });
                      continue;
                    }
                    if (validated.actions.length > 0) {
                      safeSend({
                        type: 'toolActions',
                        actions: validated.actions,
                        labels: [fc.name || 'action'],
                      });
                    }
                    responses.push({
                      id: fc.id,
                      name: fc.name || 'control_workspace',
                      response: { status: 'executed', actionsCount: validated.actions.length },
                      ...(isExtended ? { scheduling: FunctionResponseScheduling.WHEN_IDLE } : {}),
                    });
                  }
                  try {
                    liveSession?.sendToolResponse({ functionResponses: responses });
                  } catch {
                    // Ignore late tool response failures on closing session
                  }
                }
              },
              onerror: (errEvent) => {
                safeSend({
                  type: 'error',
                  code: 'LIVE_UPSTREAM_ERROR',
                  message: errEvent?.message || 'Gemini Live stream error.',
                });
                closeBoth(1011, 'Upstream error');
              },
              onclose: () => {
                closeBoth(1000, 'Live session ended');
              },
            },
          });
        } catch (err: unknown) {
          safeSend({
            type: 'error',
            code: 'LIVE_CONNECT_FAILED',
            message: err instanceof Error ? err.message : 'Unable to connect to Gemini Live.',
          });
          closeBoth(1011, 'Connect failed');
        }
        return;
      }

      if (msg.type === 'audio' && msg.data && liveSession) {
        try {
          liveSession.sendRealtimeInput({
            audio: {
              data: msg.data,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        } catch {
          // Ignore send race if session is closing
        }
        return;
      }

      if (msg.type === 'interrupt') {
        currentTurnId = `turn-${Date.now()}`;
        return;
      }

      if (msg.type === 'close') {
        closeBoth(1000, 'Client closed');
      }
    });

    clientWs.on('close', () => {
      closeBoth(1000, 'Client disconnected');
    });

    clientWs.on('error', () => {
      closeBoth(1011, 'Client socket error');
    });
  });

  server.on('upgrade', (request, socket, head) => {
    try {
      const reqUrl = new URL(request.url || '/', 'http://localhost');
      if (reqUrl.pathname !== '/api/live/ws') {
        // Leave Vite or non-Live upgrades alone
        return;
      }
      const token = reqUrl.searchParams.get('token');
      const claims = verifyAndConsumeLiveToken(token);
      if (!claims) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request, claims);
      });
    } catch {
      socket.destroy();
    }
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`XERO server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start XERO server:', err);
  process.exit(1);
});
