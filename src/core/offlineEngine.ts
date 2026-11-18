import type {
  EmotionState,
  MemoryFact,
  PersonalityTone,
  XeroSettings,
} from './types';
import { ALL_EMOTIONS, inferEmotionFromText } from './emotions';
import { parseMultiListItems } from './productivity';
import {
  buildJarvisBriefing,
  evaluatePercentageExpression,
  evaluateUnitConversion,
  generateSecureSecret,
  lookupWorldTimeQuery,
  matchThemePresetFromCommand,
  parseSettingCommand,
  splitCompoundCommands,
  type WorkspaceTelemetryContext,
} from './jarvisEngine';

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
    | 'add-note'
    | 'open-tab'
    | 'shelf-image-op'
    | 'shelf-summarize'
    | 'open-shortcut'
    | 'web-search'
    | 'screen-assist'
    | 'set-appearance-preset'
    | 'copy-generated'
    | 'update-setting'
    | 'clear-notes'
    | 'complete-todos'
    | 'pause-timer'
    | 'resume-timer'
    | 'timer-status'
    | 'catch-me-up'
    | 'capture-that'
    | 'set-response-depth'
    | 'request-confirmation'
    | 'clear-preferences';
  payload?: Record<string, string | number | boolean | string[]>;
}

export interface OfflineReply {
  text: string;
  emotion: EmotionState;
  action: OfflineAction;
  actions?: OfflineAction[];
  actionLabels?: string[];
}

export function extractWakeWordCommand(
  raw: string,
  wakeWord = 'Hey Xero'
): { matched: boolean; command: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { matched: false, command: '' };

  const normalizedWake = wakeWord
    .trim()
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const flexibleWakePattern = normalizedWake
    ? normalizedWake
        .split(' ')
        .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[,:\\s]+')
    : '';

  const isDefaultXero = !normalizedWake || /\bxero\b/i.test(normalizedWake);
  const candidates = [
    ...(flexibleWakePattern ? [flexibleWakePattern] : []),
    ...(isDefaultXero ? ['(?:hey|hi|ok(?:ay)?)[,:\\s]+(?:xero|zero|hero)', 'xero'] : []),
  ];
  const pattern = new RegExp(`(?:^|\\b)(?:${candidates.join('|')})(?:[,:!?\\s]+(.*))?$`, 'i');
  const match = trimmed.match(pattern);
  if (!match) return { matched: false, command: trimmed };
  return {
    matched: true,
    command: (match[1] ?? '').trim(),
  };
}

export function stripWakeWordPrefix(raw: string, wakeWord = 'Hey Xero'): string {
  const extracted = extractWakeWordCommand(raw, wakeWord);
  if (extracted.matched && extracted.command) {
    return extracted.command;
  }
  const escaped = wakeWord.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let cleaned = raw.trim();
  if (escaped) {
    cleaned = cleaned.replace(new RegExp(`^${escaped}[,:\\s]+`, 'i'), '');
  }
  cleaned = cleaned.replace(/^(?:(?:hey|hi|ok(?:ay)?)\s+(?:xero|zero)|xero)[,:\s]+/i, '').trim();
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

export function describeOfflineAction(action: OfflineAction): string | null {
  switch (action.type) {
    case 'start-pomodoro':
      return '25m Pomodoro';
    case 'start-timer':
      return `${action.payload?.label || 'Timer'}`;
    case 'clear-timers':
      return 'Cleared Timers';
    case 'add-reminder':
      return `Reminder`;
    case 'add-note':
      return 'Saved Note';
    case 'add-todo':
      return 'To-Do Added';
    case 'add-shopping':
      return 'Shopping Added';
    case 'log-water':
      return '+250ml Water';
    case 'music-play':
      return 'Music Playing';
    case 'music-pause':
      return 'Music Paused';
    case 'music-next':
      return 'Next Track';
    case 'music-prev':
      return 'Previous Track';
    case 'set-volume':
      return `Vol ${action.payload?.volume ?? ''}%`;
    case 'adjust-volume':
      return 'Volume Adjusted';
    case 'toggle-mute':
      return 'Mute Toggled';
    case 'take-screenshot':
      return 'Snapshot Saved';
    case 'start-breathing':
      return 'Breathing Ring';
    case 'show-system-hud':
      return 'System Vitals';
    case 'open-studio':
      return 'Studio Opened';
    case 'minimize-island':
      return 'Hidden Up Top';
    case 'open-teleprompter':
      return 'Teleprompter';
    case 'toggle-night-light':
      return 'Night Light';
    case 'set-brightness':
      return `Dimmer ${action.payload?.brightness ?? ''}%`;
    case 'toggle-awake':
      return 'Wake Lock';
    case 'set-appearance-preset':
      return `${action.payload?.preset ?? 'Theme'} Theme`;
    case 'copy-generated':
      return `Copied ${action.payload?.kind ?? 'Secret'}`;
    case 'update-setting':
      return `${String(action.payload?.summary || 'Updated Setting')}`;
    case 'clear-clipboard':
      return 'Cleared Clipboard';
    case 'clear-notes':
      return 'Cleared Notes';
    case 'complete-todos':
      return 'Completed Tasks';
    case 'open-tab':
      return `Opened ${action.payload?.tab ?? 'Tab'}`;
    case 'pause-timer':
      return 'Timer Paused';
    case 'resume-timer':
      return 'Timer Resumed';
    case 'timer-status':
      return 'Timer Status';
    case 'catch-me-up':
      return 'Session Catch-Up';
    case 'capture-that':
      return 'Captured Note';
    case 'set-response-depth':
      return `Depth: ${String(action.payload?.depth ?? 'balanced')}`;
    case 'clear-preferences':
      return 'Cleared Preferences';
    default:
      return null;
  }
}

export function runOfflineEngine(
  input: string,
  settings: XeroSettings,
  memories: MemoryFact[],
  contextSummary: WorkspaceTelemetryContext
): OfflineReply {
  const cleaned = stripWakeWordPrefix(input, settings.voice.wakeWord);
  if (!cleaned) {
    return {
      text: 'Listening whenever you are ready.',
      emotion: 'listening',
      action: { type: 'none' },
    };
  }

  // Compound Jarvis command orchestration (e.g. "start pomodoro and play music and hide")
  const segments = splitCompoundCommands(cleaned);
  if (segments.length > 1) {
    const subReplies = segments.map((seg) =>
      runSingleOfflineIntent(seg, settings, memories, contextSummary)
    );
    const actionable = subReplies.filter(
      (r) => r.action.type !== 'none' && r.action.type !== 'handled-locally'
    );
    if (actionable.length >= 2) {
      const actions = subReplies.flatMap((r) =>
        r.actions && r.actions.length > 0 ? r.actions : r.action.type !== 'none' ? [r.action] : []
      );
      const labels = actions
        .map((a) => describeOfflineAction(a))
        .filter((l): l is string => Boolean(l));
      return {
        text: subReplies.map((r) => r.text).join('\n'),
        emotion: subReplies[subReplies.length - 1].emotion,
        action: actions[0] ?? { type: 'handled-locally' },
        actions,
        actionLabels: labels,
      };
    }
  }

  return runSingleOfflineIntent(cleaned, settings, memories, contextSummary);
}

function runSingleOfflineIntent(
  trimmed: string,
  settings: XeroSettings,
  memories: MemoryFact[],
  contextSummary: WorkspaceTelemetryContext
): OfflineReply {
  const lower = trimmed.toLowerCase();
  const { assistantName, userName, personalityTone } = settings.personalization;

  if (!trimmed) {
    return {
      text: 'Listening whenever you are ready.',
      emotion: 'listening',
      action: { type: 'none' },
    };
  }

  // 0. Everyday Voice/Chat Workflow Commands & Multi-Action Protocols
  if (/\b(catch\s+me\s+up|session\s+recap|recap\s+(?:the\s+)?session|what\s+did\s+we\s+decide)\b/.test(lower)) {
    return {
      text: 'Summarizing this session into decisions, open questions, and next steps.',
      emotion: 'focused',
      action: { type: 'catch-me-up' },
      actionLabels: ['Session Catch-Up'],
    };
  }
  const captureMatch = trimmed.match(/^(?:capture\s+(?:that|this)(?:\s+as\s+a?\s*(?:checklist|note))?|export\s+(?:that|notes?))(?:\s*[:,-]\s*(.+))?$/i);
  if (captureMatch || /\b(capture\s+that|save\s+that\s+to\s+(?:a\s+)?(?:note|checklist))\b/.test(lower)) {
    const explicitBody = captureMatch?.[1]?.trim() ?? '';
    const asChecklist = /\bchecklist\b/i.test(lower);
    return {
      text: asChecklist
        ? 'Captured conversation highlight as a checklist ready for Markdown export.'
        : 'Captured conversation highlight as a quick note ready for Markdown export.',
      emotion: 'happy',
      action: { type: 'capture-that', payload: { text: explicitBody, asChecklist } },
      actionLabels: ['Captured Note'],
    };
  }
  if (/\b(keep\s+it\s+short|be\s+concise|shorter\s+(?:answers|replies)|make\s+it\s+brief)\b/.test(lower)) {
    return {
      text: 'Got it — keeping replies brief and direct for this session.',
      emotion: 'focused',
      action: { type: 'set-response-depth', payload: { depth: 'concise' } },
      actionLabels: ['Depth: concise'],
    };
  }
  if (/\b(go\s+deeper|more\s+detail(?:s|ed)?|deeper\s+(?:answers|explanation)|expand\s+on\s+that)\b/.test(lower)) {
    return {
      text: 'Understood — I will include full details and structured steps in the transcript while keeping voice summaries clear.',
      emotion: 'curious',
      action: { type: 'set-response-depth', payload: { depth: 'detailed' } },
      actionLabels: ['Depth: detailed'],
    };
  }
  if (/\b(balanced\s+replies|normal\s+(?:detail|length)|reset\s+response\s+depth)\b/.test(lower)) {
    return {
      text: 'Switched back to balanced response length.',
      emotion: 'neutral',
      action: { type: 'set-response-depth', payload: { depth: 'balanced' } },
      actionLabels: ['Depth: balanced'],
    };
  }
  if (/\b(time\s+left|how\s+much\s+time(?:\s+is)?\s+left|timer\s+status)\b/.test(lower)) {
    return {
      text: 'Checking active timer status.',
      emotion: 'curious',
      action: { type: 'timer-status' },
      actionLabels: ['Timer Status'],
    };
  }
  if (/\b(pause\s+(?:the\s+)?timer|pause\s+focus)\b/.test(lower) || lower === 'pause timer') {
    return {
      text: 'Pausing active timer.',
      emotion: 'focused',
      action: { type: 'pause-timer' },
      actionLabels: ['Timer Paused'],
    };
  }
  if (/\b(resume\s+(?:the\s+)?timer|resume\s+focus|continue\s+timer)\b/.test(lower) || lower === 'resume timer') {
    return {
      text: 'Resuming paused timer.',
      emotion: 'happy',
      action: { type: 'resume-timer' },
      actionLabels: ['Timer Resumed'],
    };
  }
  const focusDurationMatch = lower.match(/\bfocus(?:\s+timer)?\s+for\s+(.+)$/);
  if (focusDurationMatch) {
    const secs = parseDurationSeconds(focusDurationMatch[1]);
    if (secs) {
      const label = secs === 1500 ? 'Focus 25m' : `Focus ${secs >= 60 ? `${Math.round(secs / 60)}m` : `${secs}s`}`;
      return {
        text: `Started a ${secs >= 60 ? `${Math.round(secs / 60)}m` : `${secs}s`} local focus timer. Ask "time left", "pause", or "cancel" anytime.`,
        emotion: 'focused',
        action: { type: 'start-timer', payload: { seconds: secs, label } },
        actionLabels: [label],
      };
    }
    return {
      text: 'How long should I set your focus timer for? (For example, "Focus for 25 minutes".)',
      emotion: 'curious',
      action: { type: 'handled-locally' },
    };
  }
  if (/\b(clear|forget|reset)\s+(?:all\s+)?(?:saved\s+)?preferences\b/.test(lower)) {
    return {
      text: 'Do you want me to clear all saved local preferences? Confirm to proceed.',
      emotion: 'curious',
      action: {
        type: 'request-confirmation',
        payload: {
          kind: 'destructive',
          summary: 'Clear all saved local preferences?',
          targetActionType: 'clear-preferences',
        },
      },
    };
  }

  // 0b. J.A.R.V.I.S. Multi-Action Protocols & Live Tactical Briefing
  if (/\b(daily\s+brief(?:ing)?|morning\s+brief(?:ing)?|tactical\s+brief(?:ing)?|jarvis\s+brief(?:ing)?|status\s+report|brief\s+me)\b/.test(lower)) {
    return {
      text: buildJarvisBriefing(settings, memories, contextSummary),
      emotion: 'focused',
      action: { type: 'show-system-hud' },
      actions: [{ type: 'show-system-hud' }],
      actionLabels: ['Tactical Briefing', 'System Vitals'],
    };
  }
  if (/\b(focus\s+protocol|deep\s+work(?:\s+protocol|\s+mode)?|activate\s+focus(?:\s+mode)?|jarvis\s+focus)\b/.test(lower)) {
    const actions: OfflineAction[] = [
      { type: 'start-pomodoro' },
      { type: 'music-play' },
      { type: 'open-tab', payload: { tab: 'timers' } },
    ];
    return {
      text: 'Focus Protocol engaged: 25m Pomodoro started, ambient synth active, and workspace timer ready.',
      emotion: 'focused',
      action: actions[0],
      actions,
      actionLabels: ['25m Pomodoro', 'Ambient Music', 'Timers View'],
    };
  }
  if (/\b(stealth\s+(?:mode|protocol)|stand\s+down|go\s+dark)\b/.test(lower)) {
    const actions: OfflineAction[] = [
      { type: 'music-pause' },
      { type: 'set-brightness', payload: { brightness: 75 } },
      { type: 'minimize-island' },
    ];
    return {
      text: 'Stealth Protocol engaged: audio paused, display dimmed to 75%, tucking into top bezel.',
      emotion: 'sleepy',
      action: actions[0],
      actions,
      actionLabels: ['Music Paused', 'Dimmer 75%', 'Hidden Up Top'],
    };
  }
  if (/\b(meeting\s+(?:mode|protocol)|presentation\s+(?:mode|protocol)|stage\s+mode)\b/.test(lower)) {
    const actions: OfflineAction[] = [
      { type: 'music-pause' },
      { type: 'toggle-awake' },
      { type: 'open-teleprompter' },
    ];
    return {
      text: 'Meeting Protocol engaged: audio paused, Wake Lock toggled, and independent Teleprompter opened.',
      emotion: 'focused',
      action: actions[0],
      actions,
      actionLabels: ['Music Paused', 'Keep Awake', 'Teleprompter'],
    };
  }
  if (/\b(break\s+protocol|recharge\s+protocol|take\s+a\s+break)\b/.test(lower)) {
    const actions: OfflineAction[] = [
      { type: 'start-timer', payload: { seconds: 300, label: '5m Recharge' } },
      { type: 'log-water', payload: { ml: 250 } },
      { type: 'start-breathing' },
    ];
    return {
      text: 'Recharge Protocol engaged: 5m break timer, +250 ml hydration logged, and 2D breathing rhythm active.',
      emotion: 'affectionate',
      action: actions[0],
      actions,
      actionLabels: ['5m Break Timer', '+250ml Water', 'Breathing Ring'],
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
  const tabMatch = lower.match(/\b(?:open|show|view|switch\s+to)\s+(timers?|music|clipboard|shelf|files?|notes?|lists?|stopwatch)\b/);
  if (tabMatch) {
    const target = tabMatch[1];
    const mappedTab =
      target.startsWith('music')
        ? 'music'
        : target.startsWith('clip')
          ? 'clipboard'
          : target.startsWith('shelf') || target.startsWith('file')
            ? 'files'
            : 'timers';
    return {
      text: `Opened ${target} view inside the notch.`,
      emotion: 'happy',
      action: { type: 'open-tab', payload: { tab: mappedTab } },
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

  // 3. System / Appearance / Basic Settings / Desktop commands (honest capability reporting)
  const settingCmd = parseSettingCommand(lower);
  if (settingCmd) {
    return {
      text: `${settingCmd.summary}.`,
      emotion: typeof settingCmd.value === 'boolean' ? (settingCmd.value ? 'happy' : 'neutral') : 'focused',
      action: {
        type: 'update-setting',
        payload: {
          key: settingCmd.key,
          value: settingCmd.value,
          summary: settingCmd.summary,
        },
      },
    };
  }
  const themeMatch = matchThemePresetFromCommand(lower);
  if (themeMatch) {
    return {
      text: `Applied "${themeMatch}" appearance theme preset.`,
      emotion: 'happy',
      action: { type: 'set-appearance-preset', payload: { preset: themeMatch } },
    };
  }
  if (/\b(night\s+light|blue\s+light)\b/.test(lower)) {
    return {
      text: 'Toggled warm Night Light optical filter.',
      emotion: 'happy',
      action: { type: 'toggle-night-light' },
    };
  }
  const brightMatch = lower.match(/\b(?:brightness|dim(?:\s+screen)?)\s+(?:to\s+)?(\d{1,3})\s*%?/);
  if (brightMatch) {
    const level = Math.min(100, Math.max(35, Number(brightMatch[1])));
    return {
      text: `Adjusted preview display brightness filter to ${level}% (OS backlight control requires Windows native host).`,
      emotion: level <= 65 ? 'sleepy' : 'happy',
      action: { type: 'set-brightness', payload: { brightness: level } },
    };
  }
  if (/\b(dim\s+(?:the\s+)?screen|lower\s+brightness|darker\s+screen)\b/.test(lower)) {
    const nextLevel = Math.max(35, (contextSummary.brightness ?? 100) - 20);
    return {
      text: `Dimmed preview display brightness to ${nextLevel}%.`,
      emotion: 'sleepy',
      action: { type: 'set-brightness', payload: { brightness: nextLevel } },
    };
  }
  if (/\b(brighten\s+(?:the\s+)?screen|increase\s+brightness|raise\s+brightness)\b/.test(lower)) {
    const nextLevel = Math.min(100, (contextSummary.brightness ?? 80) + 20);
    return {
      text: `Raised preview display brightness to ${nextLevel}%.`,
      emotion: 'happy',
      action: { type: 'set-brightness', payload: { brightness: nextLevel } },
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

  // 5. Quick Notes, Persistent Memory / Preferences, Timers, Pomodoro, Stopwatch, Water, Lists & Reminders
  if (/^(?:take\s+(?:a\s+)?note|add\s+(?:a\s+)?note|quick\s+note)$/i.test(trimmed)) {
    return {
      text: 'What would you like me to write in that note?',
      emotion: 'curious',
      action: { type: 'handled-locally' },
    };
  }
  const takeNoteMatch = trimmed.match(/^(?:take\s+(?:a\s+)?note|add\s+(?:a\s+)?note|note\s+that|quick\s+note)\s*[:,-]?\s*(.+)$/i);
  if (takeNoteMatch && takeNoteMatch[1]?.trim()) {
    const noteText = takeNoteMatch[1].trim();
    return {
      text: `Saved quick note: "${noteText}".`,
      emotion: 'happy',
      action: { type: 'add-note', payload: { text: noteText } },
    };
  }
  const preferenceMatch = trimmed.match(/^(?:please\s+)?remember\s+(?:that\s+)?(i\s+prefer\b.+|my\s+preference\b.+)$/i);
  if (preferenceMatch) {
    const fact = preferenceMatch[1].trim();
    const isShortPref = /\b(short|concise|brief)\b/i.test(fact);
    return {
      text: `I can save "${fact}" to your local preferences${isShortPref ? ' and keep replies concise' : ''}. Would you like me to save that locally?`,
      emotion: 'affectionate',
      action: {
        type: 'request-confirmation',
        payload: {
          kind: 'preference',
          summary: `Save local preference: "${fact}"?`,
          targetActionType: 'remember-fact',
          fact,
          ...(isShortPref ? { alsoDepth: 'concise' } : {}),
        },
      },
    };
  }
  const earlyRememberMatch = trimmed.match(/^(?:please\s+)?remember\s+(?:that\s+)?(.+)$/i);
  if (earlyRememberMatch) {
    const fact = earlyRememberMatch[1].trim();
    return {
      text: `Stored in persistent local memory: "${fact}".`,
      emotion: 'affectionate',
      action: { type: 'remember-fact', payload: { fact } },
    };
  }
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
  if (/^(?:please\s+)?(?:log|add|i\s+drank|drank|drink)\s+(?:a\s+)?(?:glass\s+of\s+)?water\b/.test(lower)) {
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
  if (/\b(clear|cancel|stop)\s+(?:all\s+)?timers?\b/.test(lower)) {
    return {
      text: 'Confirm canceling active timers?',
      emotion: 'curious',
      action: {
        type: 'request-confirmation',
        payload: {
          kind: 'destructive',
          summary: 'Cancel all active timers?',
          targetActionType: 'clear-timers',
        },
      },
    };
  }
  if (/\btimer\b/.test(lower)) {
    const secs = parseDurationSeconds(lower);
    if (!secs) {
      return {
        text: 'How long should I set the timer for? (For example, "5 minutes" or "45 seconds".)',
        emotion: 'curious',
        action: { type: 'handled-locally' },
      };
    }
    const labelMatch = trimmed.match(/for\s+(.+)$/i);
    const label = labelMatch ? labelMatch[1].slice(0, 32) : 'Focus Timer';
    return {
      text: `Started a ${secs >= 60 ? `${Math.round(secs / 60)}m` : `${secs}s`} timer (${label}).`,
      emotion: 'focused',
      action: { type: 'start-timer', payload: { seconds: secs, label } },
    };
  }
  if (/^(?:set\s+a?\s*)?remind(?:er)?$/i.test(trimmed)) {
    return {
      text: 'What should I remind you about, and when?',
      emotion: 'curious',
      action: { type: 'handled-locally' },
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

  if (/\b(clear|empty)\s+clipboard\b/.test(lower)) {
    return {
      text: 'Cleared Clipboard History.',
      emotion: 'neutral',
      action: { type: 'clear-clipboard' },
    };
  }
  if (/\b(clear|delete\s+all)\s+notes\b/.test(lower)) {
    return {
      text: 'Confirm clearing all quick notes?',
      emotion: 'curious',
      action: {
        type: 'request-confirmation',
        payload: {
          kind: 'destructive',
          summary: 'Delete all quick notes?',
          targetActionType: 'clear-notes',
        },
      },
    };
  }
  if (/\b(complete|finish|check\s+off)\s+(?:all\s+)?(?:tasks|to-?dos)\b/.test(lower)) {
    return {
      text: 'Marked all To-Do items complete!',
      emotion: 'excited',
      action: { type: 'complete-todos' },
    };
  }
  if (/\b(what\s+are\s+my\s+tasks|read\s+my\s+tasks|list\s+tasks|my\s+to-?dos)\b/.test(lower)) {
    const items = contextSummary.recentTodoTitles ?? [];
    return {
      text:
        items.length > 0
          ? `Open tasks (${contextSummary.pendingTodosCount ?? items.length}): ${items.join(' · ')}`
          : 'You have no pending tasks right now.',
      emotion: items.length > 0 ? 'focused' : 'happy',
      action: { type: 'handled-locally' },
    };
  }

  const volSetMatch = lower.match(/\b(?:volume|sound|audio)\s+(?:to\s+|at\s+)?(\d{1,3})\s*%?/);
  if (volSetMatch) {
    const level = Math.min(100, Math.max(0, Number(volSetMatch[1])));
    return {
      text: `Volume set to ${level}%.`,
      emotion: level === 0 ? 'sleepy' : level >= 85 ? 'excited' : 'happy',
      action: { type: 'set-volume', payload: { volume: level } },
    };
  }
  if (/\b(volume\s+up|sound\s+up|turn\s+up\s+(?:the\s+)?(?:volume|sound|audio)|increase\s+(?:the\s+)?(?:volume|sound|audio)|raise\s+(?:the\s+)?(?:volume|sound|audio)|louder)\b/.test(lower)) {
    return {
      text: 'Boosted sound +15%.',
      emotion: 'excited',
      action: { type: 'adjust-volume', payload: { delta: 15 } },
    };
  }
  if (/\b(volume\s+down|sound\s+down|turn\s+down\s+(?:the\s+)?(?:volume|sound|audio)|decrease\s+(?:the\s+)?(?:volume|sound|audio)|lower\s+(?:the\s+)?(?:volume|sound|audio)|quieter|softer)\b/.test(lower)) {
    return {
      text: 'Lowered sound -15%.',
      emotion: 'curious',
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
  if (/\b(what do you remember|my memories|list memory|my preferences|show preferences|saved preferences)\b/.test(lower)) {
    if (memories.length === 0) {
      return {
        text: 'Local preferences and memory are currently empty. Say "remember I prefer short answers" anytime to save a preference.',
        emotion: 'curious',
        action: { type: 'handled-locally' },
      };
    }
    const list = memories.slice(0, 5).map((m, i) => `${i + 1}. ${m.fact}`).join(' | ');
    return {
      text: `Saved preferences & memory (${memories.length}): ${list}`,
      emotion: 'happy',
      action: { type: 'handled-locally' },
    };
  }

  // 8. Safe offline math, unit conversions, percentages & secret generators
  const pctResult = evaluatePercentageExpression(trimmed);
  if (pctResult) {
    return {
      text: `Calculated offline: ${pctResult}`,
      emotion: 'focused',
      action: { type: 'handled-locally' },
    };
  }
  const unitResult = evaluateUnitConversion(trimmed);
  if (unitResult) {
    return {
      text: `Converted offline: ${unitResult}`,
      emotion: 'focused',
      action: { type: 'handled-locally' },
    };
  }
  if (/\b(?:generate|create|make)\s+(?:a\s+)?(?:strong\s+|random\s+)?password\b/.test(lower)) {
    const value = generateSecureSecret('password');
    return {
      text: `Generated 16-char secret and copied to Clipboard History: ${value}`,
      emotion: 'happy',
      action: { type: 'copy-generated', payload: { kind: 'Password', value } },
    };
  }
  if (/\b(?:generate|create|make)\s+(?:a\s+)?uuid\b/.test(lower)) {
    const value = generateSecureSecret('uuid');
    return {
      text: `Generated UUID and copied to Clipboard History: ${value}`,
      emotion: 'happy',
      action: { type: 'copy-generated', payload: { kind: 'UUID', value } },
    };
  }
  const mathResult = safeEvaluateMath(trimmed);
  if (mathResult !== null) {
    return {
      text: `Calculated offline: ${mathResult}`,
      emotion: 'focused',
      action: { type: 'handled-locally' },
    };
  }

  // 9. World Time / Local Time / Date / Status
  const worldTime = lookupWorldTimeQuery(lower);
  if (worldTime) {
    return {
      text: worldTime,
      emotion: 'curious',
      action: { type: 'handled-locally' },
    };
  }
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
