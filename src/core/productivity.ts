import type { LyricLine, TimerItem } from './types';

export interface AppearancePresetConfig {
  name:
    | 'Cyan'
    | 'Ice White'
    | 'Crimson'
    | 'Violet'
    | 'Emerald'
    | 'Amber'
    | 'Sakura'
    | 'Midnight'
    | 'Soft Blue';
  accentColor: string;
  faceColor: string;
}

export const APPEARANCE_PRESETS: AppearancePresetConfig[] = [
  { name: 'Cyan', accentColor: '#00E5FF', faceColor: '#EDF5FF' },
  { name: 'Ice White', accentColor: '#DCE8F7', faceColor: '#FFFFFF' },
  { name: 'Crimson', accentColor: '#FF4567', faceColor: '#FFEFF3' },
  { name: 'Violet', accentColor: '#9C6BFF', faceColor: '#F3EEFF' },
  { name: 'Emerald', accentColor: '#39FF88', faceColor: '#EAFFF2' },
  { name: 'Amber', accentColor: '#FFC857', faceColor: '#FFF8E8' },
  { name: 'Sakura', accentColor: '#FF5CA1', faceColor: '#FFF0F6' },
  { name: 'Midnight', accentColor: '#4F6DFF', faceColor: '#E8EEFF' },
  { name: 'Soft Blue', accentColor: '#6EB6FF', faceColor: '#EDF5FF' },
];

export const WORLD_CLOCK_CITIES = [
  { id: 'utc', label: 'UTC', timeZone: 'UTC' },
  { id: 'nyc', label: 'New York', timeZone: 'America/New_York' },
  { id: 'lon', label: 'London', timeZone: 'Europe/London' },
  { id: 'del', label: 'New Delhi', timeZone: 'Asia/Kolkata' },
  { id: 'tyo', label: 'Tokyo', timeZone: 'Asia/Tokyo' },
];

export function formatWorldTime(timeZone: string, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }).format(date);
  } catch {
    return '--:--';
  }
}

/**
 * Timestamp-based remaining seconds prevents countdown drift when tabs sleep or throttle.
 */
export function computeRemainingSeconds(timer: TimerItem, now = Date.now()): number {
  if (!timer.running || !timer.endAt) {
    return Math.max(0, timer.remainingSec);
  }
  return Math.max(0, Math.ceil((timer.endAt - now) / 1000));
}

/**
 * Splits spoken/typed multi-item lists cleanly ("milk, eggs, and coffee" -> ['milk', 'eggs', 'coffee']).
 */
export function parseMultiListItems(raw: string): string[] {
  const cleaned = raw
    .replace(/^(add|put|create)\s+/i, '')
    .replace(/\s+(to|on)\s+(my\s+)?(to-?do|shopping|grocery)(\s+list)?$/i, '')
    .trim();

  if (!cleaned) return [];
  return cleaned
    .split(/\s*,\s*(?:and\s+)?|\s+and\s+/i)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Privacy guard: avoids persisting likely passwords, bearer tokens, or private keys in clipboard history.
 */
export function looksSensitiveCredential(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (/^(sk-[A-Za-z0-9]{16,}|AIza[0-9A-Za-z_-]{20,}|ghp_[A-Za-z0-9]{20,}|Bearer\s+\S{16,})/i.test(trimmed)) {
    return true;
  }
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(trimmed)) {
    return true;
  }
  if (/(password|passcode|pin|secret_key|api_key)\s*[:=]\s*\S+/i.test(trimmed)) {
    return true;
  }
  return false;
}

/**
 * Returns the index of the active line in genuine timestamp-aligned lyrics.
 */
export function getActiveLyricIndex(lyrics: LyricLine[], elapsedSec: number): number {
  if (!lyrics || lyrics.length === 0) return -1;
  let active = 0;
  for (let i = 0; i < lyrics.length; i += 1) {
    if (elapsedSec >= lyrics[i].timeSec) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}
