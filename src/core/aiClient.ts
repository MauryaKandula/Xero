import type {
  ChatMessage,
  EmotionState,
  MemoryFact,
  XeroSettings,
} from './types';
import { inferEmotionFromText } from './emotions';
import { runOfflineEngine, type OfflineAction } from './offlineEngine';

export interface AIHealthStatus {
  ok: boolean;
  geminiConfigured: boolean;
  checkedAt: number;
}

export interface AIResponseResult {
  text: string;
  provider: 'offline' | 'local-llm' | 'gemini';
  emotion: EmotionState;
  action?: OfflineAction;
  fallbackNote?: string;
}

export async function fetchServerHealth(): Promise<AIHealthStatus> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { ok: false, geminiConfigured: false, checkedAt: Date.now() };
  }
  try {
    const res = await fetch('/api/health', { cache: 'no-store' });
    if (!res.ok) {
      return { ok: false, geminiConfigured: false, checkedAt: Date.now() };
    }
    const data = (await res.json()) as { ok?: boolean; geminiConfigured?: boolean };
    return {
      ok: Boolean(data.ok),
      geminiConfigured: Boolean(data.geminiConfigured),
      checkedAt: Date.now(),
    };
  } catch {
    return { ok: false, geminiConfigured: false, checkedAt: Date.now() };
  }
}

export async function discoverLocalModels(
  endpoint: string,
  format: 'ollama' | 'openai'
): Promise<{ ok: boolean; models: string[]; latencyMs?: number; error?: string }> {
  // 1. Try server proxy first (works when running locally or on same host)
  try {
    const res = await fetch('/api/local/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint, format }),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      return { ok: true, models: data.models ?? [], latencyMs: data.latencyMs };
    }
  } catch {
    // Fall through to browser-direct check
  }

  // 2. Try browser-direct fetch (works when user visits cloud preview while running Ollama locally with CORS)
  try {
    const clean = endpoint.trim().replace(/\/+$/, '');
    const targetUrl =
      format === 'ollama'
        ? `${clean}/api/tags`
        : clean.endsWith('/v1')
          ? `${clean}/models`
          : `${clean}/v1/models`;

    const started = performance.now();
    const direct = await fetch(targetUrl);
    if (!direct.ok) {
      return { ok: false, models: [], error: `Local endpoint HTTP ${direct.status}` };
    }
    const data = await direct.json();
    const models =
      format === 'ollama'
        ? ((data.models ?? []) as Array<{ name?: string; model?: string }>)
            .map((m) => m.name || m.model || '')
            .filter(Boolean)
        : ((data.data ?? []) as Array<{ id?: string }>)
            .map((m) => m.id || '')
            .filter(Boolean);
    return { ok: true, models, latencyMs: Math.round(performance.now() - started) };
  } catch (err: unknown) {
    return {
      ok: false,
      models: [],
      error:
        err instanceof Error
          ? `${err.message} (Ensure Ollama/LM Studio is running locally)`
          : 'Local LLM server unreachable',
    };
  }
}

async function callLocalLLM(
  prompt: string,
  history: ChatMessage[],
  settings: XeroSettings,
  systemInstruction: string
): Promise<string> {
  const payload = {
    endpoint: settings.ai.localEndpoint,
    format: settings.ai.localFormat,
    model: settings.ai.localModel,
    prompt,
    history: history.map((m) => ({ role: m.role, text: m.text })),
    systemInstruction,
  };

  // Try Express proxy first
  try {
    const res = await fetch('/api/ai/local', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = (await res.json()) as { text?: string };
      if (data.text) return data.text;
    }
  } catch {
    // Fall back to direct browser call
  }

  // Browser-direct attempt to localhost Ollama / LM Studio
  const clean = settings.ai.localEndpoint.trim().replace(/\/+$/, '');
  const isOllama = settings.ai.localFormat !== 'openai';
  const targetUrl = isOllama
    ? `${clean}/api/chat`
    : clean.endsWith('/v1')
      ? `${clean}/chat/completions`
      : `${clean}/v1/chat/completions`;

  const messages = [
    { role: 'system', content: systemInstruction },
    ...history.slice(-8).map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.text,
    })),
    { role: 'user', content: prompt },
  ];

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 2500);
  try {
    const directRes = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify(
        isOllama
          ? { model: settings.ai.localModel || 'llama3.2', messages, stream: false }
          : { model: settings.ai.localModel || 'local-model', messages, stream: false }
      ),
    });

    if (!directRes.ok) {
      throw new Error(`Local LLM returned HTTP ${directRes.status}`);
    }
    const directData = await directRes.json();
    const text = isOllama
      ? directData.message?.content
      : directData.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from local LLM');
    return text;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function callGeminiStream(
  prompt: string,
  history: ChatMessage[],
  settings: XeroSettings,
  systemInstruction: string,
  onStreamChunk?: (partialText: string) => void
): Promise<string> {
  const res = await fetch('/api/ai/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      model: settings.ai.geminiModel,
      systemInstruction,
      history: history.map((m) => ({ role: m.role, text: m.text })),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Gemini HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) {
    throw new Error('Streaming unavailable');
  }

  const decoder = new TextDecoder();
  let accumulated = '';
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n\n');
    buffer = lines.pop() ?? '';

    for (const block of lines) {
      const dataLine = block
        .split('\n')
        .find((l) => l.startsWith('data: '));
      if (!dataLine) continue;
      const jsonStr = dataLine.slice(6).trim();
      if (!jsonStr) continue;
      const parsed = JSON.parse(jsonStr) as {
        chunk?: string;
        error?: string;
        done?: boolean;
      };
      if (parsed.error) {
        throw new Error(parsed.error);
      }
      if (parsed.chunk) {
        accumulated += parsed.chunk;
        onStreamChunk?.(accumulated);
      }
    }
  }

  if (!accumulated.trim()) {
    throw new Error('Gemini returned an empty response.');
  }
  return accumulated.trim();
}

export async function generateXeroReply(params: {
  prompt: string;
  history: ChatMessage[];
  settings: XeroSettings;
  memories: MemoryFact[];
  contextSummary: {
    timersCount: number;
    clipboardCount: number;
    filesCount: number;
    isOnline: boolean;
  };
  geminiAvailable: boolean;
  onStreamChunk?: (partialText: string) => void;
}): Promise<AIResponseResult> {
  const {
    prompt,
    history,
    settings,
    memories,
    contextSummary,
    geminiAvailable,
    onStreamChunk,
  } = params;

  // Always check local deterministic commands first (timers, music, Studio, memory, math, emotion test)
  const offlinePreview = runOfflineEngine(prompt, settings, memories, contextSummary);
  if (offlinePreview.action.type !== 'none') {
    return {
      text: offlinePreview.text,
      provider: 'offline',
      emotion: offlinePreview.emotion,
      action: offlinePreview.action,
    };
  }

  const memoryContext =
    settings.ai.memoryEnabled && memories.length > 0
      ? `\nRemembered user facts:\n${memories.map((m) => `- ${m.fact}`).join('\n')}`
      : '';

  const systemInstruction = `You are ${settings.personalization.assistantName}, a floating Dynamic Island desktop AI companion.
Personality tone: ${settings.personalization.personalityTone}.
User name: ${settings.personalization.userName || 'User'}.
Keep replies concise, helpful, and natural for a compact floating desktop assistant.${memoryContext}
${settings.ai.systemPrompt ? `\nCustom instructions: ${settings.ai.systemPrompt}` : ''}`;

  const mode = settings.ai.providerMode;

  // 1. Explicit Offline Mode
  if (mode === 'offline') {
    return {
      text: offlinePreview.text,
      provider: 'offline',
      emotion: offlinePreview.emotion,
    };
  }

  // 2. Local LLM Mode
  if (mode === 'local-llm') {
    try {
      const text = await callLocalLLM(prompt, history, settings, systemInstruction);
      return {
        text,
        provider: 'local-llm',
        emotion: inferEmotionFromText(text, 'assistant'),
      };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Local LLM unreachable';
      return {
        text: `${offlinePreview.text}`,
        provider: 'offline',
        emotion: 'confused',
        fallbackNote: `Local LLM unreachable (${reason}) — handled by Offline Core.`,
      };
    }
  }

  // 3. Explicit Cloud Gemini Mode
  if (mode === 'gemini') {
    if (!contextSummary.isOnline) {
      return {
        text: offlinePreview.text,
        provider: 'offline',
        emotion: offlinePreview.emotion,
        fallbackNote: 'Device is offline — handled by Offline Core.',
      };
    }
    try {
      const text = await callGeminiStream(prompt, history, settings, systemInstruction, onStreamChunk);
      return {
        text,
        provider: 'gemini',
        emotion: inferEmotionFromText(text, 'assistant'),
      };
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : 'Gemini unavailable';
      return {
        text: offlinePreview.text,
        provider: 'offline',
        emotion: 'confused',
        fallbackNote: `Gemini unavailable (${reason}) — handled by Offline Core.`,
      };
    }
  }

  // 4. Auto Smart Routing:
  // If online & Gemini is configured -> try Gemini; else try Local LLM if configured -> else Offline Core
  if (contextSummary.isOnline && geminiAvailable) {
    try {
      const text = await callGeminiStream(prompt, history, settings, systemInstruction, onStreamChunk);
      return {
        text,
        provider: 'gemini',
        emotion: inferEmotionFromText(text, 'assistant'),
      };
    } catch {
      // Try Local LLM next, then offline
    }
  }

  if (settings.ai.localEndpoint.trim()) {
    try {
      const text = await callLocalLLM(prompt, history, settings, systemInstruction);
      return {
        text,
        provider: 'local-llm',
        emotion: inferEmotionFromText(text, 'assistant'),
      };
    } catch {
      // Fall back smoothly to Offline Core
    }
  }

  return {
    text: offlinePreview.text,
    provider: 'offline',
    emotion: offlinePreview.emotion,
  };
}
