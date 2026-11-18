import type { AppearancePresetName, MemoryFact, XeroSettings } from './types';

export interface WorkspaceTelemetryContext {
  timersCount: number;
  runningTimersCount?: number;
  remindersCount?: number;
  pendingTodosCount?: number;
  notesCount?: number;
  waterMl?: number;
  clipboardCount: number;
  filesCount: number;
  isOnline: boolean;
  musicPlaying?: boolean;
  activeTrackTitle?: string;
  volume?: number;
  muted?: boolean;
  nightLight?: boolean;
  brightness?: number;
  wakeLockActive?: boolean;
  batteryPct?: number | null;
  charging?: boolean | null;
  recentTodoTitles?: string[];
  recentNoteTitles?: string[];
}

const WORLD_TIMEZONES: Array<{ aliases: string[]; label: string; tz: string }> = [
  { aliases: ['tokyo', 'japan', 'jst'], label: 'Tokyo', tz: 'Asia/Tokyo' },
  { aliases: ['london', 'uk', 'britain', 'bst', 'gmt'], label: 'London', tz: 'Europe/London' },
  { aliases: ['nyc', 'new york', 'est', 'edt', 'eastern'], label: 'New York', tz: 'America/New_York' },
  { aliases: ['sf', 'san francisco', 'la', 'los angeles', 'pst', 'pdt', 'pacific'], label: 'San Francisco', tz: 'America/Los_Angeles' },
  { aliases: ['paris', 'berlin', 'cet', 'cest', 'europe'], label: 'Berlin / Paris', tz: 'Europe/Berlin' },
  { aliases: ['dubai', 'uae', 'gst'], label: 'Dubai', tz: 'Asia/Dubai' },
  { aliases: ['india', 'mumbai', 'delhi', 'bangalore', 'ist'], label: 'Mumbai / IST', tz: 'Asia/Kolkata' },
  { aliases: ['singapore', 'sgt'], label: 'Singapore', tz: 'Asia/Singapore' },
  { aliases: ['sydney', 'australia', 'aest'], label: 'Sydney', tz: 'Australia/Sydney' },
  { aliases: ['utc', 'zulu', 'coordinated'], label: 'UTC', tz: 'UTC' },
];

export const THEME_KEYWORD_MAP: Array<{ keywords: string[]; preset: AppearancePresetName }> = [
  { keywords: ['cyan', 'cyber', 'default theme'], preset: 'Cyan' },
  { keywords: ['ice', 'ice white', 'white theme'], preset: 'Ice White' },
  { keywords: ['crimson', 'red'], preset: 'Crimson' },
  { keywords: ['violet', 'purple'], preset: 'Violet' },
  { keywords: ['emerald', 'green'], preset: 'Emerald' },
  { keywords: ['amber', 'gold', 'orange'], preset: 'Amber' },
  { keywords: ['sakura', 'pink', 'rose'], preset: 'Sakura' },
  { keywords: ['midnight', 'indigo', 'deep blue'], preset: 'Midnight' },
  { keywords: ['soft blue', 'sky blue', 'blue'], preset: 'Soft Blue' },
];

export function matchThemePresetFromCommand(lower: string): AppearancePresetName | null {
  if (!/\b(theme|preset|accent|color|colour|glow\s+color)\b/.test(lower)) {
    return null;
  }
  for (const entry of THEME_KEYWORD_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return entry.preset;
    }
  }
  return null;
}

export function evaluatePercentageExpression(raw: string): string | null {
  const cleaned = raw.trim().toLowerCase().replace(/^what\s+is\s+/, '').replace(/\?$/, '').trim();

  // "18% of 2450"
  const pctOf = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*%\s+of\s+(-?\d+(?:\.\d+)?)$/);
  if (pctOf) {
    const pct = parseFloat(pctOf[1]);
    const base = parseFloat(pctOf[2]);
    const val = Math.round((pct / 100) * base * 10000) / 10000;
    return `${pct}% of ${base} = ${val}`;
  }

  // "240 + 15%" or "1200 - 20%"
  const pctMod = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([+-])\s*(\d+(?:\.\d+)?)\s*%$/);
  if (pctMod) {
    const base = parseFloat(pctMod[1]);
    const op = pctMod[2];
    const pct = parseFloat(pctMod[3]);
    const delta = (base * pct) / 100;
    const val = Math.round((op === '+' ? base + delta : base - delta) * 10000) / 10000;
    return `${base} ${op} ${pct}% = ${val}`;
  }

  return null;
}

export function evaluateUnitConversion(raw: string): string | null {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^(?:convert|what\s+is)\s+/, '')
    .replace(/\?$/, '')
    .trim();

  const m = cleaned.match(/^(-?\d+(?:\.\d+)?)\s*([a-z°]+)\s+(?:to|in|into|as)\s+([a-z°]+)$/);
  if (!m) return null;

  const val = parseFloat(m[1]);
  const from = m[2].replace('°', '');
  const to = m[3].replace('°', '');
  if (!Number.isFinite(val)) return null;

  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Temperature
  if ((from === 'c' || from === 'celsius') && (to === 'f' || to === 'fahrenheit')) {
    return `${val}°C = ${round2((val * 9) / 5 + 32)}°F`;
  }
  if ((from === 'f' || from === 'fahrenheit') && (to === 'c' || to === 'celsius')) {
    return `${val}°F = ${round2(((val - 32) * 5) / 9)}°C`;
  }
  if ((from === 'c' || from === 'celsius') && (to === 'k' || to === 'kelvin')) {
    return `${val}°C = ${round2(val + 273.15)} K`;
  }

  // Distance
  const distMeters: Record<string, number> = {
    m: 1,
    meter: 1,
    meters: 1,
    km: 1000,
    kilometer: 1000,
    kilometers: 1000,
    cm: 0.01,
    mm: 0.001,
    mi: 1609.344,
    mile: 1609.344,
    miles: 1609.344,
    ft: 0.3048,
    feet: 0.3048,
    foot: 0.3048,
    in: 0.0254,
    inch: 0.0254,
    inches: 0.0254,
    yd: 0.9144,
    yard: 0.9144,
    yards: 0.9144,
  };
  if (distMeters[from] !== undefined && distMeters[to] !== undefined) {
    const out = (val * distMeters[from]) / distMeters[to];
    return `${val} ${from} = ${round2(out)} ${to}`;
  }

  // Mass
  const massKg: Record<string, number> = {
    kg: 1,
    kilogram: 1,
    kilograms: 1,
    g: 0.001,
    gram: 0.001,
    grams: 0.001,
    lb: 0.45359237,
    lbs: 0.45359237,
    pound: 0.45359237,
    pounds: 0.45359237,
    oz: 0.0283495,
    ounce: 0.0283495,
    ounces: 0.0283495,
  };
  if (massKg[from] !== undefined && massKg[to] !== undefined) {
    const out = (val * massKg[from]) / massKg[to];
    return `${val} ${from} = ${round2(out)} ${to}`;
  }

  // Data storage (binary/IEC-style standard 1024)
  const dataBytes: Record<string, number> = {
    b: 1,
    kb: 1024,
    mb: 1024 ** 2,
    gb: 1024 ** 3,
    tb: 1024 ** 4,
  };
  if (dataBytes[from] !== undefined && dataBytes[to] !== undefined) {
    const out = (val * dataBytes[from]) / dataBytes[to];
    return `${val} ${from.toUpperCase()} = ${Math.round(out * 1000) / 1000} ${to.toUpperCase()}`;
  }

  // Time
  const timeSec: Record<string, number> = {
    s: 1,
    sec: 1,
    secs: 1,
    second: 1,
    seconds: 1,
    m: 60,
    min: 60,
    mins: 60,
    minute: 60,
    minutes: 60,
    h: 3600,
    hr: 3600,
    hrs: 3600,
    hour: 3600,
    hours: 3600,
    d: 86400,
    day: 86400,
    days: 86400,
  };
  if (timeSec[from] !== undefined && timeSec[to] !== undefined) {
    const out = (val * timeSec[from]) / timeSec[to];
    return `${val} ${from} = ${round2(out)} ${to}`;
  }

  return null;
}

export function lookupWorldTimeQuery(lower: string): string | null {
  const timeMatch = lower.match(/\b(?:what(?:'s|\s+is)\s+(?:the\s+)?time\s+in|time\s+in|clock\s+for)\s+([a-z\s]+)\??$/i);
  if (!timeMatch) return null;
  const place = timeMatch[1].trim().toLowerCase();
  const hit = WORLD_TIMEZONES.find((entry) => entry.aliases.some((a) => place.includes(a)));
  if (!hit) return null;

  try {
    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone: hit.tz,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date());
    return `${hit.label} (${hit.tz}): ${formatted}`;
  } catch {
    return null;
  }
}

export function generateSecureSecret(kind: 'password' | 'uuid'): string {
  if (kind === 'uuid') {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
  const len = 16;
  const bytes = new Uint8Array(len);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < len; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function buildJarvisBriefing(
  settings: XeroSettings,
  memories: MemoryFact[],
  ctx: WorkspaceTelemetryContext
): string {
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = now.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const name = settings.personalization.userName?.trim() || 'Commander';
  const aiStack =
    settings.ai.providerMode === 'offline'
      ? 'Offline Core'
      : settings.ai.providerMode === 'local-llm'
        ? `Local (${settings.ai.localModel})`
        : ctx.isOnline
          ? 'Cloud + Local Ready'
          : 'Offline Standby';

  const powerInfo =
    ctx.batteryPct !== null && ctx.batteryPct !== undefined
      ? `Battery ${ctx.batteryPct}%${ctx.charging ? ' AC' : ''}`
      : 'Desktop Power';

  const parts = [
    `Tactical Briefing for ${name} — ${dateStr}, ${timeStr}`,
    `• Core & Systems: ${aiStack} · ${powerInfo} · Vol ${ctx.muted ? 'Muted' : `${ctx.volume ?? 72}%`} · Brightness ${ctx.brightness ?? 100}%${ctx.nightLight ? ' (Night Light)' : ''}${ctx.wakeLockActive ? ' · Keep Awake' : ''}`,
    `• Active Load: ${ctx.runningTimersCount ?? ctx.timersCount} timer(s) · ${ctx.pendingTodosCount ?? 0} open task(s) · ${ctx.notesCount ?? 0} note(s) · ${ctx.filesCount} shelf item(s)`,
    `• Hydration & Audio: ${ctx.waterMl ?? 0} ml logged · Music ${ctx.musicPlaying ? `playing "${ctx.activeTrackTitle || 'Synth'}"` : 'standby'} · ${memories.length} memory item(s)`,
  ];
  return parts.join('\n');
}

/**
 * Split compound Jarvis commands safely on "and then", "then", ";", or " and "
 * without breaking multi-item shopping/todo lists or explicit notes/memories.
 */
export function splitCompoundCommands(raw: string): string[] {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  if (!trimmed) return [];

  // Preserve intact single intents that naturally contain "and"
  if (
    /^(?:take\s+(?:a\s+)?note|add\s+(?:a\s+)?note|note\s+that|quick\s+note|remember)\b/i.test(lower) ||
    /\bto\s+(?:my\s+)?(?:shopping|to-?do)(?:\s+list)?\b/i.test(lower) ||
    /^(?:search\s+(?:the\s+web\s+)?for|google)\b/i.test(lower)
  ) {
    return [trimmed];
  }

  const segments = trimmed
    .split(/\s*(?:;\s*|\s*,\s*then\s+|\s+and\s+then\s+|\s+and\s+(?=(?:start|begin|play|pause|stop|next|prev|set|turn|toggle|enable|disable|increase|decrease|raise|lower|boost|open|launch|show|hide|tuck|minimize|take|capture|log|add|remind|switch|dim|brighten|mute|unmute|focus|stealth|meeting|breathe|snap|look|be|feel|clear|remember|generate|calculate|convert|check|reset)\b))/i)
    .map((s) => s.trim())
    .filter(Boolean);

  return segments.length > 1 ? segments : [trimmed];
}

export interface ParsedSettingUpdate {
  key:
    | 'gamingMode'
    | 'soundEffects'
    | 'spontaneousBehavior'
    | 'reducedMotion'
    | 'launchMinimized'
    | 'autoExpandOnTrackChange'
    | 'ttsEnabled'
    | 'wakeWordEnabled'
    | 'captureClipboardHistory'
    | 'autoHideDelayMs'
    | 'autoCollapseMs'
    | 'notchShape'
    | 'providerMode'
    | 'voiceResponseMode'
    | 'islandOpacity'
    | 'glowIntensity'
    | 'borderIllumination'
    | 'islandScale';
  value: string | number | boolean;
  summary: string;
}

export function parseSettingCommand(lower: string): ParsedSettingUpdate | null {
  const onOff = /\b(on|enable|activate|true)\b/.test(lower)
    ? true
    : /\b(off|disable|deactivate|false)\b/.test(lower)
      ? false
      : null;

  if (/\bgaming\s+mode\b/.test(lower) && onOff !== null) {
    return { key: 'gamingMode', value: onOff, summary: `Gaming Mode ${onOff ? 'enabled' : 'disabled'}` };
  }
  if (/\b(sound\s+effects?|chimes?)\b/.test(lower) && onOff !== null) {
    return { key: 'soundEffects', value: onOff, summary: `Audio chimes ${onOff ? 'enabled' : 'muted'}` };
  }
  if (/\b(tts|text\s+to\s+speech|spoken\s+replies?|speak\s+replies?|voice\s+replies?)\b/.test(lower) && onOff !== null) {
    return { key: 'ttsEnabled', value: onOff, summary: `Spoken TTS replies ${onOff ? 'enabled' : 'disabled'}` };
  }
  if (/\b(spontaneous(?:\s+behaviou?r|\s+mode)?|living\s+pet)\b/.test(lower) && onOff !== null) {
    return { key: 'spontaneousBehavior', value: onOff, summary: `Spontaneous pet behavior ${onOff ? 'enabled' : 'disabled'}` };
  }
  if (/\breduced\s+motion\b/.test(lower) && onOff !== null) {
    return { key: 'reducedMotion', value: onOff, summary: `Reduced Motion ${onOff ? 'enabled' : 'disabled'}` };
  }
  if (/\blaunch\s+minimized\b/.test(lower) && onOff !== null) {
    return { key: 'launchMinimized', value: onOff, summary: `Launch Minimized ${onOff ? 'enabled' : 'disabled'}` };
  }
  if (/\bwake\s+word\b/.test(lower) && onOff !== null) {
    return { key: 'wakeWordEnabled', value: onOff, summary: `Wake Word ${onOff ? 'enabled' : 'disabled'}` };
  }
  if (/\bclipboard\s+(?:history|capture)\b/.test(lower) && onOff !== null) {
    return { key: 'captureClipboardHistory', value: onOff, summary: `Clipboard capture ${onOff ? 'enabled' : 'paused'}` };
  }

  // Notch shape
  const shapeMatch = lower.match(/\b(?:notch\s+shape|shape)\s+(?:to\s+)?(bezel|pill|squircle)\b/);
  if (shapeMatch) {
    return { key: 'notchShape', value: shapeMatch[1], summary: `Notch shape set to ${shapeMatch[1]}` };
  }

  // AI Provider Mode
  if (/\b(?:switch|set)\s+(?:ai|provider|engine)(?:\s+mode)?\s+(?:to\s+)?(auto|offline|local(?:\s+llm)?|gemini)\b/.test(lower)) {
    const m = lower.match(/\b(auto|offline|local(?:\s+llm)?|gemini)\b/);
    if (m) {
      const mode = m[1].startsWith('local') ? 'local-llm' : m[1];
      return { key: 'providerMode', value: mode, summary: `AI provider switched to ${mode}` };
    }
  }

  // Auto-hide delay
  if (/\bauto[-\s]?hide\b/.test(lower)) {
    if (/\b(off|disable|manual)\b/.test(lower)) {
      return { key: 'autoHideDelayMs', value: 0, summary: 'Auto-Hide set to Manual Only' };
    }
    const secMatch = lower.match(/(\d+)\s*s/);
    const secs = secMatch ? Math.max(5, Math.min(300, Number(secMatch[1]))) : 12;
    return { key: 'autoHideDelayMs', value: secs * 1000, summary: `Auto-Hide set to ${secs}s` };
  }

  // Auto-collapse delay
  if (/\bauto[-\s]?collapse\b/.test(lower)) {
    if (/\b(off|disable|manual)\b/.test(lower)) {
      return { key: 'autoCollapseMs', value: 0, summary: 'Auto-Collapse turned off' };
    }
    const secMatch = lower.match(/(\d+)\s*s/);
    const secs = secMatch ? Math.max(4, Math.min(180, Number(secMatch[1]))) : 15;
    return { key: 'autoCollapseMs', value: secs * 1000, summary: `Auto-Collapse set to ${secs}s` };
  }

  // Sliders: opacity, glow, border glow, scale
  const opacityMatch = lower.match(/\bopacity\s+(?:to\s+)?(\d{1,3})\s*%?/);
  if (opacityMatch) {
    const val = Math.min(1, Math.max(0.7, Number(opacityMatch[1]) / 100));
    return { key: 'islandOpacity', value: Math.round(val * 100) / 100, summary: `Opacity set to ${Math.round(val * 100)}%` };
  }
  const borderGlowMatch = lower.match(/\bborder\s+glow\s+(?:to\s+)?(\d{1,3})\s*%?/);
  if (borderGlowMatch) {
    const val = Math.min(1, Math.max(0, Number(borderGlowMatch[1]) / 100));
    return { key: 'borderIllumination', value: Math.round(val * 100) / 100, summary: `Edge Glow set to ${Math.round(val * 100)}%` };
  }
  const glowMatch = lower.match(/\bglow\s+(?:to\s+)?(\d{1,3})\s*%?/);
  if (glowMatch) {
    const val = Math.min(1, Math.max(0, Number(glowMatch[1]) / 100));
    return { key: 'glowIntensity', value: Math.round(val * 100) / 100, summary: `Glow Intensity set to ${Math.round(val * 100)}%` };
  }
  const scaleMatch = lower.match(/\b(?:notch\s+|island\s+)?scale\s+(?:to\s+)?(\d{2,3})\s*%?/);
  if (scaleMatch) {
    const val = Math.min(1.25, Math.max(0.85, Number(scaleMatch[1]) / 100));
    return { key: 'islandScale', value: Math.round(val * 100) / 100, summary: `Island scale set to ${Math.round(val * 100)}%` };
  }

  return null;
}

