export type EmotionState =
  | 'neutral'
  | 'happy'
  | 'sad'
  | 'curious'
  | 'surprised'
  | 'excited'
  | 'confused'
  | 'annoyed'
  | 'sleepy'
  | 'bored'
  | 'affectionate'
  | 'focused'
  | 'playful'
  | 'listening'
  | 'thinking'
  | 'speaking';

export type EmotionNuance =
  | 'none'
  | 'anticipating'
  | 'concentrating'
  | 'satisfied'
  | 'frustrated'
  | 'relaxed'
  | 'embarrassed'
  | 'waking'
  | 'gentle-breathing';

export type IslandMode =
  | 'idle'
  | 'hovered'
  | 'listening'
  | 'thinking'
  | 'speaking'
  | 'dictating'
  | 'music'
  | 'notification'
  | 'menu'
  | 'system'
  | 'minimized'
  | 'chat'
  | 'widgets';

export type IslandWidgetTab = 'chat' | 'timers' | 'music' | 'clipboard' | 'files';

export type InteractionMode = 'command' | 'dictate' | 'write';

export type DictationStyle = 'verbatim' | 'clean' | 'ai-polished';

export type WriteTaskKind =
  | 'email'
  | 'message'
  | 'note'
  | 'summary'
  | 'grammar'
  | 'rewrite'
  | 'translate'
  | 'explain-code'
  | 'documentation'
  | 'tone'
  | 'shorten'
  | 'expand';

export type MenuCategory =
  | 'widgets'
  | 'system'
  | 'apps'
  | 'music'
  | 'productivity'
  | 'shelf'
  | 'appearance'
  | 'studio';

export type NotchShape = 'pill' | 'squircle' | 'bezel';

export type AppearancePresetName =
  | 'Cyan'
  | 'Ice White'
  | 'Crimson'
  | 'Violet'
  | 'Emerald'
  | 'Amber'
  | 'Sakura'
  | 'Midnight'
  | 'Soft Blue'
  | 'Custom';

export type VoiceResponseMode = 'silent' | 'chimes' | 'system-voice' | 'tts-provider';

export type AIProviderMode = 'auto' | 'offline' | 'local-llm' | 'gemini';

export type LocalLLMFormat = 'ollama' | 'openai';

export type PersonalityTone =
  | 'Friendly Cyberpunk'
  | 'Concise Technical'
  | 'Playful Companion'
  | 'Calm Minimalist';

export type AccentPreset = '#00E5FF' | '#8B5CF6' | '#9C6BFF' | '#FF2D75' | '#39FF88' | string;

export type StudioTab =
  | 'general'
  | 'appearance'
  | 'ai'
  | 'health'
  | 'voice'
  | 'personalization'
  | 'expressions'
  | 'advanced';

export interface IslandPosition {
  docked: boolean;
  x: number;
  y: number;
}

export interface XeroSettings {
  general: {
    launchMinimized: boolean;
    gamingMode: boolean;
    alwaysOnTopSim: boolean;
    autoCollapseMs: number;
    autoHideDelayMs?: number;
    hotkeyLabel: string;
    soundEffects: boolean;
    spontaneousBehavior: boolean;
    autoExpandOnTrackChange: boolean;
  };
  appearance: {
    presetName: AppearancePresetName;
    accentColor: AccentPreset;
    faceColor: string;
    notchShape: NotchShape;
    islandScale: number;
    islandOpacity: number;
    glowIntensity: number;
    borderIllumination: number;
    showMediaProgress: boolean;
    reducedMotion: boolean;
  };
  ai: {
    providerMode: AIProviderMode;
    geminiModel: 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite';
    liveModel: 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking';
    liveVoiceName: 'Kore' | 'Zephyr';
    localFormat: LocalLLMFormat;
    localEndpoint: string;
    localModel: string;
    systemPrompt: string;
    memoryEnabled: boolean;
  };
  voice: {
    responseMode: VoiceResponseMode;
    ttsEnabled: boolean;
    ttsRate: number;
    ttsPitch: number;
    wakeWordEnabled: boolean;
    wakeWord: string;
    dictationLang: string;
    micDeviceId: string;
    noiseSuppression: boolean;
    silenceTimeoutMs: number;
    followUpWindowMs: number;
    dictationStyle: DictationStyle;
    customVocabulary: string[];
  };
  privacy: {
    captureClipboardHistory: boolean;
    persistChatHistory: boolean;
    retainAudioRecordings: boolean;
  };
  personalization: {
    assistantName: string;
    userName: string;
    personalityTone: PersonalityTone;
  };
}

export type ResponseDepth = 'concise' | 'balanced' | 'detailed';

export type LiveSessionPhase =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'listening'
  | 'speaking'
  | 'reconnecting'
  | 'error';

export interface LiveLatencyMetrics {
  micActivationMs: number | null;
  firstResponseMs: number | null;
  interruptToSilenceMs: number | null;
  reconnectCount: number;
}

export interface PendingConfirmation {
  id: string;
  kind: 'destructive' | 'preference';
  summary: string;
  actionType: string;
  payload?: Record<string, string | number | boolean | string[]>;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  timestamp: number;
  provider?: 'offline' | 'local-llm' | 'gemini';
  emotion?: EmotionState;
  actionsApplied?: string[];
}

export interface TimerItem {
  id: string;
  label: string;
  durationSec: number;
  remainingSec: number;
  endAt: number | null;
  running: boolean;
  kind?: 'timer' | 'pomodoro' | 'break';
  createdAt: number;
}

export interface ReminderItem {
  id: string;
  text: string;
  triggerAt: number;
  completed: boolean;
}

export interface TodoItem {
  id: string;
  text: string;
  listType: 'todo' | 'shopping';
  done: boolean;
  createdAt: number;
}

export interface QuickNoteItem {
  id: string;
  text: string;
  updatedAt: number;
}

export interface ClipboardItem {
  id: string;
  text: string;
  copiedAt: number;
  pinned?: boolean;
}

export interface ShelfFileItem {
  id: string;
  name: string;
  sizeBytes: number;
  mimeType: string;
  previewText?: string;
  previewDataUrl?: string;
  sourcePathHint?: string;
  pinned?: boolean;
  addedAt: number;
}

export interface AppShortcutItem {
  id: string;
  label: string;
  url: string;
  alias: string;
  category: 'app' | 'web' | 'project';
  pinned: boolean;
}

export interface TeleprompterState {
  isOpen: boolean;
  script: string;
  fontSize: number;
  scrollSpeed: number;
  playing: boolean;
  speechFollow: boolean;
  activeLine: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type LiveHudType = 'volume' | 'screenshot' | 'focus' | 'breathing' | 'system' | 'task-result';

export interface LiveHudState {
  id: string;
  type: LiveHudType;
  label: string;
  detail?: string;
  value?: number;
  subvalue?: number;
  muted?: boolean;
  previewDataUrl?: string;
  tick: number;
}

export interface MemoryFact {
  id: string;
  fact: string;
  createdAt: number;
}

export interface LyricLine {
  timeSec: number;
  text: string;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  bpm: number;
  accent: string;
  notes: number[];
  lyrics: LyricLine[];
}

export interface NotificationBanner {
  id: string;
  title: string;
  detail: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  createdAt: number;
}

export interface StudioWindowState {
  isOpen: boolean;
  activeTab: StudioTab;
  x: number;
  y: number;
  width: number;
  height: number;
  minimized: boolean;
  focusTick: number;
}

export interface SystemStatusSnapshot {
  brightness: number;
  nightLight: boolean;
  batteryPct: number | null;
  charging: boolean | null;
  capsLock: boolean;
  keyboardLang: string;
  audioOutputCount: number | null;
  wakeLockActive: boolean;
}

export interface LlmInferenceMetric {
  id: string;
  timestamp: number;
  provider: 'offline' | 'local-llm' | 'gemini';
  model: string;
  latencyMs: number;
  outputChars: number;
  tokensPerSec: number;
}
