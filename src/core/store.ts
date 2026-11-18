import { useSyncExternalStore } from 'react';
import type {
  AppearancePresetName,
  AppShortcutItem,
  ChatMessage,
  ClipboardItem,
  EmotionNuance,
  EmotionState,
  InteractionMode,
  IslandMode,
  IslandPosition,
  IslandWidgetTab,
  LiveHudState,
  LiveLatencyMetrics,
  LiveSessionPhase,
  LlmInferenceMetric,
  MemoryFact,
  MenuCategory,
  NotificationBanner,
  PendingConfirmation,
  QuickNoteItem,
  ReminderItem,
  ResponseDepth,
  ShelfFileItem,
  StudioTab,
  StudioWindowState,
  SystemStatusSnapshot,
  TeleprompterState,
  TimerItem,
  TodoItem,
  XeroSettings,
} from './types';
import { BUILTIN_TRACKS, SITUATION_VOICE_LINES, audioService } from './audioEngine';
import {
  EMOTION_SPECS,
  getTimeOfDayGreeting,
  pickSpontaneousBehavior,
} from './emotions';
import {
  APPEARANCE_PRESETS,
  computeRemainingSeconds,
  looksSensitiveCredential,
} from './productivity';
import {
  type ImageTransformKind,
  summarizeShelfDocument,
  transformShelfImageCopy,
} from './shelfTools';
import { renderWorkspaceSnapshot } from './screenshotCapture';
import {
  buildCaptureNoteFromMessages,
  formatNotesAsMarkdown,
  summarizeSessionCatchUp,
} from './assistantPrompt';
import { ToolWriteDeduplicator } from './toolValidation';
import type { OfflineAction } from './offlineEngine';

const SETTINGS_STORAGE_KEY = 'xero.settings.v1';
const MEMORY_STORAGE_KEY = 'xero.memory.v1';
const CLIPBOARD_STORAGE_KEY = 'xero.clipboard.v1';
const FILES_STORAGE_KEY = 'xero.files.v1';
const STUDIO_STORAGE_KEY = 'xero.studio.v1';
const POSITION_STORAGE_KEY = 'xero.position.v2';
const PRODUCTIVITY_STORAGE_KEY = 'xero.productivity.v1';
const SHORTCUTS_STORAGE_KEY = 'xero.shortcuts.v1';
const HISTORY_STORAGE_KEY = 'xero.history.v1';
const BROADCAST_CHANNEL = 'xero-sync-v1';

export const DEFAULT_SETTINGS: XeroSettings = {
  general: {
    launchMinimized: false,
    gamingMode: false,
    alwaysOnTopSim: true,
    autoCollapseMs: 0,
    autoHideDelayMs: 0,
    hotkeyLabel: 'R-Ctrl (Cmd) · R-Alt (Dictate) · F9 (AI)',
    soundEffects: true,
    spontaneousBehavior: true,
    autoExpandOnTrackChange: false,
  },
  appearance: {
    presetName: 'Cyan',
    accentColor: '#00E5FF',
    faceColor: '#EDF5FF',
    notchShape: 'bezel',
    islandScale: 1,
    islandOpacity: 0.98,
    glowIntensity: 0.72,
    borderIllumination: 0.45,
    showMediaProgress: true,
    reducedMotion: false,
  },
  ai: {
    providerMode: 'auto',
    geminiModel: 'gemini-4-hydrogen',
    liveModel: 'gemini-3.8-live',
    liveVoiceName: 'Kore',
    localFormat: 'ollama',
    localEndpoint: 'http://127.0.0.1:11434',
    localModel: 'llama3.2',
    systemPrompt: '',
    memoryEnabled: true,
  },
  voice: {
    responseMode: 'chimes',
    ttsEnabled: false,
    ttsRate: 1.0,
    ttsPitch: 1.05,
    wakeWordEnabled: false,
    wakeWord: 'Hey Xero',
    dictationLang: 'en-US',
    micDeviceId: 'default',
    noiseSuppression: true,
    silenceTimeoutMs: 4500,
    followUpWindowMs: 6500,
    dictationStyle: 'clean',
    customVocabulary: ['XERO', 'TypeScript', 'Ollama'],
  },
  privacy: {
    captureClipboardHistory: true,
    persistChatHistory: false,
    retainAudioRecordings: false,
  },
  personalization: {
    assistantName: 'XERO',
    userName: '',
    personalityTone: 'Friendly Cyberpunk',
  },
};

const DEFAULT_SHORTCUTS: AppShortcutItem[] = [
  { id: 'sc-github', label: 'GitHub', url: 'https://github.com', alias: 'github', category: 'web', pinned: true },
  { id: 'sc-mdn', label: 'MDN Docs', url: 'https://developer.mozilla.org', alias: 'docs', category: 'web', pinned: true },
  { id: 'sc-ollama', label: 'Ollama', url: 'https://ollama.com/library', alias: 'ollama', category: 'app', pinned: true },
  { id: 'sc-notes', label: 'XERO Teleprompter', url: '#teleprompter', alias: 'teleprompter', category: 'project', pinned: true },
];

const DEFAULT_TELEPROMPTER: TeleprompterState = {
  isOpen: false,
  script:
    'Welcome to PROJECT XERO.\nSpeak naturally in Command, Dictate, or Write mode.\nClick any line to jump directly here, or toggle Play for steady auto-scroll.\nYour floating companion stays independent above the workspace.',
  fontSize: 18,
  scrollSpeed: 26,
  playing: false,
  speechFollow: false,
  activeLine: 0,
  x: 1040,
  y: 80,
  width: 376,
  height: 280,
};

export interface XeroAppState {
  settings: XeroSettings;
  emotion: EmotionState;
  emotionNuance: EmotionNuance;
  islandMode: IslandMode;
  islandExpanded: boolean;
  interactionMode: InteractionMode;
  activeWidgetTab: IslandWidgetTab;
  islandPosition: IslandPosition;
  menuOpen: boolean;
  activeMenuCategory: MenuCategory;
  isListening: boolean;
  isThinking: boolean;
  isSpeaking: boolean;
  streamingText: string;
  isOnline: boolean;
  geminiConfigured: boolean;
  liveSupported: boolean;
  responseDepth: ResponseDepth;
  pendingConfirmation: PendingConfirmation | null;
  liveSession: {
    phase: LiveSessionPhase;
    muted: boolean;
    statusText: string | null;
    userTranscriptDraft: string;
    assistantTranscriptDraft: string;
    metrics: LiveLatencyMetrics;
  };
  lastCapturedMarkdown: {
    title: string;
    markdown: string;
    timestamp: number;
  } | null;
  lastError: string | null;
  petCount: number;
  pokeTick: number;
  rapidPokeStreak: number;
  reactionWhisper: string | null;
  messages: ChatMessage[];
  timers: TimerItem[];
  reminders: ReminderItem[];
  todos: TodoItem[];
  notes: QuickNoteItem[];
  waterMl: number;
  stopwatch: {
    running: boolean;
    elapsedMs: number;
    startedAt: number | null;
    laps: number[];
  };
  shortcuts: AppShortcutItem[];
  teleprompter: TeleprompterState;
  clipboard: ClipboardItem[];
  files: ShelfFileItem[];
  memories: MemoryFact[];
  notification: NotificationBanner | null;
  music: {
    playing: boolean;
    trackIndex: number;
    elapsedSec: number;
  };
  lyricsPinned: boolean;
  volume: number;
  muted: boolean;
  liveHud: LiveHudState | null;
  screenshotFlashTick: number;
  screenAssistActive: boolean;
  systemStatus: SystemStatusSnapshot;
  studio: StudioWindowState;
  llmMetrics: LlmInferenceMetric[];
}

function safeReadJson<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function safeWriteJson(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

function safeRemoveKey(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage errors
  }
}

function mergeSettings(saved: Partial<XeroSettings> | null): XeroSettings {
  if (!saved) return DEFAULT_SETTINGS;
  return {
    general: { ...DEFAULT_SETTINGS.general, ...(saved.general ?? {}) },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...(saved.appearance ?? {}) },
    ai: { ...DEFAULT_SETTINGS.ai, ...(saved.ai ?? {}) },
    voice: {
      ...DEFAULT_SETTINGS.voice,
      ...(saved.voice ?? {}),
      customVocabulary: Array.isArray(saved.voice?.customVocabulary)
        ? saved.voice.customVocabulary
        : DEFAULT_SETTINGS.voice.customVocabulary,
    },
    privacy: {
      ...DEFAULT_SETTINGS.privacy,
      ...(saved.privacy ?? {}),
      retainAudioRecordings: false,
    },
    personalization: { ...DEFAULT_SETTINGS.personalization, ...(saved.personalization ?? {}) },
  };
}

const DEFAULT_STUDIO: StudioWindowState = {
  isOpen: false,
  activeTab: 'general',
  x: typeof window !== 'undefined' ? Math.max(24, Math.round((window.innerWidth - 940) / 2)) : 250,
  y: 96,
  width: 940,
  height: 610,
  minimized: false,
  focusTick: 0,
};

const INITIAL_CLIPBOARD: ClipboardItem[] = [
  {
    id: 'clip-seed-1',
    text: 'http://127.0.0.1:11434',
    copiedAt: Date.now() - 180_000,
    pinned: true,
  },
  {
    id: 'clip-seed-2',
    text: 'ollama run llama3.2',
    copiedAt: Date.now() - 60_000,
  },
];

const INITIAL_MEMORIES: MemoryFact[] = [
  {
    id: 'mem-seed-1',
    fact: 'XERO runs locally offline, with Local LLM (Ollama/LM Studio), or online with Gemini.',
    createdAt: Date.now() - 300_000,
  },
];

interface SavedProductivity {
  todos?: TodoItem[];
  notes?: QuickNoteItem[];
  waterMl?: number;
}

class XeroSingletonStore {
  private state: XeroAppState;
  private listeners = new Set<() => void>();
  private channel: BroadcastChannel | null = null;
  private tickInterval: number | null = null;
  private livingPetInterval: number | null = null;
  private notifTimeout: number | null = null;
  private whisperTimeout: number | null = null;
  private hudTimeout: number | null = null;
  private wakeLockSentinel: { release: () => Promise<void> } | null = null;
  private lastPokeAt = 0;
  private lastActivityAt = Date.now();
  private sleptFromInactivity = false;
  private hiddenFromInactivity = false;
  private writeDeduplicator = new ToolWriteDeduplicator();

  constructor() {
    const savedSettings = mergeSettings(safeReadJson<Partial<XeroSettings> | null>(SETTINGS_STORAGE_KEY, null));
    const savedMemories = safeReadJson<MemoryFact[]>(MEMORY_STORAGE_KEY, INITIAL_MEMORIES);
    const savedClipboard = safeReadJson<ClipboardItem[]>(CLIPBOARD_STORAGE_KEY, INITIAL_CLIPBOARD);
    const savedFiles = safeReadJson<ShelfFileItem[]>(FILES_STORAGE_KEY, []);
    const savedStudio = safeReadJson<Partial<StudioWindowState> | null>(STUDIO_STORAGE_KEY, null);
    const rawPosition = safeReadJson<IslandPosition>(POSITION_STORAGE_KEY, { docked: true, x: 0, y: 0 });
    const validPosition =
      !rawPosition ||
      typeof rawPosition.docked !== 'boolean' ||
      (!rawPosition.docked &&
        typeof window !== 'undefined' &&
        (rawPosition.x < 60 || rawPosition.y < 0 || rawPosition.x > window.innerWidth - 60 || rawPosition.y > window.innerHeight - 60))
        ? { docked: true, x: 0, y: 0 }
        : rawPosition;
    const savedPosition = validPosition;
    const savedProductivity = safeReadJson<SavedProductivity>(PRODUCTIVITY_STORAGE_KEY, {});
    const savedShortcuts = safeReadJson<AppShortcutItem[]>(SHORTCUTS_STORAGE_KEY, DEFAULT_SHORTCUTS);
    const savedHistory = savedSettings.privacy.persistChatHistory
      ? safeReadJson<ChatMessage[]>(HISTORY_STORAGE_KEY, [])
      : [];

    const startupGreet = getTimeOfDayGreeting(new Date().getHours(), savedSettings.personalization.userName);

    this.state = {
      settings: savedSettings,
      emotion: 'neutral',
      emotionNuance: 'none',
      islandMode: savedSettings.general.launchMinimized ? 'minimized' : 'idle',
      islandExpanded: false,
      interactionMode: 'command',
      activeWidgetTab: 'chat',
      islandPosition: savedPosition,
      menuOpen: false,
      activeMenuCategory: 'widgets',
      isListening: false,
      isThinking: false,
      isSpeaking: false,
      streamingText: '',
      isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
      geminiConfigured: false,
      liveSupported: false,
      responseDepth: 'balanced',
      pendingConfirmation: null,
      liveSession: {
        phase: 'idle',
        muted: false,
        statusText: null,
        userTranscriptDraft: '',
        assistantTranscriptDraft: '',
        metrics: {
          micActivationMs: null,
          firstResponseMs: null,
          interruptToSilenceMs: null,
          reconnectCount: 0,
        },
      },
      lastCapturedMarkdown: null,
      lastError: null,
      petCount: 0,
      pokeTick: 0,
      rapidPokeStreak: 0,
      reactionWhisper: null,
      messages:
        savedHistory.length > 0
          ? savedHistory
          : [
              {
                id: 'msg-welcome',
                role: 'assistant',
                text: startupGreet.greeting,
                timestamp: Date.now(),
                provider: 'offline',
                emotion: startupGreet.emotion,
              },
            ],
      timers: [],
      reminders: [],
      todos: savedProductivity.todos ?? [],
      notes: savedProductivity.notes ?? [],
      waterMl: savedProductivity.waterMl ?? 500,
      stopwatch: { running: false, elapsedMs: 0, startedAt: null, laps: [] },
      shortcuts: savedShortcuts.length > 0 ? savedShortcuts.slice(0, 8) : DEFAULT_SHORTCUTS,
      teleprompter: DEFAULT_TELEPROMPTER,
      clipboard: savedClipboard,
      files: savedFiles,
      memories: savedMemories,
      notification: null,
      music: {
        playing: false,
        trackIndex: 0,
        elapsedSec: 0,
      },
      lyricsPinned: false,
      volume: 72,
      muted: false,
      liveHud: null,
      screenshotFlashTick: 0,
      screenAssistActive: false,
      systemStatus: {
        brightness: 100,
        nightLight: false,
        batteryPct: null,
        charging: null,
        capsLock: false,
        keyboardLang: typeof navigator !== 'undefined' ? navigator.language : 'en-US',
        audioOutputCount: null,
        wakeLockActive: false,
      },
      studio: {
        ...DEFAULT_STUDIO,
        ...(savedStudio ?? {}),
        isOpen: false,
      },
      llmMetrics: [],
    };

    if (typeof window !== 'undefined') {
      if ('BroadcastChannel' in window) {
        this.channel = new BroadcastChannel(BROADCAST_CHANNEL);
        this.channel.onmessage = (event) => {
          const msg = event.data as {
            type?: string;
            settings?: XeroSettings;
            studio?: StudioWindowState;
            emotion?: EmotionState;
            nuance?: EmotionNuance;
          };
          if (msg?.type === 'SYNC_SETTINGS' && msg.settings) {
            this.state = { ...this.state, settings: msg.settings };
            this.emit();
          } else if (msg?.type === 'SYNC_STUDIO' && msg.studio) {
            this.state = { ...this.state, studio: msg.studio };
            this.emit();
          } else if (msg?.type === 'SYNC_EMOTION' && msg.emotion) {
            this.state = {
              ...this.state,
              emotion: msg.emotion,
              emotionNuance: msg.nuance ?? this.state.emotionNuance,
            };
            this.emit();
          }
        };
      }

      window.addEventListener('online', () => {
        this.state = { ...this.state, isOnline: true };
        this.emit();
      });
      window.addEventListener('offline', () => {
        this.state = { ...this.state, isOnline: false };
        this.emit();
      });
      window.addEventListener('storage', (e) => {
        if (e.key === SETTINGS_STORAGE_KEY && e.newValue) {
          try {
            const next = mergeSettings(JSON.parse(e.newValue));
            this.state = { ...this.state, settings: next };
            this.emit();
          } catch {
            // Ignore malformed storage
          }
        }
      });

      // Track keyboard CapsLock modifier & wake up gracefully from inactivity sleep
      window.addEventListener('keydown', (e) => {
        this.recordUserActivity();
        if (typeof e.getModifierState === 'function') {
          const caps = e.getModifierState('CapsLock');
          if (caps !== this.state.systemStatus.capsLock) {
            this.state = {
              ...this.state,
              systemStatus: { ...this.state.systemStatus, capsLock: caps },
            };
            this.emit();
          }
        }
      });

      window.addEventListener('pointerdown', () => this.recordUserActivity(), { passive: true });

      // Gentle ambient desktop-pet lifecycle loop (every 12s)
      this.livingPetInterval = window.setInterval(() => this.handleLivingPetTick(), 12000);
      void this.probeSystemEnvironment();
    }
  }

  getSnapshot = (): XeroAppState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private emit(): void {
    for (const l of this.listeners) {
      l();
    }
  }

  recordUserActivity(): void {
    this.lastActivityAt = Date.now();
    if (this.hiddenFromInactivity && this.state.islandMode === 'minimized') {
      this.hiddenFromInactivity = false;
      this.state = {
        ...this.state,
        islandMode: 'idle',
        emotion: 'happy',
        emotionNuance: 'waking',
      };
      this.emit();
      return;
    }
    if (this.sleptFromInactivity && this.state.settings.general.spontaneousBehavior) {
      this.sleptFromInactivity = false;
      const wakeLine = SITUATION_VOICE_LINES.wake[0];
      this.state = {
        ...this.state,
        emotion: 'happy',
        emotionNuance: 'waking',
      };
      this.showWhisper(wakeLine);
      this.emit();
      window.setTimeout(() => {
        if (this.state.emotionNuance === 'waking') {
          this.state = { ...this.state, emotionNuance: 'gentle-breathing' };
          this.emit();
        }
      }, 1800);
    }
  }

  wakeFromVoice(whisper = 'Listening~'): void {
    this.lastActivityAt = Date.now();
    this.hiddenFromInactivity = false;
    this.sleptFromInactivity = false;
    this.state = {
      ...this.state,
      islandMode: this.state.islandExpanded ? this.state.islandMode : 'idle',
      emotion: 'curious',
      emotionNuance: 'waking',
    };
    this.showWhisper(whisper);
    this.emit();
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        if (this.state.emotionNuance === 'waking') {
          this.state = { ...this.state, emotionNuance: 'none' };
          this.emit();
        }
      }, 1500);
    }
  }

  private handleLivingPetTick(): void {
    if (
      this.state.isListening ||
      this.state.isThinking ||
      this.state.isSpeaking ||
      this.state.music.playing ||
      this.state.islandExpanded ||
      this.state.menuOpen
    ) {
      return;
    }

    const idleMs = Date.now() - this.lastActivityAt;
    const autoHideDelayMs = this.state.settings.general.autoHideDelayMs ?? 0;
    if (autoHideDelayMs > 0 && idleMs >= autoHideDelayMs && this.state.islandMode !== 'minimized') {
      this.hiddenFromInactivity = true;
      this.setIslandMode('minimized');
      return;
    }

    if (!this.state.settings.general.spontaneousBehavior) return;

    if (idleMs > 60_000) {
      if (this.state.emotion !== 'sleepy') {
        this.sleptFromInactivity = true;
        this.state = {
          ...this.state,
          emotion: 'sleepy',
          emotionNuance: 'relaxed',
        };
        this.emit();
      }
      return;
    }

    if (idleMs > 18_000 && Math.random() < 0.35) {
      const pick = pickSpontaneousBehavior(Math.random());
      this.state = {
        ...this.state,
        emotion: pick.emotion,
        emotionNuance: pick.nuance,
      };
      this.emit();
    }
  }

  async probeSystemEnvironment(): Promise<void> {
    if (typeof navigator === 'undefined') return;
    const nextStatus = { ...this.state.systemStatus, keyboardLang: navigator.language || 'en-US' };
    const nav = navigator as unknown as {
      getBattery?: () => Promise<{ level: number; charging: boolean }>;
      mediaDevices?: { enumerateDevices?: () => Promise<MediaDeviceInfo[]> };
    };

    try {
      if (nav.getBattery) {
        const bat = await nav.getBattery();
        nextStatus.batteryPct = Math.round(bat.level * 100);
        nextStatus.charging = bat.charging;
      }
    } catch {
      // Battery API unsupported
    }

    try {
      if (nav.mediaDevices?.enumerateDevices) {
        const devices = await nav.mediaDevices.enumerateDevices();
        nextStatus.audioOutputCount = devices.filter((d) => d.kind === 'audiooutput').length;
      }
    } catch {
      // Device enumeration unavailable
    }

    this.state = { ...this.state, systemStatus: nextStatus };
    this.emit();
  }

  private persistProductivity(): void {
    safeWriteJson(PRODUCTIVITY_STORAGE_KEY, {
      todos: this.state.todos,
      notes: this.state.notes,
      waterMl: this.state.waterMl,
    });
  }

  private ensureTickLoop(): void {
    const needsTick =
      this.state.timers.some((t) => t.running) ||
      this.state.reminders.some((r) => !r.completed) ||
      this.state.music.playing ||
      this.state.stopwatch.running;

    if (needsTick && this.tickInterval === null && typeof window !== 'undefined') {
      const intervalMs = this.state.stopwatch.running ? 200 : 1000;
      this.tickInterval = window.setInterval(() => this.handleTick(), intervalMs);
    } else if (!needsTick && this.tickInterval !== null && typeof window !== 'undefined') {
      window.clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  private handleTick(): void {
    const now = Date.now();
    let changed = false;

    const nextTimers = this.state.timers.map((t) => {
      if (!t.running) return t;
      changed = true;
      const remaining = computeRemainingSeconds(t, now);
      if (remaining === 0) {
        audioService.playAlertChime(this.state.settings.general.soundEffects);
        this.pushNotification('Timer Complete', `"${t.label}" finished.`, 'success');
        this.triggerTaskResultHud('Timer Finished', t.label);
        this.setEmotion('excited', false, 'satisfied');
        return { ...t, remainingSec: 0, endAt: null, running: false };
      }
      return { ...t, remainingSec: remaining };
    });

    const nextReminders = this.state.reminders.map((r) => {
      if (!r.completed && now >= r.triggerAt) {
        changed = true;
        audioService.playAlertChime(this.state.settings.general.soundEffects);
        this.pushNotification('Reminder', r.text, 'info');
        this.triggerTaskResultHud('Reminder', r.text);
        this.setEmotion('surprised', false, 'anticipating');
        return { ...r, completed: true };
      }
      return r;
    });

    let nextMusic = this.state.music;
    if (this.state.music.playing) {
      changed = true;
      const track = BUILTIN_TRACKS[this.state.music.trackIndex % BUILTIN_TRACKS.length];
      const nextElapsed = this.state.music.elapsedSec + (this.state.stopwatch.running ? 0.2 : 1);
      if (nextElapsed >= track.durationSec) {
        const nextIndex = (this.state.music.trackIndex + 1) % BUILTIN_TRACKS.length;
        audioService.startAmbientTrack(BUILTIN_TRACKS[nextIndex]);
        nextMusic = { playing: true, trackIndex: nextIndex, elapsedSec: 0 };
        if (this.state.settings.general.autoExpandOnTrackChange) {
          this.state = { ...this.state, islandExpanded: true, activeWidgetTab: 'music', islandMode: 'music' };
        }
      } else {
        nextMusic = { ...this.state.music, elapsedSec: nextElapsed };
      }
    }

    let nextStopwatch = this.state.stopwatch;
    if (this.state.stopwatch.running && this.state.stopwatch.startedAt !== null) {
      changed = true;
      nextStopwatch = {
        ...this.state.stopwatch,
        elapsedMs: now - this.state.stopwatch.startedAt,
      };
    }

    if (changed) {
      this.state = {
        ...this.state,
        timers: nextTimers,
        reminders: nextReminders,
        music: nextMusic,
        stopwatch: nextStopwatch,
      };
      this.emit();
      this.ensureTickLoop();
    }
  }

  setServerCapabilities(geminiConfigured: boolean, liveSupported = geminiConfigured): void {
    this.state = { ...this.state, geminiConfigured, liveSupported };
    this.emit();
  }

  setResponseDepth(depth: ResponseDepth): void {
    this.state = { ...this.state, responseDepth: depth };
    this.showWhisper(`Depth: ${depth}`);
    this.emit();
  }

  setLiveSessionState(patch: Partial<XeroAppState['liveSession']>): void {
    this.state = {
      ...this.state,
      liveSession: { ...this.state.liveSession, ...patch },
    };
    this.emit();
  }

  requestConfirmation(pending: Omit<PendingConfirmation, 'id' | 'createdAt'>): void {
    this.state = {
      ...this.state,
      pendingConfirmation: {
        ...pending,
        id: `confirm-${Date.now()}`,
        createdAt: Date.now(),
      },
    };
    this.emit();
  }

  resolvePendingConfirmation(approve: boolean): string {
    const pending = this.state.pendingConfirmation;
    if (!pending) return 'No pending confirmation.';
    this.state = { ...this.state, pendingConfirmation: null };
    if (!approve) {
      this.emit();
      return 'Cancelled — no changes made.';
    }
    this.executeOfflineAction({
      type: pending.actionType as OfflineAction['type'],
      payload: pending.payload,
    });
    if (pending.payload?.alsoDepth) {
      this.setResponseDepth(pending.payload.alsoDepth as ResponseDepth);
    }
    this.emit();
    return pending.kind === 'preference'
      ? `Saved preference locally: "${String(pending.payload?.fact || pending.summary)}".`
      : 'Confirmed and executed.';
  }

  setEmotion(emotion: EmotionState, broadcast = false, nuance: EmotionNuance = 'none'): void {
    this.state = { ...this.state, emotion, emotionNuance: nuance };
    this.emit();
    if (broadcast) {
      this.channel?.postMessage({ type: 'SYNC_EMOTION', emotion, nuance });
    }
  }

  setNuance(nuance: EmotionNuance): void {
    this.state = { ...this.state, emotionNuance: nuance };
    this.emit();
  }

  petXero(): void {
    this.recordUserActivity();
    const now = Date.now();
    const isRapid = now - this.lastPokeAt < 1400;
    const nextStreak = isRapid ? this.state.rapidPokeStreak + 1 : 1;
    this.lastPokeAt = now;

    const reactions: Array<{ emotion: EmotionState; nuance: EmotionNuance; line: string }> = [
      { emotion: 'affectionate', nuance: 'satisfied', line: 'Hehe, that tickles!' },
      { emotion: 'happy', nuance: 'relaxed', line: 'Happy to see you!' },
      { emotion: 'playful', nuance: 'embarrassed', line: 'Boop received!' },
      { emotion: 'excited', nuance: 'anticipating', line: 'Ready for anything!' },
    ];
    const streakPick =
      nextStreak >= 5
        ? { emotion: 'playful' as EmotionState, nuance: 'embarrassed' as EmotionNuance, line: 'Wahh too many boops! >.<' }
        : nextStreak === 3
          ? { emotion: 'affectionate' as EmotionState, nuance: 'gentle-breathing' as EmotionNuance, line: 'Purrr~ ♥' }
          : reactions[this.state.petCount % reactions.length];

    audioService.playPurrChirp(this.state.settings.general.soundEffects);
    this.showWhisper(streakPick.line);
    this.state = {
      ...this.state,
      emotion: streakPick.emotion,
      emotionNuance: streakPick.nuance,
      petCount: this.state.petCount + 1,
      pokeTick: this.state.pokeTick + 1,
      rapidPokeStreak: nextStreak,
    };
    this.emit();
  }

  cheerXero(): void {
    this.recordUserActivity();
    audioService.playSnackChime(this.state.settings.general.soundEffects);
    this.showWhisper('Energy boosted!');
    this.state = {
      ...this.state,
      emotion: 'excited',
      emotionNuance: 'satisfied',
      pokeTick: this.state.pokeTick + 1,
    };
    this.emit();
  }

  private showWhisper(text: string): void {
    if (this.whisperTimeout !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.whisperTimeout);
    }
    this.state = { ...this.state, reactionWhisper: text };
    if (typeof window !== 'undefined') {
      this.whisperTimeout = window.setTimeout(() => {
        this.state = { ...this.state, reactionWhisper: null };
        this.emit();
      }, 2400);
    }
  }

  setIslandExpanded(expanded: boolean, tab?: IslandWidgetTab): void {
    this.recordUserActivity();
    const wasMinimized = this.state.islandMode === 'minimized';
    const clearStaleListening =
      expanded &&
      tab &&
      tab !== 'chat' &&
      !this.state.isListening &&
      this.state.emotion === 'listening';
    const nextEmotion = clearStaleListening
      ? 'neutral'
      : wasMinimized || this.state.emotion === 'sleepy'
        ? 'happy'
        : this.state.emotion;
    const nextNuance = clearStaleListening
      ? 'none'
      : wasMinimized
        ? 'waking'
        : this.state.emotionNuance;
    this.state = {
      ...this.state,
      islandExpanded: expanded,
      menuOpen: expanded ? false : this.state.menuOpen,
      islandMode: expanded ? (tab && tab !== 'chat' ? 'widgets' : 'chat') : 'idle',
      activeWidgetTab: tab ?? this.state.activeWidgetTab,
      emotion: nextEmotion,
      emotionNuance: nextNuance,
    };
    this.emit();
  }

  setInteractionMode(mode: InteractionMode): void {
    this.recordUserActivity();
    const nuance: EmotionNuance =
      mode === 'dictate' ? 'anticipating' : mode === 'write' ? 'concentrating' : 'none';
    this.state = {
      ...this.state,
      interactionMode: mode,
      islandExpanded: true,
      menuOpen: false,
      activeWidgetTab: 'chat',
      islandMode: mode === 'dictate' ? 'dictating' : 'chat',
      emotion: mode === 'dictate' ? 'listening' : mode === 'write' ? 'focused' : 'neutral',
      emotionNuance: nuance,
    };
    this.emit();
  }

  setMenuOpen(open: boolean, category?: MenuCategory): void {
    this.recordUserActivity();
    this.state = {
      ...this.state,
      menuOpen: open,
      activeMenuCategory: category ?? this.state.activeMenuCategory,
      islandExpanded: open ? false : this.state.islandExpanded,
      islandMode: open ? 'menu' : this.state.islandExpanded ? 'chat' : 'idle',
    };
    this.emit();
  }

  setMenuCategory(category: MenuCategory): void {
    if (category === 'studio') {
      this.setMenuOpen(false);
      this.openStudio();
      return;
    }
    this.state = {
      ...this.state,
      menuOpen: true,
      activeMenuCategory: category,
      islandMode: 'menu',
    };
    this.emit();
  }

  setIslandPosition(pos: IslandPosition): void {
    this.state = { ...this.state, islandPosition: pos };
    safeWriteJson(POSITION_STORAGE_KEY, pos);
    this.emit();
  }

  resetIslandPosition(): void {
    const docked: IslandPosition = { docked: true, x: 0, y: 0 };
    this.state = { ...this.state, islandPosition: docked };
    safeWriteJson(POSITION_STORAGE_KEY, docked);
    audioService.playPopChime(this.state.settings.general.soundEffects);
    this.showWhisper('Re-docked to notch!');
    this.emit();
  }

  setIslandMode(mode: IslandMode): void {
    if (mode === 'minimized') {
      audioService.playPopChime(this.state.settings.general.soundEffects);
      if (this.whisperTimeout !== null && typeof window !== 'undefined') {
        window.clearTimeout(this.whisperTimeout);
        this.whisperTimeout = null;
      }
    }
    this.state = {
      ...this.state,
      islandMode: mode,
      menuOpen: mode === 'menu',
      reactionWhisper: mode === 'minimized' ? null : this.state.reactionWhisper,
      emotion: mode === 'minimized' ? 'sleepy' : this.state.emotion === 'sleepy' ? 'neutral' : this.state.emotion,
      islandExpanded: mode !== 'idle' && mode !== 'minimized' && mode !== 'hovered' && mode !== 'menu',
    };
    this.emit();
  }

  setActiveWidgetTab(tab: IslandWidgetTab): void {
    const clearStaleListening = !this.state.isListening && this.state.emotion === 'listening';
    this.state = {
      ...this.state,
      activeWidgetTab: tab,
      islandExpanded: true,
      menuOpen: false,
      islandMode: tab === 'chat' ? 'chat' : 'widgets',
      emotion: clearStaleListening ? 'neutral' : this.state.emotion,
      emotionNuance: clearStaleListening ? 'none' : this.state.emotionNuance,
    };
    this.emit();
  }

  setListening(listening: boolean): void {
    this.recordUserActivity();
    audioService.setDucked(listening);
    this.state = {
      ...this.state,
      isListening: listening,
      emotion: listening ? 'listening' : this.state.emotion === 'listening' ? 'neutral' : this.state.emotion,
      emotionNuance: listening ? 'anticipating' : 'none',
      islandMode: listening ? 'listening' : this.state.islandExpanded ? 'chat' : 'idle',
    };
    this.emit();
  }

  setThinking(thinking: boolean): void {
    this.state = {
      ...this.state,
      isThinking: thinking,
      streamingText: thinking ? '' : this.state.streamingText,
      emotion: thinking ? 'thinking' : this.state.emotion,
      emotionNuance: thinking ? 'concentrating' : 'none',
    };
    this.emit();
  }

  setStreamingText(text: string): void {
    this.state = {
      ...this.state,
      streamingText: text,
      isSpeaking: Boolean(text),
      emotion: text ? 'speaking' : this.state.emotion,
    };
    this.emit();
  }

  setSpeaking(speaking: boolean): void {
    this.state = {
      ...this.state,
      isSpeaking: speaking,
    };
    this.emit();
  }

  addMessage(msg: Omit<ChatMessage, 'id' | 'timestamp'>): void {
    const entry: ChatMessage = {
      ...msg,
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: Date.now(),
    };
    const nextMessages = [...this.state.messages.slice(-49), entry];
    this.state = {
      ...this.state,
      messages: nextMessages,
      streamingText: '',
    };
    if (this.state.settings.privacy.persistChatHistory) {
      safeWriteJson(HISTORY_STORAGE_KEY, nextMessages);
    }
    this.emit();
  }

  recordLlmMetric(metric: Omit<LlmInferenceMetric, 'id'>): void {
    const entry: LlmInferenceMetric = {
      ...metric,
      id: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    this.state = {
      ...this.state,
      llmMetrics: [entry, ...this.state.llmMetrics.slice(0, 19)],
    };
    this.emit();
  }

  clearMessages(): void {
    const resetMessages: ChatMessage[] = [
      {
        id: `msg-${Date.now()}`,
        role: 'assistant',
        text: 'Conversation cleared. Ready whenever you are.',
        timestamp: Date.now(),
        provider: 'offline',
        emotion: 'neutral',
      },
    ];
    this.state = {
      ...this.state,
      messages: resetMessages,
      pendingConfirmation: null,
    };
    if (this.state.settings.privacy.persistChatHistory) {
      safeWriteJson(HISTORY_STORAGE_KEY, resetMessages);
    } else {
      safeRemoveKey(HISTORY_STORAGE_KEY);
    }
    this.emit();
  }

  updateSettings(updater: (prev: XeroSettings) => XeroSettings): void {
    const prev = this.state.settings;
    const rawNext = updater(prev);
    const next: XeroSettings = {
      ...rawNext,
      privacy: {
        ...rawNext.privacy,
        retainAudioRecordings: false,
      },
    };
    let nextEmotion = this.state.emotion;
    let nextNuance = this.state.emotionNuance;
    let whisper: string | null = null;

    if (prev.general.gamingMode !== next.general.gamingMode) {
      nextEmotion = next.general.gamingMode ? 'focused' : 'happy';
      nextNuance = next.general.gamingMode ? 'concentrating' : 'relaxed';
      whisper = next.general.gamingMode ? 'Gaming Mode ON' : 'Gaming Mode OFF';
    } else if (prev.general.spontaneousBehavior !== next.general.spontaneousBehavior) {
      nextEmotion = next.general.spontaneousBehavior ? 'playful' : 'focused';
      nextNuance = next.general.spontaneousBehavior ? 'anticipating' : 'none';
      whisper = next.general.spontaneousBehavior ? 'Living pet active~' : 'Calm steady mode';
    } else if (prev.general.soundEffects !== next.general.soundEffects) {
      nextEmotion = next.general.soundEffects ? 'happy' : 'neutral';
      nextNuance = next.general.soundEffects ? 'satisfied' : 'relaxed';
      whisper = next.general.soundEffects ? 'Audio chimes ON' : 'Audio chimes OFF';
    } else if (prev.appearance.reducedMotion !== next.appearance.reducedMotion) {
      nextEmotion = next.appearance.reducedMotion ? 'neutral' : 'happy';
      nextNuance = next.appearance.reducedMotion ? 'relaxed' : 'gentle-breathing';
    } else if (prev.voice.ttsEnabled !== next.voice.ttsEnabled) {
      nextEmotion = next.voice.ttsEnabled ? 'speaking' : 'neutral';
      nextNuance = next.voice.ttsEnabled ? 'anticipating' : 'none';
      whisper = next.voice.ttsEnabled ? 'Voice replies ON' : 'Voice replies OFF';
    } else if (prev.ai.providerMode !== next.ai.providerMode) {
      nextEmotion = 'curious';
      nextNuance = 'concentrating';
      whisper = `AI: ${next.ai.providerMode}`;
    } else if (prev.appearance.notchShape !== next.appearance.notchShape) {
      nextEmotion = 'playful';
      nextNuance = 'satisfied';
    }

    if (prev.privacy.persistChatHistory !== next.privacy.persistChatHistory) {
      if (next.privacy.persistChatHistory) {
        safeWriteJson(HISTORY_STORAGE_KEY, this.state.messages);
      } else {
        safeRemoveKey(HISTORY_STORAGE_KEY);
      }
    }

    this.state = {
      ...this.state,
      settings: next,
      emotion: nextEmotion,
      emotionNuance: nextNuance,
    };
    if (whisper) {
      this.showWhisper(whisper);
    }
    safeWriteJson(SETTINGS_STORAGE_KEY, next);
    this.channel?.postMessage({ type: 'SYNC_SETTINGS', settings: next });
    this.emit();
  }

  applyAppearancePreset(name: AppearancePresetName): void {
    const found = APPEARANCE_PRESETS.find((p) => p.name === name);
    if (!found) {
      this.updateSettings((p) => ({
        ...p,
        appearance: { ...p.appearance, presetName: 'Custom' },
      }));
      return;
    }
    const presetEmotions: Record<string, { emotion: EmotionState; nuance: EmotionNuance }> = {
      Cyan: { emotion: 'happy', nuance: 'satisfied' },
      'Ice White': { emotion: 'focused', nuance: 'relaxed' },
      Crimson: { emotion: 'excited', nuance: 'anticipating' },
      Violet: { emotion: 'curious', nuance: 'anticipating' },
      Emerald: { emotion: 'happy', nuance: 'gentle-breathing' },
      Amber: { emotion: 'playful', nuance: 'satisfied' },
      Sakura: { emotion: 'affectionate', nuance: 'satisfied' },
      Midnight: { emotion: 'focused', nuance: 'relaxed' },
      'Soft Blue': { emotion: 'happy', nuance: 'gentle-breathing' },
    };
    const mood = presetEmotions[found.name] ?? { emotion: 'happy' as EmotionState, nuance: 'satisfied' as EmotionNuance };
    this.updateSettings((p) => ({
      ...p,
      appearance: {
        ...p.appearance,
        presetName: found.name,
        accentColor: found.accentColor,
        faceColor: found.faceColor,
      },
    }));
    this.state = { ...this.state, emotion: mood.emotion, emotionNuance: mood.nuance };
    this.showWhisper(`${found.name} theme~`);
    this.emit();
  }

  resetSettings(): void {
    this.updateSettings(() => DEFAULT_SETTINGS);
    this.state = { ...this.state, emotion: 'neutral', emotionNuance: 'waking' };
    this.pushNotification('Settings Reset', 'Restored default XERO configuration.', 'info');
  }

  // Independent Studio Window Lifecycle (NEVER resets XERO's emotion or unmounts XERO)
  openStudio(tab?: StudioTab): void {
    const nextStudio: StudioWindowState = {
      ...this.state.studio,
      isOpen: true,
      minimized: false,
      activeTab: tab ?? this.state.studio.activeTab,
      focusTick: this.state.studio.focusTick + 1,
    };
    this.state = {
      ...this.state,
      islandExpanded: false,
      menuOpen: false,
      islandMode: this.state.isListening ? 'listening' : 'idle',
      studio: nextStudio,
    };
    safeWriteJson(STUDIO_STORAGE_KEY, nextStudio);
    this.channel?.postMessage({ type: 'SYNC_STUDIO', studio: nextStudio });
    this.emit();
  }

  closeStudio(): void {
    const nextStudio: StudioWindowState = {
      ...this.state.studio,
      isOpen: false,
      minimized: false,
    };
    this.state = { ...this.state, studio: nextStudio };
    safeWriteJson(STUDIO_STORAGE_KEY, nextStudio);
    this.channel?.postMessage({ type: 'SYNC_STUDIO', studio: nextStudio });
    this.emit();
  }

  minimizeStudio(minimized: boolean): void {
    const nextStudio: StudioWindowState = {
      ...this.state.studio,
      minimized,
      focusTick: minimized ? this.state.studio.focusTick : this.state.studio.focusTick + 1,
    };
    this.state = { ...this.state, studio: nextStudio };
    this.emit();
  }

  setStudioTab(tab: StudioTab): void {
    const nextStudio: StudioWindowState = {
      ...this.state.studio,
      activeTab: tab,
    };
    this.state = { ...this.state, studio: nextStudio };
    safeWriteJson(STUDIO_STORAGE_KEY, nextStudio);
    this.emit();
  }

  moveStudio(x: number, y: number): void {
    const nextStudio: StudioWindowState = {
      ...this.state.studio,
      x: Math.max(12, x),
      y: Math.max(88, y),
    };
    this.state = { ...this.state, studio: nextStudio };
    safeWriteJson(STUDIO_STORAGE_KEY, nextStudio);
    this.emit();
  }

  // Timestamp-based Timers & Reminders
  startTimer(durationSec: number, label = 'Focus Timer', kind: TimerItem['kind'] = 'timer'): void {
    const now = Date.now();
    const item: TimerItem = {
      id: `timer-${now}-${Math.random().toString(36).slice(2, 6)}`,
      label,
      durationSec,
      remainingSec: durationSec,
      endAt: now + durationSec * 1000,
      running: true,
      kind,
      createdAt: now,
    };
    this.state = {
      ...this.state,
      timers: [item, ...this.state.timers],
      emotion: 'focused',
      emotionNuance: 'concentrating',
    };
    audioService.playSuccessChime(this.state.settings.general.soundEffects);
    this.emit();
    this.ensureTickLoop();
  }

  toggleTimer(id: string): void {
    const now = Date.now();
    this.state = {
      ...this.state,
      timers: this.state.timers.map((t) => {
        if (t.id !== id) return t;
        if (t.running) {
          const remaining = computeRemainingSeconds(t, now);
          return { ...t, running: false, remainingSec: remaining, endAt: null };
        }
        if (t.remainingSec <= 0) return t;
        return { ...t, running: true, endAt: now + t.remainingSec * 1000 };
      }),
    };
    this.emit();
    this.ensureTickLoop();
  }

  removeTimer(id: string): void {
    this.state = {
      ...this.state,
      timers: this.state.timers.filter((t) => t.id !== id),
    };
    this.emit();
    this.ensureTickLoop();
  }

  clearTimers(): void {
    this.state = { ...this.state, timers: [] };
    this.emit();
    this.ensureTickLoop();
  }

  pauseActiveTimer(): string {
    const running = this.state.timers.find((t) => t.running);
    if (!running) return 'No running timer to pause.';
    const rem = computeRemainingSeconds(running);
    this.toggleTimer(running.id);
    return `Paused "${running.label}" with ${rem >= 60 ? `${Math.floor(rem / 60)}m ${rem % 60}s` : `${rem}s`} left.`;
  }

  resumePausedTimer(): string {
    const paused = this.state.timers.find((t) => !t.running && t.remainingSec > 0);
    if (!paused) return 'No paused timer to resume.';
    this.toggleTimer(paused.id);
    return `Resumed "${paused.label}" (${paused.remainingSec}s remaining).`;
  }

  getTimersRemainingSummary(): string {
    if (this.state.timers.length === 0) return 'No active timers right now.';
    return this.state.timers
      .slice(0, 3)
      .map((t) => {
        const rem = computeRemainingSeconds(t);
        const formatted = rem >= 60 ? `${Math.floor(rem / 60)}m ${rem % 60}s` : `${rem}s`;
        return `${t.label}: ${formatted}${t.running ? '' : ' (paused)'}`;
      })
      .join(' · ');
  }

  addReminder(text: string, delaySec: number): void {
    const item: ReminderItem = {
      id: `rem-${Date.now()}`,
      text,
      triggerAt: Date.now() + delaySec * 1000,
      completed: false,
    };
    this.state = { ...this.state, reminders: [item, ...this.state.reminders] };
    this.emit();
    this.ensureTickLoop();
  }

  toggleReminder(id: string): void {
    this.state = {
      ...this.state,
      reminders: this.state.reminders.map((r) =>
        r.id === id ? { ...r, completed: !r.completed } : r
      ),
    };
    audioService.playPopChime(this.state.settings.general.soundEffects);
    this.emit();
    this.ensureTickLoop();
  }

  removeReminder(id: string): void {
    this.state = {
      ...this.state,
      reminders: this.state.reminders.filter((r) => r.id !== id),
    };
    this.emit();
    this.ensureTickLoop();
  }

  // Stopwatch
  startStopwatch(): void {
    const now = Date.now();
    this.state = {
      ...this.state,
      stopwatch: {
        ...this.state.stopwatch,
        running: true,
        startedAt: now - this.state.stopwatch.elapsedMs,
      },
    };
    this.emit();
    this.ensureTickLoop();
  }

  pauseStopwatch(): void {
    const now = Date.now();
    const elapsed =
      this.state.stopwatch.running && this.state.stopwatch.startedAt !== null
        ? now - this.state.stopwatch.startedAt
        : this.state.stopwatch.elapsedMs;
    this.state = {
      ...this.state,
      stopwatch: { ...this.state.stopwatch, running: false, elapsedMs: elapsed, startedAt: null },
    };
    this.emit();
    this.ensureTickLoop();
  }

  lapStopwatch(): void {
    this.state = {
      ...this.state,
      stopwatch: {
        ...this.state.stopwatch,
        laps: [this.state.stopwatch.elapsedMs, ...this.state.stopwatch.laps.slice(0, 7)],
      },
    };
    this.emit();
  }

  resetStopwatch(): void {
    this.state = {
      ...this.state,
      stopwatch: { running: false, elapsedMs: 0, startedAt: null, laps: [] },
    };
    this.emit();
    this.ensureTickLoop();
  }

  // To-Do, Shopping, Notes, Water Tracker
  addTodoItems(items: string[], listType: 'todo' | 'shopping'): void {
    const created: TodoItem[] = items
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text, idx) => ({
        id: `todo-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
        text,
        listType,
        done: false,
        createdAt: Date.now(),
      }));
    if (created.length === 0) return;
    this.state = { ...this.state, todos: [...created, ...this.state.todos.slice(0, 39)] };
    this.persistProductivity();
    this.emit();
  }

  toggleTodoItem(id: string): void {
    this.state = {
      ...this.state,
      todos: this.state.todos.map((item) => (item.id === id ? { ...item, done: !item.done } : item)),
    };
    this.persistProductivity();
    this.emit();
  }

  removeTodoItem(id: string): void {
    this.state = {
      ...this.state,
      todos: this.state.todos.filter((item) => item.id !== id),
    };
    this.persistProductivity();
    this.emit();
  }

  addNote(text: string): void {
    const cleaned = text.trim();
    if (!cleaned) return;
    const item: QuickNoteItem = { id: `note-${Date.now()}`, text: cleaned, updatedAt: Date.now() };
    this.state = { ...this.state, notes: [item, ...this.state.notes.slice(0, 19)] };
    this.persistProductivity();
    this.emit();
  }

  removeNote(id: string): void {
    this.state = { ...this.state, notes: this.state.notes.filter((n) => n.id !== id) };
    this.persistProductivity();
    this.emit();
  }

  clearNotes(): void {
    this.state = { ...this.state, notes: [] };
    this.persistProductivity();
    this.emit();
  }

  completeAllTodos(): void {
    this.state = {
      ...this.state,
      todos: this.state.todos.map((t) => ({ ...t, done: true })),
      emotion: 'excited',
      emotionNuance: 'satisfied',
    };
    this.persistProductivity();
    audioService.playSuccessChime(this.state.settings.general.soundEffects);
    this.emit();
  }

  logWater(deltaMl = 250): void {
    const next = Math.max(0, Math.min(5000, this.state.waterMl + deltaMl));
    this.state = {
      ...this.state,
      waterMl: next,
      emotion: 'happy',
      emotionNuance: 'satisfied',
    };
    this.persistProductivity();
    this.showWhisper('Stay hydrated~');
    audioService.playPopChime(this.state.settings.general.soundEffects);
    this.emit();
  }

  // App / Web Shortcuts (up to 8 pinned)
  addShortcut(label: string, url: string, alias?: string, category: AppShortcutItem['category'] = 'web'): void {
    const cleanLabel = label.trim();
    const cleanUrl = url.trim();
    if (!cleanLabel || !cleanUrl) return;
    const item: AppShortcutItem = {
      id: `sc-${Date.now()}`,
      label: cleanLabel,
      url: cleanUrl,
      alias: (alias || cleanLabel).toLowerCase().replace(/\s+/g, ''),
      category,
      pinned: true,
    };
    const next = [item, ...this.state.shortcuts].slice(0, 8);
    this.state = { ...this.state, shortcuts: next };
    safeWriteJson(SHORTCUTS_STORAGE_KEY, next);
    this.emit();
  }

  removeShortcut(id: string): void {
    const next = this.state.shortcuts.filter((s) => s.id !== id);
    this.state = { ...this.state, shortcuts: next };
    safeWriteJson(SHORTCUTS_STORAGE_KEY, next);
    this.emit();
  }

  reorderShortcut(id: string, dir: -1 | 1): void {
    const idx = this.state.shortcuts.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const swap = idx + dir;
    if (swap < 0 || swap >= this.state.shortcuts.length) return;
    const next = [...this.state.shortcuts];
    [next[idx], next[swap]] = [next[swap], next[idx]];
    this.state = { ...this.state, shortcuts: next };
    safeWriteJson(SHORTCUTS_STORAGE_KEY, next);
    this.emit();
  }

  // Independent Teleprompter Window State
  updateTeleprompter(updater: (prev: TeleprompterState) => TeleprompterState): void {
    this.state = { ...this.state, teleprompter: updater(this.state.teleprompter) };
    this.emit();
  }

  // System Display Filters & Wake Lock
  toggleNightLight(): void {
    const next = !this.state.systemStatus.nightLight;
    this.state = {
      ...this.state,
      systemStatus: { ...this.state.systemStatus, nightLight: next },
      emotion: next ? 'sleepy' : 'happy',
      emotionNuance: next ? 'relaxed' : 'waking',
    };
    this.showWhisper(next ? 'Night Light ON' : 'Daylight clear');
    audioService.playPopChime(this.state.settings.general.soundEffects);
    this.emit();
  }

  setBrightness(brightness: number): void {
    const clamped = Math.round(Math.min(100, Math.max(35, brightness)));
    const prev = this.state.systemStatus.brightness;
    this.state = {
      ...this.state,
      systemStatus: { ...this.state.systemStatus, brightness: clamped },
      emotion: clamped <= 65 ? 'sleepy' : clamped > prev ? 'happy' : 'curious',
      emotionNuance: clamped <= 65 ? 'relaxed' : 'waking',
    };
    this.emit();
  }

  async toggleWakeLock(): Promise<void> {
    if (this.wakeLockSentinel) {
      await this.wakeLockSentinel.release().catch(() => {});
      this.wakeLockSentinel = null;
      this.state = {
        ...this.state,
        systemStatus: { ...this.state.systemStatus, wakeLockActive: false },
        emotion: 'neutral',
        emotionNuance: 'relaxed',
      };
      this.emit();
      return;
    }

    const nav = navigator as unknown as {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) {
      this.pushNotification('Wake Lock Unavailable', 'Screen Wake Lock API is unavailable in this browser context.', 'warning');
      return;
    }

    try {
      this.wakeLockSentinel = await nav.wakeLock.request('screen');
      this.state = {
        ...this.state,
        systemStatus: { ...this.state.systemStatus, wakeLockActive: true },
        emotion: 'focused',
        emotionNuance: 'concentrating',
      };
      this.emit();
    } catch {
      this.pushNotification('Wake Lock Blocked', 'Browser refused screen wake lock request.', 'warning');
    }
  }

  setScreenAssistActive(active: boolean): void {
    this.state = { ...this.state, screenAssistActive: active };
    this.emit();
  }

  // Music Transport & Lyrics Pin
  playMusic(): void {
    const track = BUILTIN_TRACKS[this.state.music.trackIndex % BUILTIN_TRACKS.length];
    audioService.startAmbientTrack(track);
    this.state = {
      ...this.state,
      music: { ...this.state.music, playing: true },
      emotion: 'playful',
      emotionNuance: 'anticipating',
    };
    this.emit();
    this.ensureTickLoop();
  }

  pauseMusic(): void {
    audioService.stopAmbientTrack();
    this.state = {
      ...this.state,
      music: { ...this.state.music, playing: false },
      emotion: 'neutral',
      emotionNuance: 'relaxed',
    };
    this.emit();
    this.ensureTickLoop();
  }

  seekMusic(seconds: number): void {
    const track = BUILTIN_TRACKS[this.state.music.trackIndex % BUILTIN_TRACKS.length];
    const clamped = Math.max(0, Math.min(track.durationSec, Math.round(seconds)));
    this.state = {
      ...this.state,
      music: { ...this.state.music, elapsedSec: clamped },
    };
    this.emit();
  }

  toggleLyricsPinned(): void {
    this.state = { ...this.state, lyricsPinned: !this.state.lyricsPinned };
    this.emit();
  }

  nextTrack(): void {
    const nextIndex = (this.state.music.trackIndex + 1) % BUILTIN_TRACKS.length;
    if (this.state.music.playing) {
      audioService.startAmbientTrack(BUILTIN_TRACKS[nextIndex]);
    }
    this.state = {
      ...this.state,
      music: { ...this.state.music, trackIndex: nextIndex, elapsedSec: 0 },
      emotion: 'happy',
      emotionNuance: 'anticipating',
    };
    this.emit();
  }

  prevTrack(): void {
    const prevIndex = (this.state.music.trackIndex - 1 + BUILTIN_TRACKS.length) % BUILTIN_TRACKS.length;
    if (this.state.music.playing) {
      audioService.startAmbientTrack(BUILTIN_TRACKS[prevIndex]);
    }
    this.state = {
      ...this.state,
      music: { ...this.state.music, trackIndex: prevIndex, elapsedSec: 0 },
      emotion: 'curious',
      emotionNuance: 'relaxed',
    };
    this.emit();
  }

  // Volume & Live HUD controls
  private scheduleLiveHud(hud: LiveHudState, durationMs = 2400): void {
    if (this.hudTimeout !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.hudTimeout);
    }
    this.state = { ...this.state, liveHud: hud };
    this.emit();
    if (typeof window !== 'undefined') {
      this.hudTimeout = window.setTimeout(() => {
        this.state = { ...this.state, liveHud: null };
        this.emit();
      }, durationMs);
    }
  }

  triggerTaskResultHud(label: string, detail?: string): void {
    this.scheduleLiveHud(
      {
        id: `hud-done-${Date.now()}`,
        type: 'task-result',
        label,
        detail,
        tick: (this.state.liveHud?.tick ?? 0) + 1,
      },
      2600
    );
  }

  setVolume(percent: number): void {
    const prev = this.state.volume;
    const clamped = Math.round(Math.min(100, Math.max(0, percent)));
    const nextMuted = clamped === 0;
    audioService.setMasterVolume(clamped, nextMuted);
    audioService.playVolumeTick(this.state.settings.general.soundEffects, clamped);
    const nextEmotion: EmotionState =
      clamped === 0
        ? 'sleepy'
        : clamped >= 85
          ? 'excited'
          : clamped > prev
            ? 'happy'
            : clamped < prev
              ? 'curious'
              : 'happy';
    const nextNuance: EmotionNuance =
      clamped === 0
        ? 'relaxed'
        : clamped >= 85
          ? 'anticipating'
          : clamped < prev
            ? 'gentle-breathing'
            : 'satisfied';
    if (clamped === 100) {
      this.showWhisper('Max volume!');
    } else if (clamped === 0) {
      this.showWhisper('Audio silent~');
    }
    this.state = {
      ...this.state,
      volume: clamped,
      muted: nextMuted,
      emotion: nextEmotion,
      emotionNuance: nextNuance,
    };
    this.scheduleLiveHud(
      {
        id: `hud-vol-${Date.now()}`,
        type: 'volume',
        label: nextMuted ? 'Muted' : `Volume ${clamped}%`,
        value: clamped,
        muted: nextMuted,
        tick: (this.state.liveHud?.tick ?? 0) + 1,
      },
      3200
    );
  }

  adjustVolume(delta: number): void {
    const base = this.state.muted && delta > 0 ? 0 : this.state.volume;
    this.setVolume(base + delta);
  }

  toggleMute(): void {
    const nextMuted = !this.state.muted;
    audioService.setMasterVolume(this.state.volume, nextMuted);
    if (!nextMuted) {
      audioService.playVolumeTick(this.state.settings.general.soundEffects, this.state.volume);
    }
    this.showWhisper(nextMuted ? 'Muted~' : 'Audio restored!');
    this.state = {
      ...this.state,
      muted: nextMuted,
      emotion: nextMuted ? 'sleepy' : 'happy',
      emotionNuance: nextMuted ? 'relaxed' : 'waking',
    };
    this.scheduleLiveHud(
      {
        id: `hud-vol-${Date.now()}`,
        type: 'volume',
        label: nextMuted ? 'Muted' : `Volume ${this.state.volume}%`,
        value: nextMuted ? 0 : this.state.volume,
        muted: nextMuted,
        tick: (this.state.liveHud?.tick ?? 0) + 1,
      },
      3200
    );
  }

  triggerScreenshot(): void {
    audioService.playShutterChime(this.state.settings.general.soundEffects);
    const snap = renderWorkspaceSnapshot({
      assistantName: this.state.settings.personalization.assistantName,
      emotion: this.state.emotion,
      emotionLabel: EMOTION_SPECS[this.state.emotion]?.label ?? 'Neutral',
      accentColor: this.state.settings.appearance.accentColor,
      faceColor: this.state.settings.appearance.faceColor,
      volume: this.state.volume,
      muted: this.state.muted,
      isOnline: this.state.isOnline,
      timersCount: this.state.timers.length,
      filesCount: this.state.files.length,
    });

    const entry: ShelfFileItem = {
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: snap.fileName,
      sizeBytes: snap.sizeBytes,
      mimeType: 'image/png',
      previewDataUrl: snap.dataUrl,
      previewText: `2D workspace snapshot captured at ${new Date().toLocaleTimeString()}`,
      addedAt: Date.now(),
    };
    const nextFiles = [entry, ...this.state.files.slice(0, 15)];
    safeWriteJson(FILES_STORAGE_KEY, nextFiles);

    this.showWhisper('Snap! Saved to Shelf');
    this.state = {
      ...this.state,
      files: nextFiles,
      emotion: 'playful',
      pokeTick: this.state.pokeTick + 1,
      screenshotFlashTick: this.state.screenshotFlashTick + 1,
    };
    this.scheduleLiveHud(
      {
        id: `hud-shot-${Date.now()}`,
        type: 'screenshot',
        label: snap.fileName,
        previewDataUrl: snap.dataUrl,
        tick: (this.state.liveHud?.tick ?? 0) + 1,
      },
      3000
    );
  }

  dismissLiveHud(): void {
    if (this.hudTimeout !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.hudTimeout);
      this.hudTimeout = null;
    }
    this.state = { ...this.state, liveHud: null };
    this.emit();
  }

  triggerBreathingHud(): void {
    audioService.playPopChime(this.state.settings.general.soundEffects);
    this.showWhisper('Breathe with me~');
    this.state = {
      ...this.state,
      emotion: 'affectionate',
      emotionNuance: 'gentle-breathing',
    };
    this.scheduleLiveHud(
      {
        id: `hud-breathe-${Date.now()}`,
        type: 'breathing',
        label: '2D Calm Breathe',
        detail: 'Inhale · Hold · Exhale softly',
        tick: (this.state.liveHud?.tick ?? 0) + 1,
      },
      12000
    );
  }

  triggerSystemHud(): void {
    audioService.playPopChime(this.state.settings.general.soundEffects);
    void this.probeSystemEnvironment();
    const { batteryPct, charging } = this.state.systemStatus;
    const baseDetail = `${this.state.isOnline ? 'Online' : 'Offline'} · ${this.state.memories.length} memories · ${this.state.files.length} shelf`;

    this.state = { ...this.state, emotion: 'focused', emotionNuance: 'concentrating' };
    this.scheduleLiveHud(
      {
        id: `hud-sys-${Date.now()}`,
        type: 'system',
        label:
          batteryPct !== null
            ? charging
              ? `Power ${batteryPct}% (Charging)`
              : `Battery ${batteryPct}%`
            : 'System Vitals',
        detail: baseDetail,
        value: batteryPct ?? 96,
        subvalue: this.state.volume,
        tick: (this.state.liveHud?.tick ?? 0) + 1,
      },
      4500
    );
  }

  // Clipboard History (Privacy Guarded)
  addClipboardItem(text: string): boolean {
    if (!this.state.settings.privacy.captureClipboardHistory) {
      this.pushNotification('Clipboard Capture Paused', 'Privacy setting disables automatic clipboard saving.', 'info');
      return false;
    }
    const trimmed = text.trim();
    if (!trimmed) return false;
    if (looksSensitiveCredential(trimmed)) {
      this.pushNotification('Credential Skipped', 'Sensitive token/password pattern was omitted from clipboard history.', 'warning');
      return false;
    }
    const deduped = this.state.clipboard.filter((c) => c.text !== trimmed);
    const next: ClipboardItem[] = [
      { id: `clip-${Date.now()}`, text: trimmed, copiedAt: Date.now() },
      ...deduped.slice(0, 19),
    ];
    this.state = { ...this.state, clipboard: next };
    safeWriteJson(CLIPBOARD_STORAGE_KEY, next);
    this.emit();
    return true;
  }

  removeClipboardItem(id: string): void {
    const next = this.state.clipboard.filter((c) => c.id !== id);
    this.state = { ...this.state, clipboard: next };
    safeWriteJson(CLIPBOARD_STORAGE_KEY, next);
    this.emit();
  }

  clearClipboard(): void {
    this.state = { ...this.state, clipboard: [] };
    safeWriteJson(CLIPBOARD_STORAGE_KEY, []);
    this.emit();
  }

  // File Shelf + Canvas Image Tools (Always create NEW copies)
  addShelfFile(item: Omit<ShelfFileItem, 'id' | 'addedAt'>): void {
    const entry: ShelfFileItem = {
      ...item,
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      addedAt: Date.now(),
    };
    const next = [entry, ...this.state.files.slice(0, 15)];
    this.state = { ...this.state, files: next };
    safeWriteJson(FILES_STORAGE_KEY, next);
    audioService.playSuccessChime(this.state.settings.general.soundEffects);
    this.setEmotion('curious', false, 'anticipating');
    this.emit();
  }

  removeShelfFile(id: string): void {
    const next = this.state.files.filter((f) => f.id !== id);
    this.state = { ...this.state, files: next };
    safeWriteJson(FILES_STORAGE_KEY, next);
    this.emit();
  }

  async applyShelfImageOp(kind: ImageTransformKind, fileId?: string): Promise<string | null> {
    const target = fileId
      ? this.state.files.find((f) => f.id === fileId)
      : this.state.files.find((f) => f.mimeType.startsWith('image/') && f.previewDataUrl);
    if (!target) {
      this.pushNotification('No Image Found', 'Snap or drop an image onto Shelf first.', 'warning');
      return null;
    }
    try {
      const derived = await transformShelfImageCopy(target, kind);
      const next = [derived, ...this.state.files.slice(0, 15)];
      this.state = { ...this.state, files: next };
      safeWriteJson(FILES_STORAGE_KEY, next);
      audioService.playSuccessChime(this.state.settings.general.soundEffects);
      this.triggerTaskResultHud('Saved New Image Copy', derived.name);
      this.emit();
      return derived.name;
    } catch {
      this.pushNotification('Image Tool Error', 'Could not process image copy.', 'error');
      return null;
    }
  }

  summarizeLatestDoc(fileId?: string): string {
    const target = fileId
      ? this.state.files.find((f) => f.id === fileId)
      : this.state.files.find((f) => f.previewText) ?? this.state.files[0];
    if (!target) {
      const msg = 'No document on your Shelf yet.';
      this.pushNotification('Shelf Empty', msg, 'info');
      return msg;
    }
    const summary = summarizeShelfDocument(target);
    this.triggerTaskResultHud('Document Summary', summary);
    return summary;
  }

  // Persistent Memory
  addMemory(fact: string): void {
    const trimmed = fact.trim();
    if (!trimmed) return;
    const next: MemoryFact[] = [
      { id: `mem-${Date.now()}`, fact: trimmed, createdAt: Date.now() },
      ...this.state.memories,
    ];
    this.state = { ...this.state, memories: next };
    safeWriteJson(MEMORY_STORAGE_KEY, next);
    this.emit();
  }

  removeMemory(id: string): void {
    const next = this.state.memories.filter((m) => m.id !== id);
    this.state = { ...this.state, memories: next };
    safeWriteJson(MEMORY_STORAGE_KEY, next);
    this.emit();
  }

  clearAllPreferences(): void {
    this.state = { ...this.state, memories: [] };
    safeWriteJson(MEMORY_STORAGE_KEY, []);
    this.writeDeduplicator.clear();
    this.emit();
  }

  exportNotesMarkdown(): string {
    return formatNotesAsMarkdown(this.state.notes, this.state.todos);
  }

  clearAllLocalData(): void {
    safeRemoveKey(HISTORY_STORAGE_KEY);
    safeRemoveKey(MEMORY_STORAGE_KEY);
    safeRemoveKey(CLIPBOARD_STORAGE_KEY);
    safeRemoveKey(FILES_STORAGE_KEY);
    safeRemoveKey(PRODUCTIVITY_STORAGE_KEY);
    this.writeDeduplicator.clear();
    this.state = {
      ...this.state,
      memories: [],
      clipboard: [],
      files: [],
      todos: [],
      notes: [],
      timers: [],
      reminders: [],
      pendingConfirmation: null,
      lastCapturedMarkdown: null,
      messages: [
        {
          id: `msg-${Date.now()}`,
          role: 'assistant',
          text: 'All local transcripts, notes, memories, and shelf items cleared.',
          timestamp: Date.now(),
          provider: 'offline',
          emotion: 'neutral',
        },
      ],
    };
    this.emit();
  }

  // Notification banner inside island
  pushNotification(title: string, detail: string, tone: NotificationBanner['tone'] = 'info'): void {
    if (this.notifTimeout !== null && typeof window !== 'undefined') {
      window.clearTimeout(this.notifTimeout);
    }
    this.state = {
      ...this.state,
      notification: { id: `notif-${Date.now()}`, title, detail, tone, createdAt: Date.now() },
    };
    this.emit();
    if (typeof window !== 'undefined') {
      this.notifTimeout = window.setTimeout(() => {
        this.state = { ...this.state, notification: null };
        this.emit();
      }, 4200);
    }
  }

  dismissNotification(): void {
    this.state = { ...this.state, notification: null };
    this.emit();
  }

  // Shared command-action dispatcher for voice/text & Jarvis compound execution
  executeActions(actions: OfflineAction[]): void {
    for (const act of actions) {
      this.executeOfflineAction(act);
    }
  }

  executeOfflineAction(action: OfflineAction): void {
    const { type, payload } = action;
    if (
      type === 'add-note' ||
      type === 'add-todo' ||
      type === 'add-shopping' ||
      type === 'add-reminder' ||
      type === 'remember-fact' ||
      type === 'capture-that'
    ) {
      if (this.writeDeduplicator.isDuplicate(type, payload)) {
        return;
      }
    }

    if (type === 'start-timer' && payload?.seconds) {
      this.startTimer(Number(payload.seconds), String(payload.label || 'Timer'));
    } else if (type === 'start-pomodoro') {
      this.startTimer(1500, 'Pomodoro 25m', 'pomodoro');
    } else if (type === 'start-stopwatch') {
      this.startStopwatch();
      this.setMenuOpen(true, 'productivity');
    } else if (type === 'clear-timers') {
      this.clearTimers();
    } else if (type === 'pause-timer') {
      const msg = this.pauseActiveTimer();
      this.triggerTaskResultHud('Timer Status', msg);
    } else if (type === 'resume-timer') {
      const msg = this.resumePausedTimer();
      this.triggerTaskResultHud('Timer Status', msg);
    } else if (type === 'timer-status') {
      const msg = this.getTimersRemainingSummary();
      this.addMessage({ role: 'assistant', text: msg, provider: 'offline', emotion: 'focused' });
    } else if (type === 'set-response-depth' && payload?.depth) {
      this.setResponseDepth(payload.depth as ResponseDepth);
    } else if (type === 'catch-me-up') {
      const summary = summarizeSessionCatchUp({
        messages: this.state.messages,
        timers: this.state.timers,
        todos: this.state.todos,
        notes: this.state.notes,
      });
      this.addMessage({
        role: 'assistant',
        text: summary.formattedText,
        provider: 'offline',
        emotion: 'focused',
        actionsApplied: ['Session Catch-Up'],
      });
    } else if (type === 'capture-that') {
      const captured = buildCaptureNoteFromMessages(
        this.state.messages,
        typeof payload?.text === 'string' ? payload.text : undefined,
        Boolean(payload?.asChecklist)
      );
      this.addNote(captured.noteText);
      if (Boolean(payload?.asChecklist) && captured.checklistItems.length > 0) {
        this.addTodoItems(captured.checklistItems.slice(0, 6), 'todo');
      }
      this.state = {
        ...this.state,
        lastCapturedMarkdown: {
          title: `xero-capture-${Date.now().toString().slice(-4)}.md`,
          markdown: captured.markdown,
          timestamp: Date.now(),
        },
      };
      this.triggerTaskResultHud('Captured Note', 'Ready for Markdown export in Notes');
      this.emit();
    } else if (type === 'request-confirmation' && payload?.summary && payload?.targetActionType) {
      const targetPayload: Record<string, string | number | boolean | string[]> = {};
      for (const [k, v] of Object.entries(payload)) {
        if (k !== 'kind' && k !== 'summary' && k !== 'targetActionType') {
          targetPayload[k] = v;
        }
      }
      this.requestConfirmation({
        kind: (payload.kind as 'destructive' | 'preference') || 'destructive',
        summary: String(payload.summary),
        actionType: String(payload.targetActionType),
        payload: targetPayload,
      });
    } else if (type === 'clear-preferences') {
      this.clearAllPreferences();
      this.triggerTaskResultHud('Preferences Cleared', 'Local preferences reset');
    } else if (type === 'add-reminder' && payload?.text) {
      this.addReminder(String(payload.text), Number(payload.seconds || 60));
    } else if (type === 'add-note' && payload?.text) {
      this.addNote(String(payload.text));
      audioService.playSuccessChime(this.state.settings.general.soundEffects);
      this.triggerTaskResultHud('Saved Note', String(payload.text));
    } else if (type === 'open-tab' && payload?.tab) {
      this.setIslandExpanded(true, payload.tab as IslandWidgetTab);
    } else if (type === 'add-todo' && Array.isArray(payload?.items)) {
      this.addTodoItems(payload.items as string[], 'todo');
    } else if (type === 'add-shopping' && Array.isArray(payload?.items)) {
      this.addTodoItems(payload.items as string[], 'shopping');
    } else if (type === 'log-water') {
      this.logWater(Number(payload?.ml ?? 250));
    } else if (type === 'music-play') {
      this.playMusic();
    } else if (type === 'music-pause') {
      this.pauseMusic();
    } else if (type === 'music-next') {
      this.nextTrack();
    } else if (type === 'music-prev') {
      this.prevTrack();
    } else if (type === 'set-volume' && payload?.volume !== undefined) {
      this.setVolume(Number(payload.volume));
    } else if (type === 'adjust-volume' && payload?.delta !== undefined) {
      this.adjustVolume(Number(payload.delta));
    } else if (type === 'toggle-mute') {
      this.toggleMute();
    } else if (type === 'take-screenshot') {
      this.triggerScreenshot();
    } else if (type === 'start-breathing') {
      this.triggerBreathingHud();
    } else if (type === 'show-system-hud') {
      this.triggerSystemHud();
    } else if (type === 'open-studio') {
      this.openStudio();
    } else if (type === 'open-menu') {
      this.setMenuOpen(true, (payload?.category as MenuCategory) || 'widgets');
    } else if (type === 'open-teleprompter') {
      this.updateTeleprompter((p) => ({ ...p, isOpen: true }));
    } else if (type === 'set-mode' && payload?.mode) {
      this.setInteractionMode(payload.mode as InteractionMode);
    } else if (type === 'minimize-island') {
      this.setIslandMode('minimized');
    } else if (type === 'remember-fact' && payload?.fact) {
      this.addMemory(String(payload.fact));
    } else if (type === 'toggle-night-light') {
      this.toggleNightLight();
    } else if (type === 'set-brightness' && payload?.brightness !== undefined) {
      this.setBrightness(Number(payload.brightness));
    } else if (type === 'toggle-awake') {
      void this.toggleWakeLock();
    } else if (type === 'set-appearance-preset' && payload?.preset) {
      this.applyAppearancePreset(String(payload.preset) as AppearancePresetName);
    } else if (type === 'set-emotion' && payload?.emotion) {
      this.setEmotion(payload.emotion as EmotionState, false, 'satisfied');
    } else if (type === 'clear-clipboard') {
      this.clearClipboard();
    } else if (type === 'clear-notes') {
      this.clearNotes();
    } else if (type === 'complete-todos') {
      this.completeAllTodos();
    } else if (type === 'update-setting' && payload?.key) {
      const k = String(payload.key);
      const v = payload.value;
      this.updateSettings((prev) => {
        switch (k) {
          case 'gamingMode':
          case 'launchMinimized':
          case 'soundEffects':
          case 'spontaneousBehavior':
          case 'autoExpandOnTrackChange':
            return { ...prev, general: { ...prev.general, [k]: Boolean(v) } };
          case 'autoHideDelayMs':
          case 'autoCollapseMs':
            return { ...prev, general: { ...prev.general, [k]: Number(v) || 0 } };
          case 'reducedMotion':
            return { ...prev, appearance: { ...prev.appearance, reducedMotion: Boolean(v) } };
          case 'notchShape':
            return { ...prev, appearance: { ...prev.appearance, notchShape: String(v) as 'bezel' | 'pill' | 'squircle' } };
          case 'islandOpacity':
          case 'glowIntensity':
          case 'borderIllumination':
          case 'islandScale':
            return { ...prev, appearance: { ...prev.appearance, [k]: Number(v) } };
          case 'ttsEnabled':
          case 'wakeWordEnabled':
            return { ...prev, voice: { ...prev.voice, [k]: Boolean(v) } };
          case 'providerMode':
            return { ...prev, ai: { ...prev.ai, providerMode: String(v) as XeroSettings['ai']['providerMode'] } };
          case 'captureClipboardHistory':
          case 'persistChatHistory':
            return { ...prev, privacy: { ...prev.privacy, [k]: Boolean(v) } };
          default:
            return prev;
        }
      });
    } else if (type === 'copy-generated' && payload?.value) {
      const val = String(payload.value);
      if (typeof navigator !== 'undefined') {
        void navigator.clipboard?.writeText(val).catch(() => {});
      }
      this.state = {
        ...this.state,
        clipboard: [
          { id: `clip-${Date.now()}`, text: val, copiedAt: Date.now() },
          ...this.state.clipboard.slice(0, 19),
        ],
      };
      this.triggerTaskResultHud(`Generated ${String(payload.kind || 'Secret')}`, 'Copied to Clipboard History');
    } else if (type === 'shelf-image-op' && payload?.op) {
      void this.applyShelfImageOp(payload.op as ImageTransformKind);
    } else if (type === 'shelf-summarize') {
      this.summarizeLatestDoc();
    } else if (type === 'open-shortcut' && payload?.alias) {
      const found = this.state.shortcuts.find(
        (s) => s.alias === String(payload.alias) || s.label.toLowerCase() === String(payload.alias)
      );
      if (found) {
        if (found.url === '#teleprompter') {
          this.updateTeleprompter((p) => ({ ...p, isOpen: true }));
        } else if (typeof window !== 'undefined') {
          this.pushNotification('Shortcut Ready', `Click link in Apps menu for ${found.label} (${found.url})`, 'info');
          this.setMenuOpen(true, 'apps');
        }
      } else {
        this.pushNotification('Shortcut Not Pinned', `Pin "${String(payload.alias)}" in the Apps menu first.`, 'info');
      }
    } else if (type === 'web-search' && payload?.query) {
      this.triggerTaskResultHud('Search Link Ready', `https://duckduckgo.com/?q=${encodeURIComponent(String(payload.query))}`);
    }
  }
}

export const xeroStore = new XeroSingletonStore();

export function useXeroStore(): XeroAppState {
  return useSyncExternalStore(xeroStore.subscribe, xeroStore.getSnapshot, xeroStore.getSnapshot);
}
