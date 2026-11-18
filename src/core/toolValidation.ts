import type { OfflineAction } from './offlineEngine';

const ALLOWED_MODES = new Set(['command', 'dictate', 'write']);
const ALLOWED_TABS = new Set(['chat', 'timers', 'music', 'clipboard', 'files']);
const ALLOWED_DEPTHS = new Set(['concise', 'balanced', 'detailed']);

/**
 * Validates and maps an incoming Live or Cloud function call into typed workspace actions.
 * Rejects malformed inputs and flags destructive actions for user confirmation.
 */
export function validateAndMapToolCall(
  name: string | undefined,
  rawArgs: Record<string, unknown> | undefined
): {
  valid: boolean;
  actions: OfflineAction[];
  requiresConfirmation?: {
    kind: 'destructive' | 'preference';
    summary: string;
    action: OfflineAction;
  };
  error?: string;
} {
  const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {};

  if (name === 'manage_timer') {
    const cmd = String(args.command || 'start').toLowerCase().trim();
    if (cmd === 'pomodoro' || cmd === 'focus') {
      return { valid: true, actions: [{ type: 'start-pomodoro' }] };
    }
    if (cmd === 'stopwatch') {
      return { valid: true, actions: [{ type: 'start-stopwatch' }] };
    }
    if (cmd === 'pause') {
      return { valid: true, actions: [{ type: 'pause-timer' }] };
    }
    if (cmd === 'resume') {
      return { valid: true, actions: [{ type: 'resume-timer' }] };
    }
    if (cmd === 'status' || cmd === 'time_left') {
      return { valid: true, actions: [{ type: 'timer-status' }] };
    }
    if (cmd === 'clear' || cmd === 'cancel') {
      return {
        valid: true,
        actions: [],
        requiresConfirmation: {
          kind: 'destructive',
          summary: 'Cancel all active timers?',
          action: { type: 'clear-timers' },
        },
      };
    }
    const seconds = Number(args.seconds);
    if (!Number.isFinite(seconds) || seconds < 5 || seconds > 86400) {
      return { valid: false, actions: [], error: 'Timer duration must be between 5 seconds and 24 hours.' };
    }
    return {
      valid: true,
      actions: [
        {
          type: 'start-timer',
          payload: {
            seconds: Math.round(seconds),
            label: String(args.label || 'Focus Timer').trim().slice(0, 36) || 'Focus Timer',
          },
        },
      ],
    };
  }

  if (name === 'manage_productivity') {
    const kind = String(args.kind || '').toLowerCase().trim();
    if (kind === 'todo' || kind === 'shopping') {
      const items = Array.isArray(args.items)
        ? args.items.map((x) => String(x).trim()).filter(Boolean).slice(0, 12)
        : [];
      if (items.length === 0) {
        return { valid: false, actions: [], error: 'Provide at least one list item.' };
      }
      return {
        valid: true,
        actions: [{ type: kind === 'todo' ? 'add-todo' : 'add-shopping', payload: { items } }],
      };
    }
    if (kind === 'note') {
      const text = String(args.text || '').trim().slice(0, 400);
      if (!text) return { valid: false, actions: [], error: 'Note text cannot be empty.' };
      return { valid: true, actions: [{ type: 'add-note', payload: { text } }] };
    }
    if (kind === 'reminder') {
      const text = String(args.text || '').trim().slice(0, 200);
      if (!text) return { valid: false, actions: [], error: 'Reminder description is required.' };
      const delay = Math.min(86400, Math.max(5, Math.round(Number(args.delaySeconds) || 60)));
      return { valid: true, actions: [{ type: 'add-reminder', payload: { text, seconds: delay } }] };
    }
    if (kind === 'water') {
      const ml = Math.min(2000, Math.max(50, Math.round(Number(args.ml) || 250)));
      return { valid: true, actions: [{ type: 'log-water', payload: { ml } }] };
    }
    if (kind === 'memory' || kind === 'preference') {
      const fact = String(args.text || '').trim().slice(0, 220);
      if (!fact) return { valid: false, actions: [], error: 'Preference or memory text is required.' };
      return {
        valid: true,
        actions: [],
        requiresConfirmation: {
          kind: 'preference',
          summary: `Save preference locally: "${fact}"?`,
          action: { type: 'remember-fact', payload: { fact } },
        },
      };
    }
    return { valid: false, actions: [], error: `Unsupported productivity kind "${kind}".` };
  }

  if (name === 'set_response_depth') {
    const depth = String(args.depth || '').toLowerCase().trim();
    if (!ALLOWED_DEPTHS.has(depth)) {
      return { valid: false, actions: [], error: 'Response depth must be concise, balanced, or detailed.' };
    }
    return { valid: true, actions: [{ type: 'set-response-depth', payload: { depth } }] };
  }

  if (name === 'catch_me_up') {
    return { valid: true, actions: [{ type: 'catch-me-up' }] };
  }

  if (name === 'capture_that') {
    const summary = String(args.summary || '').trim().slice(0, 400);
    const asChecklist = Boolean(args.asChecklist);
    return {
      valid: true,
      actions: [{ type: 'capture-that', payload: { text: summary, asChecklist } }],
    };
  }

  if (name === 'control_workspace') {
    const act = String(args.action || '').toLowerCase().trim();
    const val = args.value !== undefined ? String(args.value).trim() : '';
    switch (act) {
      case 'play_music':
        return { valid: true, actions: [{ type: 'music-play' }] };
      case 'pause_music':
        return { valid: true, actions: [{ type: 'music-pause' }] };
      case 'next_track':
        return { valid: true, actions: [{ type: 'music-next' }] };
      case 'prev_track':
        return { valid: true, actions: [{ type: 'music-prev' }] };
      case 'set_volume': {
        const vol = Math.min(100, Math.max(0, Math.round(Number(val))));
        if (!Number.isFinite(vol)) return { valid: false, actions: [], error: 'Invalid volume percentage.' };
        return { valid: true, actions: [{ type: 'set-volume', payload: { volume: vol } }] };
      }
      case 'toggle_mute':
        return { valid: true, actions: [{ type: 'toggle-mute' }] };
      case 'toggle_night_light':
        return { valid: true, actions: [{ type: 'toggle-night-light' }] };
      case 'set_brightness': {
        const pct = Math.min(100, Math.max(35, Math.round(Number(val) || 85)));
        return { valid: true, actions: [{ type: 'set-brightness', payload: { brightness: pct } }] };
      }
      case 'open_tab':
        if (!ALLOWED_TABS.has(val || 'timers')) return { valid: false, actions: [], error: 'Unknown tab.' };
        return { valid: true, actions: [{ type: 'open-tab', payload: { tab: val || 'timers' } }] };
      case 'set_mode':
        if (!ALLOWED_MODES.has(val || 'command')) return { valid: false, actions: [], error: 'Unknown mode.' };
        return { valid: true, actions: [{ type: 'set-mode', payload: { mode: val || 'command' } }] };
      case 'open_studio':
        return { valid: true, actions: [{ type: 'open-studio' }] };
      case 'hide_notch':
        return { valid: true, actions: [{ type: 'minimize-island' }] };
      default:
        return { valid: false, actions: [], error: `Unsupported workspace action "${act}".` };
    }
  }

  return { valid: false, actions: [], error: `Unknown tool "${String(name || '')}".` };
}

/**
 * Bounded deduplication cache preventing duplicate writes across reconnects or retries.
 */
export class ToolWriteDeduplicator {
  private readonly seen = new Map<string, number>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = 64, ttlMs = 15_000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  private prune(now: number): void {
    for (const [k, ts] of this.seen.entries()) {
      if (now - ts > this.ttlMs) {
        this.seen.delete(k);
      }
    }
    while (this.seen.size >= this.maxEntries) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey === undefined) break;
      this.seen.delete(oldestKey);
    }
  }

  isDuplicate(toolName: string, args: unknown, callId?: string, now = Date.now()): boolean {
    this.prune(now);
    const serialized = JSON.stringify(args ?? {});
    const key = callId ? `${toolName}:${callId}` : `${toolName}:${serialized}`;
    const prev = this.seen.get(key);
    if (prev !== undefined && now - prev <= this.ttlMs) {
      return true;
    }
    this.seen.set(key, now);
    return false;
  }

  clear(): void {
    this.seen.clear();
  }
}
