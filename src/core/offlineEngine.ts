import type {
  EmotionState,
  MemoryFact,
  PersonalityTone,
  XeroSettings,
} from './types';
import { ALL_EMOTIONS, inferEmotionFromText } from './emotions';
import { parseMultiListItems } from './productivity';

export interface OfflineAction {
  type:
    | 'none'
    | 'handled-locally'
    | 'start-timer'
    | 'clear-timers'
    | 'add-reminder'
    | 'music-play'
    | 'music-pause'
    | 'music-next'
    | 'music-prev'
    | 'set-volume'
    | 'adjust-volume'
    | 'toggle-mute'
    | 'take-screenshot'
    | 'start-breathing'
    | 'show-system-hud'
    | 'set-emotion'
    | 'open-studio'
    | 'minimize-island'
    | 'remember-fact'
    | 'clear-clipboard'
    | 'open-menu'
    | 'open-teleprompter'
    | 'set-mode'
    | 'add-todo'
    | 'add-shopping'
    | 'log-water'
    | 'toggle-night-light'
    | 'set-brightness'
    | 'toggle-awake'
    | 'start-stopwatch'
    | 'start-pomodoro'
    | 'shelf-image-op'
    | 'shelf-summarize'
    | 'open-shortcut'
    | 'web-search'
    | 'screen-assist';
  payload?: Record<string, string | number | string[]>;
}

export interface OfflineReply {
  text: string;
  emotion: EmotionState;
  action: OfflineAction;
}

export function stripWakeWordPrefix(raw: string, wakeWord = 'Hey Xero'): string {
  const escaped = wakeWord.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let cleaned = raw.trim();
  if (escaped) {
    cleaned = cleaned.replace(new RegExp(`^${escaped}[,:\\s]+`, 'i'), '');
  }
  cleaned = cleaned.replace(/^(?:hey\s+xero|xero)[,:\s]+/i, '').trim();
  return cleaned;
}

function formatTone(text: string, tone: PersonalityTone, userName: string): string {
  const prefix = userName ? `${userName}, ` : '';
  switch (tone) {
    case 'Concise Technical':
      return text;
    case 'Playful Companion':
      return `${text}`;
    case 'Calm Minimalist':
      return text;
    case 'Friendly Cyberpunk':
    default:
      return prefix && !text.startsWith(userName) && Math.random() < 0.25 ? `${prefix}${text[0].toLowerCase()}${text.slice(1)}` : text;
  }
}

export function safeEvaluateMath(raw: string): number | null {
  const normalized = raw
    .toLowerCase()
    .replace(/what is|calculate|compute|solve|equals|=\?/g, '')
    .replace(/sqrt\(([^)]+)\)/g, 'Math.sqrt($1)')
    .replace(/\^/g, '**')
    .trim();

  if (!normalized || !/^[0-9+\-*/().%\s*Mathsqrt,]+$/.test(normalized)) {
    return null;
  }
  if (!/[0-9]/.test(normalized) || !/[+\-*/%]|Math\.sqrt|\*\*/.test(normalized)) {
    return null;
  }
  try {
    const fn = new Function(`"use strict"; return (${normalized});`);
    const result = fn();
    if (typeof result === 'number' && Number.isFinite(result)) {
      return Math.round(result * 1_000_000) / 1_000_000;
    }
    return null;
  } catch {
    return null;
  }
}

export function parseDurationSeconds(input: string): number | null {
  const match = input.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)\b/i);
  if (!match) return null;
  const amount = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) return null;
  if (unit.startsWith('h')) return Math.round(amount * 3600);
  if (unit.startsWith('m')) return Math.round(amount * 60);
  return Math.round(amount);
}

export function runOfflineEngine(
  input: string,
  settings: XeroSettings,
  memories: MemoryFact[],
  contextSummary: { timersCount: number; clipboardCount: number; filesCount: number; isOnline: boolean }
): OfflineReply {
  const trimmed = stripWakeWordPrefix(input, settings.voice.wakeWord);
  const lower = trimmed.toLowerCase();
  const { assistantName, userName, personalityTone } = settings.personalization;

  if (!trimmed) {
    return {
      text: 'Listening whenever you are ready.',
      emotion: 'listening',
      action: { type: 'none' },
    };
  }

  // 1. Studio / Island / Contextual Menu / Mode controls
  if (/\b(open|launch|show)\s+(xero\s+)?studio\b/.test(lower)) {
    return {
      text: 'Opening XERO Studio in an independent window. I will stay right here.',
      emotion: 'happy',
      action: { type: 'open-studio' },
    };
  }
  if (/\b(open|show)\s+(the\s+)?(context\s+)?menu\b/.test(lower)) {
    return {
      text: 'Opening compact contextual menu.',
      emotion: 'curious',
      action: { type: 'open-menu', payload: { category: 'widgets' } },
    };
  }
  if (/\b(open|launch|show)\s+teleprompter\b/.test(lower)) {
    return {
      text: 'Opening independent floating Teleprompter.',
      emotion: 'focused',
      action: { type: 'open-teleprompter' },
    };
  }
  if (/\b(dictate\s+mode|switch\s+to\s+dictate)\b/.test(lower)) {
    return {
      text: 'Switched to Dictate mode.',
      emotion: 'listening',
      action: { type: 'set-mode', payload: { mode: 'dictate' } },
    };
  }
  if (/\b(write\s+mode|switch\s+to\s+write)\b/.test(lower)) {
    return {
      text: 'Switched to Write mode.',
      emotion: 'focused',
      action: { type: 'set-mode', payload: { mode: 'write' } },
    };
  }
  if (/\b(command\s+mode|switch\s+to\s+command)\b/.test(lower)) {
    return {
      text: 'Switched to Command mode.',
      emotion: 'neutral',
      action: { type: 'set-mode', payload: { mode: 'command' } },
    };
  }
  if (/\b(hide|tuck|peek|sleep\s+mode|minimize)\b/.test(lower)) {
    return {
      text: 'Tucking neatly into the top bezel. Move near the top edge whenever you want me to peek out.',
      emotion: 'sleepy',
      action: { type: 'minimize-island' },
    };
  }
  if (/\b(breathe|breathing|meditate|calm\s+down|relax)\b/.test(lower)) {
    return {
      text: 'Starting a calm 2D guided breathing ring in the notch.',
      emotion: 'affectionate',
      action: { type: 'start-breathing' },
    };
  }
  if (/\b(battery|system\s+hud|stats|telemetry|vitals)\b/.test(lower)) {
    return {
      text: 'Opening live 2D system vitals HUD in the notch.',
      emotion: 'focused',
      action: { type: 'show-system-hud' },
    };
  }

  // 2. Screen assistance & Shelf image/document voice tools
  if (/\b(explain|read|summarize)\s+(my\s+)?screen\b|\bwhat('s|\s+is)\s+on\s+my\s+screen\b/.test(lower)) {
    return {
      text: 'Starting explicit screen assistance capture.',
      emotion: 'focused',
      action: { type: 'screen-assist', payload: { prompt: trimmed } },
    };
  }
  if (/\b(resize)\s+(this\s+|the\s+)?image\b/.test(lower)) {
    return {
      text: 'Resizing the latest Shelf image (saving as a new copy).',
      emotion: 'focused',
      action: { type: 'shelf-image-op', payload: { op: 'resize-half' } },
    };
  }
  if (/\b(rotate)\s+(this\s+|the\s+)?image\b/.test(lower)) {
    return {
      text: 'Rotating the latest Shelf image 90° (saving as a new copy).',
      emotion: 'playful',
      action: { type: 'shelf-image-op', payload: { op: 'rotate-90' } },
    };
  }
  if (/\b(compress)\s+(this\s+|the\s+)?image\b/.test(lower)) {
    return {
      text: 'Compressing the latest Shelf image (saving as a new JPEG copy).',
      emotion: 'focused',
      action: { type: 'shelf-image-op', payload: { op: 'compress' } },
    };
  }
  if (/\b(convert)\s+(this\s+)?(to\s+)?png\b/.test(lower)) {
    return {
      text: 'Converting the latest Shelf image to PNG (saving as a new copy).',
      emotion: 'focused',
      action: { type: 'shelf-image-op', payload: { op: 'convert-png' } },
    };
  }
  if (/\bsummarize\s+(this\s+|the\s+)?(document|file|note)\b/.test(lower)) {
    return {
      text: 'Summarizing the latest document on your XERO Shelf.',
      emotion: 'focused',
      action: { type: 'shelf-summarize' },
    };
  }

  // 3. System / Desktop commands (honest capability reporting)
  if (/\b(night\s+light|blue\s+light)\b/.test(lower)) {
    return {
      text: 'Toggled warm Night Light optical filter.',
      emotion: 'happy',
      action: { type: 'toggle-night-light' },
    };
  }
  const brightMatch = lower.match(/\bbrightness\s+(?:to\s+)?(\d{1,3})\s*%?/);
  if (brightMatch) {
    const level = Math.min(100, Math.max(35, Number(brightMatch[1])));
    return {
      text: `Adjusted preview display brightness filter to ${level}% (OS backlight control requires Windows native host).`,
      emotion: 'focused',
      action: { type: 'set-brightness', payload: { brightness: level } },
    };
  }
  if (/\b(keep\s+awake|stay\s+awake|prevent\s+sleep)\b/.test(lower)) {
    return {
      text: 'Toggling browser Wake Lock keep-awake session.',
      emotion: 'focused',
      action: { type: 'toggle-awake' },
    };
  }
  if (/\b(lock\s+computer|lock\s+screen|open\s+windows\s+settings|turn\s+(on|off)\s+(bluetooth|wi-?fi))\b/.test(lower)) {
    return {
      text: 'OS-level hardware controls (Lock Screen, Wi-Fi, Bluetooth, Windows Settings) require the Windows native Electron/Tauri host and are blocked in browser sandbox mode.',
      emotion: 'confused',
      action: { type: 'handled-locally' },
    };
  }
  const searchMatch = trimmed.match(/^(?:search\s+(?:the\s+web\s+)?for|google)\s+(.+)$/i);
  if (searchMatch) {
    return {
      text: `Prepared web search for "${searchMatch[1].trim()}".`,
      emotion: 'curious',
      action: { type: 'web-search', payload: { query: searchMatch[1].trim() } },
    };
  }
  const openAliasMatch = trimmed.match(/^open\s+([a-z0-9._-]+)$/i);
  if (openAliasMatch && !['studio', 'menu', 'teleprompter'].includes(openAliasMatch[1].toLowerCase())) {
    return {
      text: `Looking up shortcut "${openAliasMatch[1]}"…`,
      emotion: 'curious',
      action: { type: 'open-shortcut', payload: { alias: openAliasMatch[1].toLowerCase() } },
    };
  }

  // 4. Emotion testing commands
  for (const emo of ALL_EMOTIONS) {
    if (new RegExp(`\\b(look|feel|be|act|show|emotion)\\s+${emo}\\b`, 'i').test(lower)) {
      return {
        text: `Shifting expression to ${emo}.`,
        emotion: emo,
        action: { type: 'set-emotion', payload: { emotion: emo } },
      };
    }
  }

  // 5. Timers, Pomodoro, Stopwatch, Water, Lists & Reminders
  if (/\b(start|begin)\s+pomodoro\b/.test(lower)) {
    return {
      text: 'Started a 25m Pomodoro focus timer.',
      emotion: 'focused',
      action: { type: 'start-pomodoro' },
    };
  }
  if (/\b(start|begin)\s+stopwatch\b/.test(lower)) {
    return {
      text: 'Started stopwatch.',
      emotion: 'focused',
      action: { type: 'start-stopwatch' },
    };
  }
  if (/\b(log|add|drank|drink)\s+(?:a\s+)?(?:glass\s+of\s+)?water\b/.test(lower)) {
    return {
      text: 'Logged +250 ml of water. Stay hydrated!',
      emotion: 'happy',
      action: { type: 'log-water', payload: { ml: 250 } },
    };
  }
  if (/\bto\s+(?:my\s+)?shopping(?:\s+list)?\b/.test(lower)) {
    const items = parseMultiListItems(trimmed);
    if (items.length > 0) {
      return {
        text: `Added ${items.length} item(s) to Shopping List: ${items.join(', ')}.`,
        emotion: 'happy',
        action: { type: 'add-shopping', payload: { items } },
      };
    }
  }
  if (/\bto\s+(?:my\s+)?to-?do(?:\s+list)?\b/.test(lower)) {
    const items = parseMultiListItems(trimmed);
    if (items.length > 0) {
      return {
        text: `Added ${items.length} item(s) to To-Do List: ${items.join(', ')}.`,
        emotion: 'happy',
        action: { type: 'add-todo', payload: { items } },
      };
    }
  }
  if (/\b(clear|cancel|stop)\s+timers?\b/.test(lower)) {
    return {
      text: 'Cleared active timers.',
      emotion: 'focused',
      action: { type: 'clear-timers' },
    };
  }
  if (/\btimer\b/.test(lower)) {
    const secs = parseDurationSeconds(lower) ?? 60;
    const labelMatch = trimmed.match(/for\s+(.+)$/i);
    const label = labelMatch ? labelMatch[1].slice(0, 32) : 'Focus Timer';
    return {
      text: `Started a ${secs >= 60 ? `${Math.round(secs / 60)}m` : `${secs}s`} timer (${label}).`,
      emotion: 'focused',
      action: { type: 'start-timer', payload: { seconds: secs, label } },
    };
  }
  if (/\bremind(?:er)?\b/.test(lower)) {
    const secs = parseDurationSeconds(lower) ?? 60;
    const cleaned = trimmed
      .replace(/remind\s+me\s+(in\s+\d+\s*\w+\s*)?(to\s+)?/i, '')
      .trim() || 'Check in with XERO';
    return {
      text: `Reminder queued in ${secs}s: "${cleaned}".`,
      emotion: 'happy',
      action: { type: 'add-reminder', payload: { seconds: secs, text: cleaned } },
    };
  }

  // 6. Music, Volume & Screenshot HUD controls
  if (/\b(play\s+music|start\s+music|resume\s+music)\b/.test(lower) || lower === 'play') {
    return {
      text: 'Starting built-in ambient synth playback.',
      emotion: 'playful',
      action: { type: 'music-play' },
    };
  }
  if (/\b(pause|stop)\s+music\b/.test(lower) || lower === 'pause') {
    return {
      text: 'Paused ambient audio playback.',
      emotion: 'neutral',
      action: { type: 'music-pause' },
    };
  }
  if (/\bnext\s+(track|song)\b/.test(lower)) {
    return {
      text: 'Skipping to the next track.',
      emotion: 'happy',
      action: { type: 'music-next' },
    };
  }
  if (/\b(prev|previous)\s+(track|song)\b/.test(lower)) {
    return {
      text: 'Returning to the previous track.',
      emotion: 'neutral',
      action: { type: 'music-prev' },
    };
  }

  const volSetMatch = lower.match(/\bvolume\s+(?:to\s+)?(\d{1,3})\s*%?/);
  if (volSetMatch) {
    const level = Math.min(100, Math.max(0, Number(volSetMatch[1])));
    return {
      text: `Volume set to ${level}%.`,
      emotion: level === 0 ? 'sleepy' : 'happy',
      action: { type: 'set-volume', payload: { volume: level } },
    };
  }
  if (/\b(volume\s+up|louder|increase\s+volume)\b/.test(lower)) {
    return {
      text: 'Boosted volume +15%.',
      emotion: 'happy',
      action: { type: 'adjust-volume', payload: { delta: 15 } },
    };
  }
  if (/\b(volume\s+down|quieter|lower\s+volume|softer)\b/.test(lower)) {
    return {
      text: 'Lowered volume -15%.',
      emotion: 'neutral',
      action: { type: 'adjust-volume', payload: { delta: -15 } },
    };
  }
  if (/\b(mute|unmute|toggle\s+mute)\b/.test(lower)) {
    return {
      text: 'Toggled audio mute.',
      emotion: 'curious',
      action: { type: 'toggle-mute' },
    };
  }
  if (/\b(take\s+(a\s+)?screenshot|screenshot|capture\s+screen|snap\s+screen)\b/.test(lower)) {
    return {
      text: 'Captured a 2D workspace snapshot and saved it to your Shelf.',
      emotion: 'playful',
      action: { type: 'take-screenshot' },
    };
  }

  // 7. Persistent Memory
  const rememberMatch = trimmed.match(/^(?:please\s+)?remember\s+(?:that\s+)?(.+)$/i);
  if (rememberMatch) {
    const fact = rememberMatch[1].trim();
    return {
      text: `Stored in persistent local memory: "${fact}".`,
      emotion: 'affectionate',
      action: { type: 'remember-fact', payload: { fact } },
    };
  }
  if (/\bwhat do you remember\b|\bmy memories\b|\blist memory\b/.test(lower)) {
    if (memories.length === 0) {
      return {
        text: 'Local memory is currently empty. Say "remember that ..." anytime to save a note.',
        emotion: 'curious',
        action: { type: 'handled-locally' },
      };
    }
    const list = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.fact}`).join(' | ');
    return {
      text: `Saved memory (${memories.length}): ${list}`,
      emotion: 'happy',
      action: { type: 'handled-locally' },
    };
  }

  // 8. Safe offline math
  const mathResult = safeEvaluateMath(trimmed);
  if (mathResult !== null) {
    return {
      text: `Calculated offline: ${mathResult}`,
      emotion: 'focused',
      action: { type: 'handled-locally' },
    };
  }

  // 9. Time / Date / Status
  if (/\b(what time|current time|time is it)\b/.test(lower)) {
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return {
      text: `Local system time is ${now}.`,
      emotion: 'neutral',
      action: { type: 'handled-locally' },
    };
  }
  if (/\b(what date|today's date|what day)\b/.test(lower)) {
    const today = new Date().toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    return {
      text: `Today is ${today}.`,
      emotion: 'neutral',
      action: { type: 'handled-locally' },
    };
  }
  if (/\b(status|diagnostics|offline|online|summary)\b/.test(lower)) {
    return {
      text: `${assistantName} offline neural core active (${contextSummary.isOnline ? 'network available' : 'air-gapped offline'}). ${contextSummary.timersCount} active timers, ${contextSummary.clipboardCount} clipboard items, ${contextSummary.filesCount} shelf files, ${memories.length} saved memories.`,
      emotion: 'focused',
      action: { type: 'handled-locally' },
    };
  }

  // 10. Conversational offline fallback with personality
  if (/\b(hi|hello|hey|yo|morning|evening)\b/.test(lower)) {
    const greeting = userName
      ? `Hey ${userName}. ${assistantName} is running smoothly in local mode — ask for timers, math, music, files, or switch to Local LLM / Gemini in Studio.`
      : `Hey there. ${assistantName} is online in local companion mode — try timers, math, music, memory notes, or open Studio anytime.`;
    return {
      text: formatTone(greeting, personalityTone, userName),
      emotion: 'happy',
      action: { type: 'none' },
    };
  }

  if (/\b(who are you|what can you do|help)\b/.test(lower)) {
    return {
      text: `I am ${assistantName}, your floating Dynamic Island companion. Even completely offline, I handle Command, Dictate & Write modes, timers, reminders, to-do & shopping lists, water tracking, math, ambient music with synced lyrics, drag-and-drop file shelf with image tools, teleprompter, and persistent memory.`,
      emotion: 'excited',
      action: { type: 'none' },
    };
  }

  const inferred = inferEmotionFromText(trimmed, 'assistant');
  const memoryHint =
    memories.length > 0
      ? ` (Keeping in mind: "${memories[0].fact}")`
      : '';
  return {
    text: formatTone(
      `Offline core received "${trimmed.slice(0, 64)}".${memoryHint} Tip: connect a Local LLM (Ollama/LM Studio) or Gemini in XERO Studio for deep open-ended reasoning, or ask me for timers, math, music, lists, or shelf tools.`,
      personalityTone,
      userName
    ),
    emotion: inferred,
    action: { type: 'none' },
  };
}
