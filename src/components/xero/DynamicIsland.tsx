import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type Transition } from 'motion/react';
import {
  Activity,
  Camera,
  Check,
  CheckCircle2,
  ChevronUp,
  Circle,
  Clipboard,
  Clock,
  Copy,
  Download,
  Droplets,
  ExternalLink,
  FileText,
  FolderOpen,
  LayoutGrid,
  Mic,
  MicOff,
  Monitor,
  MousePointer,
  Music,
  Pause,
  PenLine,
  Pin,
  Play,
  Plus,
  RotateCw,
  ScrollText,
  Send,
  Settings2,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  Wind,
  X,
  Zap,
} from 'lucide-react';
import { xeroStore, useXeroStore } from '../../core/store';
import { generateXeroReply } from '../../core/aiClient';
import { BUILTIN_TRACKS, SITUATION_VOICE_LINES, audioService } from '../../core/audioEngine';
import { extractWakeWordCommand } from '../../core/offlineEngine';
import { liveSessionController } from '../../core/liveSessionController';
import { buildRuntimeSystemPrompt } from '../../core/assistantPrompt';
import {
  buildWritePrompt,
  processDictationTranscript,
  runOfflineWriteTransform,
} from '../../core/dictationEngine';
import { EMOTION_SPECS, inferEmotionFromText } from '../../core/emotions';
import { getActiveLyricIndex } from '../../core/productivity';
import { computeRemainingSeconds } from '../../core/productivity';
import type {
  DictationStyle,
  InteractionMode,
  WriteTaskKind,
} from '../../core/types';
import { XeroFace } from './XeroFace';
import { NotchContextMenu } from './NotchContextMenu';

interface SpeechRecognitionResultLike {
  isFinal?: boolean;
  length: number;
  [index: number]: { transcript: string } | undefined;
}

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives?: number;
  onresult: ((ev: { results: ArrayLike<SpeechRecognitionResultLike> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

// Calibrated buttery physics springs: liquid overshoot on open, ultra-smooth settle on close/hide
const NOTCH_OPEN_SPRING = {
  type: 'spring' as const,
  stiffness: 390,
  damping: 27,
  mass: 0.72,
};

const NOTCH_CLOSE_SPRING = {
  type: 'spring' as const,
  stiffness: 460,
  damping: 35,
  mass: 0.68,
};

const WRITE_TASKS: Array<{ id: WriteTaskKind; label: string }> = [
  { id: 'email', label: 'Email' },
  { id: 'message', label: 'Message' },
  { id: 'note', label: 'Notes' },
  { id: 'summary', label: 'Summarize' },
  { id: 'grammar', label: 'Fix Grammar' },
  { id: 'rewrite', label: 'Rewrite' },
  { id: 'translate', label: 'Translate' },
  { id: 'explain-code', label: 'Explain Code' },
  { id: 'documentation', label: 'Docs' },
  { id: 'tone', label: 'Change Tone' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'expand', label: 'Expand' },
];

function formatClock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

function formatMs(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  const tenths = Math.floor((ms % 1000) / 100);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${tenths}`;
}

function formatNotchDateTime(date: Date): string {
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const day = date.getDate();
  const month = date.toLocaleDateString('en-GB', { month: 'short' });
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return `${weekday} ${day} ${month} ${time}`;
}

/** Animated inverted top bezel corner ear so the notch morphs smoothly without width pop */
const NotchCornerEar: React.FC<{
  side: 'left' | 'right';
  fill: string;
  visible: boolean;
  transition: Transition;
}> = ({ side, fill, visible, transition }) => (
  <motion.div
    aria-hidden="true"
    initial={false}
    animate={{ width: visible ? 16 : 0, opacity: visible ? 1 : 0 }}
    transition={transition}
    className={`shrink-0 pointer-events-none select-none overflow-hidden ${
      side === 'left' ? '-mr-px' : '-ml-px'
    }`}
  >
    <svg width="16" height="16" viewBox="0 0 16 16">
      <path
        d={
          side === 'left'
            ? 'M 0 0 L 16 0 L 16 16 C 16 6.5 9.5 0 0 0 Z'
            : 'M 16 0 L 0 0 L 0 16 C 0 6.5 6.5 0 16 0 Z'
        }
        fill={fill}
      />
    </svg>
  </motion.div>
);

export const DynamicIsland: React.FC = () => {
  const state = useXeroStore();
  const [hovered, setHovered] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const [nearTopBezel, setNearTopBezel] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1280
  );
  const [promptInput, setPromptInput] = useState('');
  const [dictationRaw, setDictationRaw] = useState('');
  const [dictationEdited, setDictationEdited] = useState('');
  const [writeTask, setWriteTask] = useState<WriteTaskKind>('email');
  const [writeInput, setWriteInput] = useState('');
  const [writeOutput, setWriteOutput] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [clipboardDraft, setClipboardDraft] = useState('');
  const [reminderDraft, setReminderDraft] = useState('');
  const [timersSubView, setTimersSubView] = useState<'timers' | 'lists' | 'notes' | 'watch'>('timers');
  const [todoDraft, setTodoDraft] = useState('');
  const [todoListType, setTodoListType] = useState<'todo' | 'shopping'>('todo');
  const [noteDraft, setNoteDraft] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [isDraggingIsland, setIsDraggingIsland] = useState(false);
  const [showShutterFlash, setShowShutterFlash] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');
  const [micUnavailable, setMicUnavailable] = useState(false);
  const [wakeWordStatus, setWakeWordStatus] = useState<'off' | 'armed' | 'unsupported' | 'blocked'>('off');
  const [now, setNow] = useState<Date>(() => new Date());
  const [showAllLyrics, setShowAllLyrics] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const wakeRecognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const asideRef = useRef<HTMLElement | null>(null);
  const executePromptRef = useRef<(raw: string) => Promise<void>>(async () => {});
  const toggleVoiceInputRef = useRef<() => void>(() => {});
  const handleWakeTranscriptRef = useRef<(chunk: string, onMatched?: () => void) => boolean>(() => false);
  const silenceTimerRef = useRef<number | null>(null);
  const followUpTimerRef = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    detachedDuringDrag: boolean;
  } | null>(null);

  const {
    settings,
    emotion,
    emotionNuance,
    islandMode,
    islandExpanded,
    interactionMode,
    activeWidgetTab,
    islandPosition,
    menuOpen,
    isListening,
    isThinking,
    isSpeaking,
    streamingText,
    isOnline,
    geminiConfigured,
    liveSupported,
    responseDepth,
    pendingConfirmation,
    liveSession,
    pokeTick,
    rapidPokeStreak,
    reactionWhisper,
    messages,
    timers,
    reminders,
    todos,
    notes,
    waterMl,
    stopwatch,
    clipboard,
    files,
    memories,
    notification,
    music,
    lyricsPinned,
    volume,
    muted,
    liveHud,
    screenshotFlashTick,
    screenAssistActive,
  } = state;

  const accent = settings.appearance.accentColor;
  const glow = settings.general.gamingMode ? 0.16 : settings.appearance.glowIntensity;
  const borderGlow = settings.appearance.borderIllumination ?? 0.45;
  const reducedMotion = settings.appearance.reducedMotion;
  const notchShape = settings.appearance.notchShape ?? 'bezel';
  const islandOpacity = settings.appearance.islandOpacity ?? 0.98;
  const notchBg = '#000000';

  // Keep live clock updated for HeyNixi-style top-right notch timestamp
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 15000);
    return () => window.clearInterval(id);
  }, []);

  // Track viewport width cleanly for clamped deterministic notch widths
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Dragging XERO out of the notch into a floating companion or back to top-center to re-dock
  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const drag = dragStartRef.current;
      if (!drag) return;
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.detachedDuringDrag && Math.hypot(dx, dy) < 28) return;

      drag.detachedDuringDrag = true;
      setIsDraggingIsland(true);
      const nextCenterX = Math.max(120, Math.min(window.innerWidth - 120, drag.origX + dx));
      const nextY = Math.max(0, Math.min(window.innerHeight - 90, drag.origY + dy));
      xeroStore.setIslandPosition({ docked: false, x: nextCenterX, y: nextY });
    };

    const onPointerUp = (e: PointerEvent) => {
      const drag = dragStartRef.current;
      dragStartRef.current = null;
      setIsDraggingIsland(false);
      if (!drag || !drag.detachedDuringDrag) return;

      // Magnetic snap back to top-center notch if dragged close to top-center
      const centerDist = Math.abs(e.clientX - window.innerWidth / 2);
      if (e.clientY <= 56 && centerDist <= 200) {
        xeroStore.resetIslandPosition();
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  // Detect cursor approaching top-center screen edge when tucked away
  useEffect(() => {
    if (islandMode !== 'minimized') {
      setNearTopBezel(false);
      return;
    }
    setHovered(false);
    setFocusWithin(false);
    const handleMove = (e: PointerEvent) => {
      const centerDist = Math.abs(e.clientX - window.innerWidth / 2);
      setNearTopBezel(e.clientY <= 44 && centerDist <= 220);
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, [islandMode]);

  // Guard against sticky focusWithin when a focused child button unmounts during morphs
  useEffect(() => {
    if (asideRef.current && !asideRef.current.contains(document.activeElement)) {
      setFocusWithin(false);
    }
  }, [islandMode, islandExpanded, menuOpen]);

  // Brief 2D shutter flash on snapshot
  useEffect(() => {
    if (!screenshotFlashTick || reducedMotion) return;
    setShowShutterFlash(true);
    const t = window.setTimeout(() => setShowShutterFlash(false), 320);
    return () => window.clearTimeout(t);
  }, [screenshotFlashTick, reducedMotion]);

  // Guided breathing phase cadence
  useEffect(() => {
    if (liveHud?.type !== 'breathing') return;
    const phases: Array<'Inhale' | 'Hold' | 'Exhale'> = ['Inhale', 'Hold', 'Exhale'];
    let idx = 0;
    setBreathPhase('Inhale');
    const timer = window.setInterval(() => {
      idx = (idx + 1) % phases.length;
      setBreathPhase(phases[idx]);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [liveHud?.type, liveHud?.tick]);

  // Scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current && islandExpanded && activeWidgetTab === 'chat' && interactionMode === 'command') {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, streamingText, islandExpanded, activeWidgetTab, interactionMode]);

  // Auto-collapse timer when idle
  useEffect(() => {
    const ms = settings.general.autoCollapseMs;
    if (!ms || (!islandExpanded && !menuOpen) || isListening || isThinking || hovered) return;
    const timer = window.setTimeout(() => {
      xeroStore.setIslandExpanded(false);
      xeroStore.setMenuOpen(false);
    }, ms);
    return () => window.clearTimeout(timer);
  }, [settings.general.autoCollapseMs, islandExpanded, menuOpen, isListening, isThinking, hovered]);

  // Live reactive formatting when dictationRaw or style changes
  useEffect(() => {
    if (!dictationRaw.trim()) {
      setDictationEdited('');
      return;
    }
    const processed = processDictationTranscript(dictationRaw, {
      style: settings.voice.dictationStyle,
      customVocabulary: settings.voice.customVocabulary,
    });
    setDictationEdited(processed);
  }, [dictationRaw, settings.voice.dictationStyle, settings.voice.customVocabulary]);

  useEffect(() => {
    liveSessionController.setCallbacks({
      onPhaseChange: (phase, statusText) => {
        xeroStore.setLiveSessionState({
          phase,
          statusText: statusText ?? null,
          muted: liveSessionController.isMuted(),
        });
        xeroStore.setListening(
          phase === 'listening' || phase === 'connecting' || phase === 'reconnecting'
        );
        xeroStore.setSpeaking(phase === 'speaking');
      },
      onTranscriptBatch: (inputDraft, outputDraft) => {
        xeroStore.setLiveSessionState({
          userTranscriptDraft: inputDraft,
          assistantTranscriptDraft: outputDraft,
        });
      },
      onTurnCommitted: (userText, assistantText, appliedLabels) => {
        xeroStore.setLiveSessionState({
          userTranscriptDraft: '',
          assistantTranscriptDraft: '',
        });
        if (userText) {
          xeroStore.addMessage({
            role: 'user',
            text: userText,
            emotion: inferEmotionFromText(userText, 'user'),
          });
        }
        if (assistantText) {
          const nextEmotion = inferEmotionFromText(assistantText, 'assistant');
          xeroStore.addMessage({
            role: 'assistant',
            text: assistantText,
            provider: 'gemini',
            emotion: nextEmotion,
            actionsApplied: appliedLabels.length > 0 ? appliedLabels : undefined,
          });
          xeroStore.setEmotion(nextEmotion);
        }
      },
      onToolActions: (actions) => {
        xeroStore.executeActions(actions);
      },
      onToolConfirmation: (confirmation) => {
        xeroStore.requestConfirmation({
          kind: confirmation.kind,
          summary: confirmation.summary,
          actionType: confirmation.action.type,
          payload: confirmation.action.payload,
        });
      },
      onMetricsUpdate: (metrics) => {
        xeroStore.setLiveSessionState({ metrics });
      },
      onError: (code, message) => {
        if (code === 'MIC_PERMISSION_DENIED' || code === 'MIC_UNAVAILABLE') {
          setMicUnavailable(true);
        }
        xeroStore.setListening(false);
        xeroStore.setSpeaking(false);
        xeroStore.pushNotification('Voice Switched to Chat', message, 'warning');
        xeroStore.setIslandExpanded(true, 'chat');
      },
    });

    return () => {
      liveSessionController.stop('Component unmounted');
      recognitionRef.current?.stop();
      wakeRecognitionRef.current?.stop();
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      if (followUpTimerRef.current) window.clearTimeout(followUpTimerRef.current);
    };
  }, []);

  // Ensure Live audio & WebSockets tear down cleanly whenever XERO hides or switches out of Command
  useEffect(() => {
    if (islandMode === 'minimized') {
      if (liveSessionController.getPhase() !== 'idle') {
        liveSessionController.stop('Hidden');
      }
      try {
        recognitionRef.current?.stop();
      } catch {
        // Ignore stop race
      }
    }
  }, [islandMode]);

  const activeTrack = BUILTIN_TRACKS[music.trackIndex % BUILTIN_TRACKS.length];
  const activeLyricIdx = getActiveLyricIndex(activeTrack.lyrics, music.elapsedSec);
  const activeLyric = activeTrack.lyrics[activeLyricIdx];
  const nextLyric = activeTrack.lyrics[activeLyricIdx + 1];
  const runningTimer = timers.find((t) => t.running);
  const timerRemaining = runningTimer ? computeRemainingSeconds(runningTimer) : 0;
  const timerProgress =
    runningTimer && runningTimer.durationSec > 0
      ? Math.max(0, Math.min(1, timerRemaining / runningTimer.durationSec))
      : 0;

  const isMinimized = islandMode === 'minimized';
  const isPeeking = isMinimized && (nearTopBezel || hovered || focusWithin);
  const isPanelOpen = !isMinimized && (islandExpanded || menuOpen);
  const isSingleRowSystemHud = !isMinimized && (liveHud?.type === 'volume' || liveHud?.type === 'system');
  const isLiveActive = liveSession.phase !== 'idle' && liveSession.phase !== 'error';
  const showFullControls =
    !isMinimized &&
    (isPanelOpen ||
      hovered ||
      focusWithin ||
      dragOver ||
      Boolean(liveHud) ||
      Boolean(notification) ||
      isListening ||
      isLiveActive ||
      isThinking ||
      isSpeaking ||
      screenAssistActive);

  // Deterministic width target (HeyNixi proportions: tucked 96/182px, compact 114px, hover/HUD 404-438px, expanded 576px)
  const targetWidthPx = isMinimized
    ? isPeeking
      ? 182
      : 94
    : isPanelOpen
      ? Math.min(576, viewportWidth - 24)
      : isSingleRowSystemHud
        ? Math.min(438, viewportWidth - 24)
        : liveHud || notification
          ? Math.min(404, viewportWidth - 24)
          : showFullControls
            ? Math.min(404, viewportWidth - 24)
            : music.playing || runningTimer
              ? 156
              : 114;

  const activeSpring = reducedMotion
    ? { duration: 0.01 }
    : isPanelOpen || Boolean(liveHud) || showFullControls || isPeeking
      ? NOTCH_OPEN_SPRING
      : NOTCH_CLOSE_SPRING;

  const showCornerEars =
    islandPosition.docked && notchShape === 'bezel' && !isPanelOpen && !isDraggingIsland;

  const getNotchShadowStyle = (): React.CSSProperties => {
    const borderAlpha = Math.round(Math.min(1, Math.max(0.06, borderGlow)) * 45)
      .toString(16)
      .padStart(2, '0');
    if (dragOver || liveHud?.type === 'screenshot') {
      return {
        boxShadow: `0 18px 44px rgba(0, 0, 0, 0.85), inset 0 0 0 1px ${accent}55`,
        borderColor: `${accent}88`,
      };
    }
    if (isThinking) {
      return {
        boxShadow: `0 18px 44px rgba(0, 0, 0, 0.85), 0 0 ${Math.round(12 * glow)}px rgba(156, 107, 255, 0.2)`,
        borderColor: 'rgba(156, 107, 255, 0.45)',
      };
    }
    if (isListening || isSpeaking || screenAssistActive) {
      return {
        boxShadow: `0 18px 44px rgba(0, 0, 0, 0.85), 0 0 ${Math.round(10 * glow)}px ${accent}22`,
        borderColor: `${accent}55`,
      };
    }
    return {
      boxShadow: showFullControls
        ? `0 22px 54px rgba(0, 0, 0, 0.85), 0 0 ${Math.round(8 * borderGlow)}px ${accent}14`
        : '0 10px 26px rgba(0, 0, 0, 0.72)',
      borderColor: showFullControls ? `${accent}${borderAlpha}` : 'rgba(255, 255, 255, 0.07)',
    };
  };

  const copyWithFeedback = (text: string, id: string) => {
    if (!text.trim()) return;
    void navigator.clipboard?.writeText(text).catch(() => {});
    xeroStore.addClipboardItem(text);
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
  };

  const triggerScreenAssist = async (promptText = 'Explain what is visible') => {
    xeroStore.setScreenAssistActive(true);
    try {
      const md = navigator.mediaDevices as MediaDevices & {
        getDisplayMedia?: (constraints?: MediaStreamConstraints) => Promise<MediaStream>;
      };
      if (md?.getDisplayMedia) {
        const stream = await md.getDisplayMedia({ video: true, audio: false });
        const video = document.createElement('video');
        video.srcObject = stream;
        await video.play();
        const canvas = document.createElement('canvas');
        canvas.width = Math.min(960, video.videoWidth || 640);
        canvas.height = Math.min(540, video.videoHeight || 360);
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/png');
          xeroStore.addShelfFile({
            name: `screen-assist-${Date.now().toString().slice(-4)}.png`,
            sizeBytes: Math.round((dataUrl.length * 3) / 4),
            mimeType: 'image/png',
            previewDataUrl: dataUrl,
            previewText: `Screen Assist capture for prompt: ${promptText}`,
          });
        }
        stream.getTracks().forEach((t) => t.stop());
        xeroStore.triggerTaskResultHud('Screen Frame Captured', 'Saved to Shelf for inspection');
        xeroStore.setScreenAssistActive(false);
        return;
      }
    } catch {
      // Fall back honestly to 2D workspace snapshot when browser sandbox cancels/blocks display sharing
    }
    xeroStore.triggerScreenshot();
    xeroStore.setScreenAssistActive(false);
    xeroStore.pushNotification(
      'Workspace Snapshot Used',
      'Display sharing declined or unavailable in sandbox; captured 2D workspace snapshot instead.',
      'info'
    );
  };

  const buildTelemetry = () => {
    const snap = xeroStore.getSnapshot();
    const curTrack = BUILTIN_TRACKS[snap.music.trackIndex % BUILTIN_TRACKS.length];
    return {
      timersCount: snap.timers.length,
      runningTimersCount: snap.timers.filter((t) => t.running).length,
      remindersCount: snap.reminders.filter((r) => !r.completed).length,
      pendingTodosCount: snap.todos.filter((t) => !t.done).length,
      notesCount: snap.notes.length,
      waterMl: snap.waterMl,
      clipboardCount: snap.clipboard.length,
      filesCount: snap.files.length,
      isOnline: snap.isOnline,
      musicPlaying: snap.music.playing,
      activeTrackTitle: curTrack.title,
      volume: snap.volume,
      muted: snap.muted,
      nightLight: snap.systemStatus.nightLight,
      brightness: snap.systemStatus.brightness,
      wakeLockActive: snap.systemStatus.wakeLockActive,
      batteryPct: snap.systemStatus.batteryPct,
      charging: snap.systemStatus.charging,
      recentTodoTitles: snap.todos.filter((t) => !t.done).slice(0, 5).map((t) => t.text),
      recentNoteTitles: snap.notes.slice(0, 5).map((n) => n.text),
    };
  };

  const executePrompt = async (rawPrompt: string) => {
    const text = rawPrompt.trim();
    if (!text || isThinking) return;

    setPromptInput('');
    xeroStore.setIslandExpanded(true, 'chat');
    xeroStore.addMessage({
      role: 'user',
      text,
      emotion: inferEmotionFromText(text, 'user'),
    });

    const snapBefore = xeroStore.getSnapshot();
    if (snapBefore.pendingConfirmation) {
      const lower = text.toLowerCase();
      if (/^(?:yes|yeah|yep|confirm|ok|okay|proceed|save|do it|go ahead)\b/i.test(lower)) {
        const resultText = xeroStore.resolvePendingConfirmation(true);
        xeroStore.addMessage({
          role: 'assistant',
          text: resultText,
          provider: 'offline',
          emotion: 'happy',
          actionsApplied: ['Confirmed'],
        });
        return;
      }
      if (/^(?:no|nope|cancel|stop|abort|never\s*mind|don't|dont)\b/i.test(lower)) {
        const resultText = xeroStore.resolvePendingConfirmation(false);
        xeroStore.addMessage({
          role: 'assistant',
          text: resultText,
          provider: 'offline',
          emotion: 'neutral',
        });
        return;
      }
    }

    xeroStore.setThinking(true);
    const startedAt = performance.now();

    const reply = await generateXeroReply({
      prompt: text,
      history: snapBefore.messages,
      settings: snapBefore.settings,
      memories: snapBefore.memories,
      responseDepth: snapBefore.responseDepth,
      contextSummary: buildTelemetry(),
      geminiAvailable: snapBefore.geminiConfigured,
      onStreamChunk: (partial) => {
        xeroStore.setStreamingText(partial);
      },
    });

    const elapsedMs = Math.max(1, Math.round(performance.now() - startedAt));
    const approxTokens = Math.max(1, Math.round(reply.text.length / 4));
    const activeModelLabel =
      reply.provider === 'local-llm'
        ? settings.ai.localModel || 'local-llm'
        : reply.provider === 'gemini'
          ? settings.ai.geminiModel
          : 'offline-core';
    xeroStore.recordLlmMetric({
      timestamp: Date.now(),
      provider: reply.provider,
      model: activeModelLabel,
      latencyMs: elapsedMs,
      outputChars: reply.text.length,
      tokensPerSec: Math.round((approxTokens / Math.max(0.05, elapsedMs / 1000)) * 10) / 10,
    });

    xeroStore.setThinking(false);

    const actionList = reply.actions && reply.actions.length > 0 ? reply.actions : reply.action ? [reply.action] : [];
    const nonScreenActions = actionList.filter((a) => a.type !== 'screen-assist');
    const screenAssistAction = actionList.find((a) => a.type === 'screen-assist');

    if (screenAssistAction) {
      void triggerScreenAssist(String(screenAssistAction.payload?.prompt || text));
    }
    if (nonScreenActions.length > 0) {
      xeroStore.executeActions(nonScreenActions);
    }

    const displayText = reply.fallbackNote ? `${reply.text}\n(${reply.fallbackNote})` : reply.text;

    xeroStore.addMessage({
      role: 'assistant',
      text: displayText,
      provider: reply.provider,
      emotion: reply.emotion,
      actionsApplied: reply.actionLabels,
    });
    xeroStore.setEmotion(reply.emotion);
    xeroStore.setSpeaking(true);

    audioService.speakText(reply.text, {
      enabled: settings.voice.ttsEnabled,
      responseMode: settings.voice.responseMode,
      rate: settings.voice.ttsRate,
      pitch: settings.voice.ttsPitch,
      lang: settings.voice.dictationLang,
    });

    const speakMs = Math.min(2600, Math.max(900, reply.text.length * 24));
    window.setTimeout(() => {
      xeroStore.setSpeaking(false);
    }, speakMs);
  };

  const executeWriteTask = async () => {
    const source = writeInput.trim();
    if (!source || isThinking) return;
    xeroStore.setThinking(true);
    const composedPrompt = buildWritePrompt(writeTask, source, settings.personalization.personalityTone);
    const offlineFallback = runOfflineWriteTransform(writeTask, source);

    if (settings.ai.providerMode === 'offline' || (!isOnline && settings.ai.providerMode === 'gemini')) {
      setWriteOutput(offlineFallback);
      xeroStore.setThinking(false);
      xeroStore.setEmotion('happy', false, 'satisfied');
      return;
    }

    const startedAt = performance.now();
    const reply = await generateXeroReply({
      prompt: composedPrompt,
      history: [],
      settings: xeroStore.getSnapshot().settings,
      memories: xeroStore.getSnapshot().memories,
      contextSummary: buildTelemetry(),
      geminiAvailable: geminiConfigured,
    });
    const elapsedMs = Math.max(1, Math.round(performance.now() - startedAt));
    const outText = reply.provider === 'offline' ? offlineFallback : reply.text;
    const approxTokens = Math.max(1, Math.round(outText.length / 4));
    xeroStore.recordLlmMetric({
      timestamp: Date.now(),
      provider: reply.provider,
      model:
        reply.provider === 'local-llm'
          ? settings.ai.localModel || 'local-llm'
          : reply.provider === 'gemini'
            ? settings.ai.geminiModel
            : 'offline-write',
      latencyMs: elapsedMs,
      outputChars: outText.length,
      tokensPerSec: Math.round((approxTokens / Math.max(0.05, elapsedMs / 1000)) * 10) / 10,
    });

    setWriteOutput(outText);
    xeroStore.setThinking(false);
    xeroStore.setEmotion('happy', false, 'satisfied');
    if (settings.voice.responseMode === 'chimes') {
      audioService.playSuccessChime(settings.general.soundEffects);
    }
  };

  const toggleVoiceInput = () => {
    const livePhase = liveSessionController.getPhase();
    if (livePhase === 'speaking') {
      liveSessionController.interruptSpeaking();
      return;
    }
    if (livePhase !== 'idle' && livePhase !== 'error') {
      liveSessionController.stop('Stopped');
      return;
    }

    if (isSpeaking) {
      // Self-trigger safeguard while non-Live TTS is speaking
      return;
    }
    if (isListening) {
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
      xeroStore.setListening(false);
      return;
    }

    // Prefer full-duplex Gemini Live voice when configured and in Command mode
    if (
      isOnline &&
      geminiConfigured &&
      liveSupported &&
      settings.ai.providerMode !== 'offline' &&
      interactionMode === 'command'
    ) {
      setMicUnavailable(false);
      xeroStore.setIslandExpanded(true, 'chat');
      const snap = xeroStore.getSnapshot();
      void liveSessionController.start({
        model: snap.settings.ai.liveModel,
        voiceName: snap.settings.ai.liveVoiceName,
        systemInstruction: buildRuntimeSystemPrompt({
          settings: snap.settings,
          memories: snap.memories,
          responseDepth: snap.responseDepth,
          forLiveAudio: true,
        }),
        micDeviceId: snap.settings.voice.micDeviceId,
        noiseSuppression: snap.settings.voice.noiseSuppression,
      });
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRec) {
      setMicUnavailable(true);
      xeroStore.setListening(false);
      xeroStore.pushNotification(
        'Voice Dictation Unavailable',
        'Web Speech API is unsupported in this browser. Type in Command, Dictate, or Write below.',
        'warning'
      );
      xeroStore.setIslandExpanded(true, 'chat');
      return;
    }

    try {
      setMicUnavailable(false);
      const rec = new SpeechRec();
      rec.lang = settings.voice.dictationLang;
      rec.interimResults = true;
      rec.continuous = interactionMode === 'dictate';
      recognitionRef.current = rec;
      xeroStore.setListening(true);
      xeroStore.setIslandExpanded(true, 'chat');

      const armSilenceStop = () => {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
        const timeoutMs = Math.max(2000, settings.voice.silenceTimeoutMs || 4500);
        silenceTimerRef.current = window.setTimeout(() => {
          recognitionRef.current?.stop();
        }, timeoutMs);
      };
      armSilenceStop();

      let finalTranscript = '';
      rec.onresult = (event) => {
        armSilenceStop();
        let combined = '';
        for (let i = 0; i < event.results.length; i += 1) {
          combined += event.results[i]?.[0]?.transcript ?? '';
        }
        finalTranscript = combined;
        if (interactionMode === 'dictate') {
          setDictationRaw(combined);
        } else if (interactionMode === 'write') {
          setWriteInput(combined);
        } else {
          setPromptInput(combined);
        }
      };

      rec.onerror = () => {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
        setMicUnavailable(true);
        xeroStore.setListening(false);
        xeroStore.pushNotification('Microphone Blocked', 'Allow mic permission or type directly.', 'error');
      };

      rec.onend = () => {
        if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
        xeroStore.setListening(false);
        if (interactionMode === 'command' && finalTranscript.trim()) {
          void executePrompt(finalTranscript);
        }
      };
      rec.start();
    } catch {
      setMicUnavailable(true);
      xeroStore.setListening(false);
    }
  };

  executePromptRef.current = executePrompt;
  toggleVoiceInputRef.current = toggleVoiceInput;

  const handleWakeTranscript = (chunk: string, onMatched?: () => void): boolean => {
    const match = extractWakeWordCommand(chunk, settings.voice.wakeWord);
    if (!match.matched) return false;

    onMatched?.();
    audioService.playPopChime(settings.general.soundEffects);
    xeroStore.wakeFromVoice(match.command ? `Heard "${settings.voice.wakeWord}"` : 'Listening~');

    if (match.command.length >= 2) {
      void executePromptRef.current(match.command);
    } else {
      window.setTimeout(() => toggleVoiceInputRef.current(), 90);
    }
    return true;
  };

  handleWakeTranscriptRef.current = handleWakeTranscript;

  // Allow Studio "Test Wake Command" or external triggers to verify custom wake words cleanly (single mount binding)
  useEffect(() => {
    const onSimulatedWake = (ev: Event) => {
      const detail = (ev as CustomEvent<{ phrase?: string }>).detail;
      if (!detail?.phrase) return;
      handleWakeTranscriptRef.current(detail.phrase);
    };
    window.addEventListener('xero:test-wake', onSimulatedWake);
    return () => window.removeEventListener('xero:test-wake', onSimulatedWake);
  }, []);

  // Lightweight Web Speech API Wake-word listener (low resource: 1 alt, latest-chunk only, backoff restarts)
  useEffect(() => {
    if (!settings.voice.wakeWordEnabled) {
      try {
        wakeRecognitionRef.current?.stop();
      } catch {
        // Ignore stop race
      }
      wakeRecognitionRef.current = null;
      setWakeWordStatus('off');
      return;
    }

    if (isListening || isSpeaking || isThinking) {
      try {
        wakeRecognitionRef.current?.stop();
      } catch {
        // Pause passive wakeup during active conversation/dictation
      }
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      setWakeWordStatus('unsupported');
      return;
    }

    let cancelled = false;
    let restartTimeout: number | null = null;
    let interimDebounceTimer: number | null = null;
    let backoffMs = 900;
    let lastHandledAt = 0;

    const clearInterimDebounce = () => {
      if (interimDebounceTimer !== null) {
        window.clearTimeout(interimDebounceTimer);
        interimDebounceTimer = null;
      }
    };

    const startWakeListener = () => {
      if (cancelled) return;
      try {
        const rec = new SpeechRec();
        rec.lang = settings.voice.dictationLang;
        rec.interimResults = true;
        rec.continuous = true;
        if ('maxAlternatives' in rec) {
          rec.maxAlternatives = 1;
        }
        wakeRecognitionRef.current = rec;

        rec.onresult = (event) => {
          if (cancelled) return;
          backoffMs = 900;
          const idx = event.results.length - 1;
          if (idx < 0) return;
          const resultItem = event.results[idx];
          const chunk = resultItem?.[0]?.transcript ?? '';
          if (!chunk.trim()) return;

          const nowTs = Date.now();
          if (nowTs - lastHandledAt < 1500) return;

          const triggerStop = () => {
            lastHandledAt = Date.now();
            cancelled = true;
            clearInterimDebounce();
            try {
              rec.stop();
            } catch {
              // Ignore stop race
            }
          };

          // Final results (or compact results without isFinal flag) fire immediately
          if (resultItem?.isFinal !== false) {
            clearInterimDebounce();
            handleWakeTranscriptRef.current(chunk, triggerStop);
            return;
          }

          // For interim chunks, briefly wait for trailing words ("Hey Xero" -> "set timer 2m")
          clearInterimDebounce();
          interimDebounceTimer = window.setTimeout(() => {
            interimDebounceTimer = null;
            if (!cancelled) {
              handleWakeTranscriptRef.current(chunk, triggerStop);
            }
          }, 360);
        };

        rec.onerror = (ev) => {
          const errCode = ev?.error || '';
          if (errCode === 'not-allowed' || errCode === 'service-not-allowed' || errCode === 'audio-capture') {
            cancelled = true;
            clearInterimDebounce();
            setWakeWordStatus('blocked');
          } else {
            backoffMs = Math.min(5000, Math.round(backoffMs * 1.6));
          }
        };

        rec.onend = () => {
          if (!cancelled) {
            const delay = backoffMs;
            backoffMs = Math.min(5000, Math.round(backoffMs * 1.5));
            restartTimeout = window.setTimeout(startWakeListener, delay);
          }
        };

        rec.start();
        setWakeWordStatus('armed');
      } catch {
        setWakeWordStatus('blocked');
      }
    };

    startWakeListener();

    return () => {
      cancelled = true;
      clearInterimDebounce();
      if (restartTimeout !== null) window.clearTimeout(restartTimeout);
      try {
        wakeRecognitionRef.current?.stop();
      } catch {
        // Ignore cleanup stop
      }
      wakeRecognitionRef.current = null;
    };
  }, [
    settings.voice.wakeWordEnabled,
    settings.voice.dictationLang,
    isListening,
    isSpeaking,
    isThinking,
  ]);

  const handleFilesDrop = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      if (file.type.startsWith('text/') || /\.(md|txt|json|ts|tsx|js|csv|py|log)$/i.test(file.name)) {
        reader.onload = () => {
          const previewText = typeof reader.result === 'string' ? reader.result.slice(0, 600) : undefined;
          xeroStore.addShelfFile({
            name: file.name,
            sizeBytes: file.size,
            mimeType: file.type || 'text/plain',
            previewText,
          });
        };
        reader.readAsText(file);
      } else if (file.type.startsWith('image/')) {
        reader.onload = () => {
          xeroStore.addShelfFile({
            name: file.name,
            sizeBytes: file.size,
            mimeType: file.type,
            previewDataUrl: typeof reader.result === 'string' ? reader.result : undefined,
          });
        };
        reader.readAsDataURL(file);
      } else {
        xeroStore.addShelfFile({
          name: file.name,
          sizeBytes: file.size,
          mimeType: file.type || 'application/octet-stream',
        });
      }
    });
    xeroStore.setIslandExpanded(true, 'files');
    xeroStore.pushNotification('File Shelf Updated', `Added ${fileList.length} item(s) to XERO shelf.`, 'success');
  };

  const downloadDataUrl = (dataUrl: string, fileName: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = fileName;
    a.click();
  };

  const providerBadgeText =
    settings.ai.providerMode === 'offline'
      ? 'Offline Core'
      : settings.ai.providerMode === 'local-llm'
        ? `Local · ${settings.ai.localModel || 'Ollama'}`
        : settings.ai.providerMode === 'gemini'
          ? geminiConfigured && isOnline
            ? 'Gemini Cloud'
            : 'Gemini (Offline Fallback)'
          : isOnline && geminiConfigured
            ? 'Auto · Gemini'
            : 'Auto · Local Core';

  const shapeClass = !islandPosition.docked
    ? 'rounded-[24px] border'
    : notchShape === 'pill'
      ? isPanelOpen
        ? 'rounded-[24px] border'
        : 'rounded-full border'
      : notchShape === 'squircle'
        ? 'rounded-[20px] border'
        : isPanelOpen
          ? 'rounded-b-[26px] border-x border-b border-t'
          : 'rounded-b-[20px] border-x border-b';

  const dockTopMarginClass =
    islandPosition.docked && (notchShape === 'pill' || notchShape === 'squircle') ? 'mt-2' : '';

  return (
    <>
      {/* Generous centered top-bezel proximity sensor so HeyNixi tucked notch wakes smoothly */}
      {isMinimized && islandPosition.docked && (
        <div
          aria-hidden="true"
          className="fixed top-0 inset-x-0 z-40 flex justify-center pointer-events-none"
        >
          <div
            onMouseEnter={() => setNearTopBezel(true)}
            onMouseLeave={() => setNearTopBezel(false)}
            className="w-[340px] h-7 pointer-events-auto"
          />
        </div>
      )}

      {/* Crisp 2D shutter pulse */}
      <AnimatePresence>
        {showShutterFlash && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0.48 }}
            animate={{ opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: 'easeOut' }}
            className="pointer-events-none fixed inset-0 z-[60] border-2"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.08)',
              borderColor: accent,
            }}
          />
        )}
      </AnimatePresence>

      {/* Single Continuous Top-Edge Living Notch — mathematically centered via inset-x-0 flex container */}
      <div
        className={
          islandPosition.docked
            ? `fixed inset-x-0 top-0 z-50 flex justify-center items-start pointer-events-none ${dockTopMarginClass}`
            : 'fixed inset-0 z-50 pointer-events-none'
        }
      >
      <aside
        ref={asideRef}
        aria-label={isMinimized ? 'XERO Assistant (Hidden Peek)' : 'XERO Floating Dynamic Island'}
        data-testid="xero-island"
        data-xero-mode={isMinimized ? 'minimized' : menuOpen ? 'menu' : islandExpanded ? 'expanded' : hovered ? 'hovered' : islandMode}
        data-xero-docked={islandPosition.docked ? 'true' : 'false'}
        data-xero-emotion={emotion}
        className={`pointer-events-auto flex items-start max-w-[calc(100vw-8px)] ${
          islandPosition.docked ? '' : 'fixed'
        }`}
        style={
          islandPosition.docked
            ? {
                transform: `scale(${settings.appearance.islandScale})`,
                transformOrigin: 'top center',
                opacity: islandOpacity,
              }
            : {
                left: `${Math.max(
                  targetWidthPx / 2 + 12,
                  Math.min(viewportWidth - targetWidthPx / 2 - 12, islandPosition.x)
                )}px`,
                top: `${islandPosition.y}px`,
                transform: `translateX(-50%) scale(${settings.appearance.islandScale})`,
                transformOrigin: 'top center',
                opacity: islandOpacity,
              }
        }
        onMouseEnter={() => {
          if (!isMinimized) {
            xeroStore.recordUserActivity();
          }
          setHovered(true);
        }}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setFocusWithin(false);
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const noteJson = e.dataTransfer.getData('application/x-xero-note');
          if (noteJson) {
            try {
              const note = JSON.parse(noteJson) as {
                name: string;
                sizeBytes: number;
                mimeType: string;
                previewText: string;
              };
              xeroStore.addShelfFile(note);
              xeroStore.setIslandExpanded(true, 'files');
              xeroStore.pushNotification('Dropped on Shelf', `${note.name} added to XERO.`, 'success');
              return;
            } catch {
              // Fall through to file drop
            }
          }
          handleFilesDrop(e.dataTransfer.files);
        }}
      >
        <NotchCornerEar
          side="left"
          fill={notchBg}
          visible={showCornerEars}
          transition={activeSpring}
        />

        <motion.div
          initial={false}
          animate={{
            width: targetWidthPx,
            y: isMinimized && islandPosition.docked ? (isPeeking ? 0 : -18) : 0,
          }}
          transition={activeSpring}
          className={`relative overflow-hidden bg-black backdrop-blur-2xl will-change-transform ${shapeClass} ${
            dragOver ? 'ring-1 ring-[#00E5FF]/70' : ''
          }`}
          style={getNotchShadowStyle()}
        >
          {/* NOTCH TOP BAR — adapts between HeyNixi idle face, compact hover/listen/system bar, and expanded 3-circle header */}
          <div
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
              const rect = e.currentTarget.getBoundingClientRect();
              dragStartRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                origX: islandPosition.docked ? rect.left + rect.width / 2 : islandPosition.x,
                origY: islandPosition.docked ? rect.top : islandPosition.y,
                detachedDuringDrag: false,
              };
            }}
            className="select-none cursor-grab active:cursor-grabbing"
          >
            {isPanelOpen ? (
              /* EXPANDED HEYNIXI TOP HEADER: 3 mode circles left | Live clock + clean tray icons right */
              <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2.5">
                <div className="flex items-center gap-1.5">
                  {(
                    [
                      { id: 'command', label: 'Command', icon: MousePointer },
                      { id: 'dictate', label: 'Dictate', icon: Mic },
                      { id: 'write', label: 'Write', icon: PenLine },
                    ] as Array<{
                      id: InteractionMode;
                      label: string;
                      icon: React.ComponentType<{ className?: string }>;
                    }>
                  ).map((mode) => {
                    const Icon = mode.icon;
                    const active =
                      !menuOpen && activeWidgetTab === 'chat' && interactionMode === mode.id;
                    return (
                      <button
                        key={mode.id}
                        type="button"
                        onClick={() => {
                          xeroStore.setMenuOpen(false);
                          xeroStore.setInteractionMode(mode.id);
                          xeroStore.setIslandExpanded(true, 'chat');
                        }}
                        aria-label={`${mode.label} mode`}
                        title={`${mode.label} mode`}
                        className={`relative w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer active:scale-[0.93] ${
                          active
                            ? 'text-[#050608]'
                            : 'bg-[#17181E] text-white/70 hover:text-white hover:bg-[#23252E] border border-white/[0.08]'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId={reducedMotion ? undefined : 'xero-mode-active-pill'}
                            transition={NOTCH_OPEN_SPRING}
                            className="absolute inset-0 rounded-full bg-white shadow-sm"
                          />
                        )}
                        <Icon className="relative z-10 w-3.5 h-3.5" />
                      </button>
                    );
                  })}

                  {!islandPosition.docked && (
                    <button
                      type="button"
                      onClick={() => xeroStore.resetIslandPosition()}
                      aria-label="Re-dock XERO to top notch"
                      className="ml-1 px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/18 text-[11px] text-white cursor-pointer active:scale-95 transition-transform"
                      title="Return XERO to top-center notch"
                    >
                      Dock
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <span className="hidden sm:inline text-[12px] font-medium text-white/80 tabular-nums mr-1.5">
                    {formatNotchDateTime(now)}
                  </span>

                  {(
                    [
                      { id: 'files', label: 'Shelf', title: 'File Shelf', icon: FolderOpen },
                      { id: 'timers', label: 'Timers & Reminders', title: 'Timers & Notes', icon: Clock },
                      { id: 'music', label: 'Now Playing Music', title: 'Music & Lyrics', icon: Music },
                      { id: 'clipboard', label: 'Clipboard History', title: 'Clipboard', icon: Clipboard },
                    ] as const
                  ).map((tray) => {
                    const TrayIcon = tray.icon;
                    const active = !menuOpen && activeWidgetTab === tray.id;
                    return (
                      <button
                        key={tray.id}
                        type="button"
                        onClick={() => {
                          xeroStore.setMenuOpen(false);
                          xeroStore.setIslandExpanded(true, tray.id);
                        }}
                        aria-label={tray.label}
                        title={tray.title}
                        className={`relative p-1.5 rounded-full transition-colors cursor-pointer active:scale-[0.93] ${
                          active
                            ? 'text-[#050608]'
                            : 'text-white/70 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {active && (
                          <motion.span
                            layoutId={reducedMotion ? undefined : 'xero-tray-active-pill'}
                            transition={NOTCH_OPEN_SPRING}
                            className="absolute inset-0 rounded-full bg-white"
                          />
                        )}
                        <TrayIcon className="relative z-10 w-3.5 h-3.5" />
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => xeroStore.setMenuOpen(!menuOpen)}
                    aria-label={menuOpen ? 'Close contextual menu' : 'Open contextual menu'}
                    aria-expanded={menuOpen}
                    title="All Controls & Widgets"
                    className={`relative p-1.5 rounded-full transition-colors cursor-pointer active:scale-[0.93] ${
                      menuOpen
                        ? 'text-[#050608]'
                        : 'text-white/70 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    {menuOpen && (
                      <motion.span
                        layoutId={reducedMotion ? undefined : 'xero-tray-active-pill'}
                        transition={NOTCH_OPEN_SPRING}
                        className="absolute inset-0 rounded-full bg-white"
                      />
                    )}
                    <LayoutGrid className="relative z-10 w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => xeroStore.openStudio()}
                    aria-label="Open XERO Studio"
                    title="Open independent XERO Studio window"
                    className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      xeroStore.setIslandExpanded(false);
                      xeroStore.setMenuOpen(false);
                    }}
                    aria-label="Collapse Dynamic Island"
                    title="Collapse Notch"
                    className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : liveHud?.type === 'volume' ? (
              /* HEYNIXI SINGLE-ROW VOLUME HUD BAR: [Face] Volume ━━━━━━━─── 42 */
              <div
                role="status"
                data-testid="xero-volume-hud"
                className="flex items-center gap-3 px-4 py-2"
              >
                <button
                  type="button"
                  onClick={() => xeroStore.petXero()}
                  aria-label="Pet XERO"
                  className="shrink-0 cursor-pointer"
                >
                  <XeroFace
                    emotion={emotion}
                    nuance={emotionNuance}
                    isSpeaking={isSpeaking}
                    isListening={isListening}
                    musicPlaying={music.playing}
                    pokeTick={pokeTick}
                    rapidPokeStreak={rapidPokeStreak}
                    faceColor={settings.appearance.faceColor}
                    accentColor={accent}
                    reducedMotion={reducedMotion}
                    size="compact"
                  />
                </button>

                <button
                  type="button"
                  onClick={() => xeroStore.toggleMute()}
                  aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                  className="flex items-center gap-1.5 text-[13px] font-semibold text-white hover:opacity-80 shrink-0 cursor-pointer"
                >
                  {muted || volume === 0 ? (
                    <VolumeX className="w-3.5 h-3.5 text-[#FF4567]" />
                  ) : null}
                  <span>Volume</span>
                </button>

                <div
                  className="relative flex-1 flex items-center h-6"
                  aria-label={`Volume level ${muted ? 0 : volume}%`}
                >
                  {/* Continuous buttery spring progress track underneath clickable segments */}
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 h-[5px] rounded-full bg-white/15 overflow-hidden">
                    <motion.div
                      initial={false}
                      animate={{ scaleX: (muted ? 0 : volume) / 100 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.55 }}
                      className="h-full w-full origin-left bg-white rounded-full"
                    />
                  </div>
                  <div className="relative z-10 flex-1 flex items-center gap-[2px] h-full">
                    {Array.from({ length: 12 }).map((_, idx) => {
                      const targetPct = Math.round(((idx + 1) / 12) * 100);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => xeroStore.setVolume(targetPct)}
                          aria-label={`Set volume to ${targetPct}%`}
                          className="flex-1 h-full flex items-center cursor-pointer active:scale-y-125 transition-transform"
                        >
                          <span className="w-full h-[5px]" />
                        </button>
                      );
                    })}
                  </div>
                </div>

                <span className="font-mono-tabular text-[13px] font-semibold text-white w-9 text-right shrink-0">
                  {muted ? 'MUTE' : `${volume}`}
                </span>
              </div>
            ) : liveHud?.type === 'system' ? (
              /* HEYNIXI SINGLE-ROW SYSTEM HUD BAR: [Face] Label ━━━━━━━─── Value */
              <div
                role="status"
                data-testid="xero-system-hud"
                className="flex items-center gap-3 px-4 py-2"
              >
                <XeroFace
                  emotion={emotion}
                  nuance={emotionNuance}
                  pokeTick={pokeTick}
                  rapidPokeStreak={rapidPokeStreak}
                  faceColor={settings.appearance.faceColor}
                  accentColor={accent}
                  reducedMotion={reducedMotion}
                  size="compact"
                />
                <span className="text-[13px] font-semibold text-white whitespace-nowrap shrink-0">
                  {liveHud.label}
                </span>
                <div className="flex-1 h-[5px] rounded-full bg-white/16 overflow-hidden">
                  <motion.div
                    className="h-full w-full origin-left rounded-full bg-white"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: (liveHud.value ?? 96) / 100 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 28 }}
                  />
                </div>
                <span className="font-mono-tabular text-[13px] font-semibold text-white shrink-0">
                  {liveHud.value ?? 100}%
                </span>
                <button
                  type="button"
                  onClick={() => xeroStore.dismissLiveHud()}
                  aria-label="Close system HUD"
                  className="p-1 text-white/55 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : isMinimized ? (
              /* HEYNIXI TUCKED / PEEK STATE INSIDE CONTINUOUS NOTCH */
              <div
                className="flex flex-col items-center justify-center px-3 pt-1"
                style={{ paddingBottom: isPeeking ? 6 : 4 }}
              >
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      (e.currentTarget as HTMLElement).blur();
                      setHovered(false);
                      setFocusWithin(false);
                      setNearTopBezel(false);
                      audioService.playPopChime(settings.general.soundEffects);
                      xeroStore.setIslandExpanded(false);
                    }}
                    aria-label="Restore XERO Dynamic Island"
                    title="Click to bring XERO back down (or Alt+H)"
                    className="flex items-center gap-1.5 cursor-pointer focus-visible:outline-2 focus-visible:outline-white/70 rounded-full"
                  >
                    <XeroFace
                      emotion={isPeeking ? 'curious' : 'sleepy'}
                      nuance={isPeeking ? 'waking' : 'relaxed'}
                      peeking={isPeeking}
                      pokeTick={pokeTick}
                      rapidPokeStreak={rapidPokeStreak}
                      faceColor={settings.appearance.faceColor}
                      accentColor={accent}
                      reducedMotion={reducedMotion}
                      size="mini"
                    />
                    {isPeeking && (
                      <span className="text-[11px] font-medium text-white/80 whitespace-nowrap pr-0.5">
                        Peek
                      </span>
                    )}
                  </button>
                  <AnimatePresence initial={false}>
                    {isPeeking && (
                      <motion.button
                        key="peek-studio"
                        initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={reducedMotion ? undefined : { opacity: 0, scale: 0.85 }}
                        transition={{ duration: 0.14 }}
                        type="button"
                        onClick={() => xeroStore.openStudio()}
                        aria-label="Open XERO Studio"
                        className="p-1 rounded-full text-white/60 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        <Settings2 className="w-3.5 h-3.5" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
                {!isPeeking && (
                  <span
                    aria-hidden="true"
                    className="mt-1 w-7 h-[2px] rounded-full bg-white/30"
                  />
                )}
              </div>
            ) : (
              /* IDLE RESTING NOTCH (pure black + centered XeroFace) OR COMPACT HOVER/LISTENING PILL */
              <div
                className={`flex items-center ${
                  showFullControls ? 'justify-between gap-2.5 px-3.5 py-1.5' : 'justify-center gap-2 px-4 py-1.5'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => xeroStore.petXero()}
                    onDoubleClick={() => xeroStore.setIslandExpanded(!islandExpanded, 'chat')}
                    aria-label="Pet XERO"
                    title="Click to pet XERO · Double-click to open Assistant · Drag to float"
                    className="rounded-xl px-0.5 hover:bg-white/[0.04] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-white/70 shrink-0"
                  >
                    <XeroFace
                      emotion={dragOver ? 'surprised' : emotion}
                      nuance={emotionNuance}
                      isSpeaking={isSpeaking}
                      isListening={isListening}
                      musicPlaying={music.playing}
                      pokeTick={pokeTick}
                      rapidPokeStreak={rapidPokeStreak}
                      faceColor={settings.appearance.faceColor}
                      accentColor={accent}
                      reducedMotion={reducedMotion}
                      size="compact"
                    />
                  </button>

                  {!showFullControls && music.playing && (
                    <span className="flex items-end gap-0.5 h-3 pr-0.5" aria-hidden="true">
                      {[0, 1, 2].map((bar) => (
                        <motion.span
                          key={bar}
                          className="w-0.5 rounded-full bg-white/85"
                          animate={reducedMotion ? { height: 6 } : { height: ['3px', '10px', '4px'] }}
                          transition={{ repeat: Infinity, duration: 0.65, delay: bar * 0.14, ease: 'easeInOut' }}
                        />
                      ))}
                    </span>
                  )}

                  {!showFullControls && !music.playing && runningTimer && (
                    <span className="font-mono-tabular text-[11px] font-medium text-white/85 pr-0.5">
                      {formatClock(timerRemaining)}
                    </span>
                  )}

                  <AnimatePresence initial={false}>
                    {showFullControls && (
                      <motion.button
                        key="notch-label"
                        type="button"
                        initial={reducedMotion ? false : { opacity: 0, x: -4 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={reducedMotion ? undefined : { opacity: 0, x: -4 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => {
                          audioService.playPopChime(settings.general.soundEffects);
                          xeroStore.setIslandExpanded(true, 'chat');
                        }}
                        aria-expanded={islandExpanded}
                        aria-label="Expand XERO Dynamic Island"
                        className="flex items-center gap-2 min-w-0 text-left cursor-pointer rounded-lg px-1 py-0.5"
                      >
                        {isLiveActive || isListening ? (
                          <span className="text-[13px] font-medium text-white truncate max-w-[215px]">
                            {liveSession.userTranscriptDraft ||
                              liveSession.assistantTranscriptDraft ||
                              liveSession.statusText ||
                              promptInput ||
                              dictationRaw ||
                              writeInput ||
                              'Listening…'}
                            <span className="inline-block w-[1.5px] h-3.5 bg-white/85 ml-0.5 align-middle animate-pulse" />
                          </span>
                        ) : screenAssistActive ? (
                          <span className="text-[12.5px] font-medium text-white/90 whitespace-nowrap">
                            Capturing screen…
                          </span>
                        ) : isThinking ? (
                          <span className="text-[12.5px] font-medium text-white/85 whitespace-nowrap">
                            Thinking…
                          </span>
                        ) : dragOver ? (
                          <span className="text-[12.5px] font-medium text-white whitespace-nowrap">
                            Drop onto Shelf!
                          </span>
                        ) : runningTimer ? (
                          <span className="flex items-center gap-1.5 font-mono-tabular text-[12px] text-white whitespace-nowrap">
                            <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 -rotate-90">
                              <circle cx="7" cy="7" r="5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2" />
                              <circle
                                cx="7"
                                cy="7"
                                r="5"
                                fill="none"
                                stroke="#FFFFFF"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeDasharray={31.42}
                                strokeDashoffset={31.42 * (1 - timerProgress)}
                              />
                            </svg>
                            <span>{formatClock(timerRemaining)}</span>
                          </span>
                        ) : music.playing ? (
                          <span className="text-[12.5px] font-medium text-white/90 whitespace-nowrap truncate max-w-[155px]">
                            {activeTrack.title}
                          </span>
                        ) : (
                          <span className="text-[13px] font-medium text-white/80 whitespace-nowrap">
                            Ask {settings.personalization.assistantName}…
                          </span>
                        )}
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>

                {/* Right compact controls on hover or pure white waveform when listening */}
                <AnimatePresence initial={false}>
                  {showFullControls && (
                    <motion.div
                      key="notch-actions"
                      initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={reducedMotion ? undefined : { opacity: 0, scale: 0.96 }}
                      transition={{ duration: 0.14 }}
                      className="flex items-center gap-0.5 shrink-0"
                    >
                      {!islandPosition.docked && (
                        <button
                          type="button"
                          onClick={() => xeroStore.resetIslandPosition()}
                          aria-label="Re-dock XERO to top notch"
                          className="px-2 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[10px] text-white cursor-pointer mr-1"
                        >
                          Dock
                        </button>
                      )}

                      {isLiveActive ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              const nextMute = !liveSessionController.isMuted();
                              liveSessionController.setMuted(nextMute);
                              xeroStore.setLiveSessionState({ muted: nextMute });
                            }}
                            aria-label={liveSession.muted ? 'Unmute Live mic' : 'Mute Live mic'}
                            title={liveSession.muted ? 'Unmute mic' : 'Mute mic'}
                            className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                              liveSession.muted
                                ? 'text-[#FFC857] bg-[#FFC857]/12'
                                : 'text-white/75 hover:text-white hover:bg-white/10'
                            }`}
                          >
                            {liveSession.muted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            type="button"
                            onClick={toggleVoiceInput}
                            aria-label={liveSession.phase === 'speaking' ? 'Interrupt assistant' : 'End Live voice'}
                            className="flex items-center gap-[2.5px] px-2 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
                            title={liveSession.phase === 'speaking' ? 'Click to interrupt' : 'Listening… click to stop'}
                          >
                            {[7, 13, 10, 15, 7].map((maxH, idx) => (
                              <motion.span
                                key={idx}
                                className="w-[2px] rounded-full bg-white"
                                animate={
                                  reducedMotion || liveSession.muted
                                    ? { height: 5 }
                                    : { height: [4, maxH, 5] }
                                }
                                transition={{
                                  repeat: reducedMotion || liveSession.muted ? 0 : Infinity,
                                  duration: 0.55,
                                  delay: idx * 0.08,
                                  ease: 'easeInOut',
                                }}
                              />
                            ))}
                          </button>
                          <button
                            type="button"
                            onClick={() => liveSessionController.stop('Ended by user')}
                            aria-label="Close Live session"
                            title="End voice session"
                            className="p-1 rounded-full text-white/60 hover:text-[#FF4567] hover:bg-white/10 cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : isListening ? (
                        <button
                          type="button"
                          onClick={toggleVoiceInput}
                          aria-label="Stop voice listening"
                          className="flex items-center gap-[2.5px] px-2 py-1.5 rounded-full hover:bg-white/10 cursor-pointer"
                          title="Listening… click to stop"
                        >
                          {[7, 13, 10, 15, 7].map((maxH, idx) => (
                            <motion.span
                              key={idx}
                              className="w-[2px] rounded-full bg-white"
                              animate={
                                reducedMotion
                                  ? { height: maxH * 0.7 }
                                  : { height: [4, maxH, 5] }
                              }
                              transition={{
                                repeat: Infinity,
                                duration: 0.55,
                                delay: idx * 0.08,
                                ease: 'easeInOut',
                              }}
                            />
                          ))}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={toggleVoiceInput}
                            aria-label="Start voice command"
                            className={`relative p-1.5 rounded-full transition-colors cursor-pointer ${
                              micUnavailable
                                ? 'text-[#FF4567]/85 hover:bg-white/10'
                                : 'text-white/70 hover:text-white hover:bg-white/10'
                            }`}
                            title={
                              micUnavailable
                                ? 'Microphone unavailable'
                                : wakeWordStatus === 'armed'
                                  ? `Voice command · Wake word "${settings.voice.wakeWord}" armed`
                                  : 'Voice command'
                            }
                          >
                            {micUnavailable ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                            {settings.voice.wakeWordEnabled && (
                              <span
                                aria-hidden="true"
                                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full"
                                style={{
                                  backgroundColor:
                                    wakeWordStatus === 'armed'
                                      ? '#39FF88'
                                      : wakeWordStatus === 'blocked' || wakeWordStatus === 'unsupported'
                                        ? '#FFC857'
                                        : accent,
                                }}
                              />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => xeroStore.setMenuOpen(!menuOpen)}
                            aria-label={menuOpen ? 'Close contextual menu' : 'Open contextual menu'}
                            aria-expanded={menuOpen}
                            title="All Controls & Widgets"
                            className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <LayoutGrid className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => xeroStore.openStudio()}
                            aria-label="Open XERO Studio"
                            title="Open independent XERO Studio window"
                            className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <Settings2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => xeroStore.setIslandMode('minimized')}
                            aria-label="Hide XERO"
                            title="Hide XERO into top bezel"
                            className="p-1.5 rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Subtle bottom GPU-composited media progress hairline when playing compact */}
          {settings.appearance.showMediaProgress && music.playing && !isMinimized && !isPanelOpen && !liveHud && (
            <div className="h-[2px] w-full bg-white/10 overflow-hidden">
              <motion.div
                initial={false}
                animate={{ scaleX: Math.min(1, Math.max(0, music.elapsedSec / activeTrack.durationSec)) }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className="h-full w-full origin-left bg-white"
              />
            </div>
          )}

          {/* SUB-HUD CARDS (Screenshot, Breathing, Task Result) */}
          <AnimatePresence>
            {liveHud && !isSingleRowSystemHud && (
              <motion.div
                key={liveHud.type}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={NOTCH_CLOSE_SPRING}
                className="overflow-hidden px-3 pb-3"
              >
                {liveHud.type === 'screenshot' && (
                  <div
                    role="status"
                    data-testid="xero-screenshot-hud"
                    className="p-3 rounded-[18px] bg-[#121317] border border-white/[0.07] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {liveHud.previewDataUrl && (
                        <motion.img
                          initial={{ scale: 0.72, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={NOTCH_OPEN_SPRING}
                          src={liveHud.previewDataUrl}
                          alt="Captured 2D workspace snapshot"
                          className="w-14 h-8 rounded-md object-cover border border-white/20 shrink-0"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">Snapshot Captured</div>
                        <div className="text-[11px] font-mono-tabular text-white/55 truncate">
                          {liveHud.label} · Saved to Shelf
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {liveHud.previewDataUrl && (
                        <button
                          type="button"
                          onClick={() => downloadDataUrl(liveHud.previewDataUrl!, liveHud.label)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-[#050608] text-[11px] font-semibold cursor-pointer"
                        >
                          <Download className="w-3 h-3" />
                          <span>Save PNG</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          xeroStore.dismissLiveHud();
                          xeroStore.setIslandExpanded(true, 'files');
                        }}
                        className="px-2.5 py-1 rounded-full bg-[#22242C] hover:bg-[#2E313B] text-[11px] text-white cursor-pointer"
                      >
                        Shelf
                      </button>
                    </div>
                  </div>
                )}

                {liveHud.type === 'breathing' && (
                  <div
                    role="status"
                    data-testid="xero-breathing-hud"
                    className="p-3 rounded-[18px] bg-[#121317] border border-white/[0.07] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                        <motion.span
                          className="absolute inset-0 rounded-full border-2 border-[#FF5CA1]"
                          animate={
                            reducedMotion
                              ? { scale: 1 }
                              : breathPhase === 'Inhale'
                                ? { scale: 1.18, opacity: 1 }
                                : breathPhase === 'Hold'
                                  ? { scale: 1.18, opacity: 0.7 }
                                  : { scale: 0.72, opacity: 0.45 }
                          }
                          transition={{ duration: 2.6, ease: 'easeInOut' }}
                        />
                        <Wind className="w-4 h-4 text-[#FF5CA1]" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white">{breathPhase} slowly…</div>
                        <div className="text-[11px] text-white/55">2D guided calm breathing rhythm</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => xeroStore.dismissLiveHud()}
                      className="px-3 py-1 rounded-full bg-[#22242C] hover:bg-[#2E313B] text-[11px] text-white cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                )}

                {liveHud.type === 'task-result' && (
                  <div
                    role="status"
                    data-testid="xero-task-result-hud"
                    className="p-3 rounded-[18px] bg-[#121317] border border-white/[0.07] flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check className="w-4 h-4 text-[#39FF88] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{liveHud.label}</div>
                        {liveHud.detail && (
                          <div className="text-[11px] text-white/55 truncate">{liveHud.detail}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {liveHud.detail?.startsWith('https://') && (
                        <a
                          href={liveHud.detail}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-[#050608] text-[11px] font-semibold cursor-pointer"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Open</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => xeroStore.dismissLiveHud()}
                        aria-label="Dismiss result"
                        className="p-1 text-white/55 hover:text-white cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* INLINE NOTIFICATION BANNER */}
          <AnimatePresence>
            {notification && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mx-3 mb-2.5 px-3 py-2 rounded-2xl bg-[#181A20] border border-white/10 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-white mr-1.5">{notification.title}:</span>
                    <span className="text-white/60">{notification.detail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => xeroStore.dismissNotification()}
                    aria-label="Dismiss notification"
                    className="text-white/55 hover:text-white p-0.5 shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* UNIFIED EXPANDABLE NOTCH DRAWER (Smooth continuous height + inner AnimatePresence crossfade) */}
          <AnimatePresence initial={false}>
            {isPanelOpen && (
              <motion.div
                key="unified-notch-drawer"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={activeSpring}
                className="overflow-hidden max-h-[calc(100dvh-56px)] sm:max-h-none overflow-y-auto sm:overflow-y-hidden"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {menuOpen ? (
                    <motion.div
                      key="drawer-menu"
                      initial={reducedMotion ? false : { opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
                      transition={{ duration: reducedMotion ? 0.01 : 0.1, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <NotchContextMenu />
                    </motion.div>
                  ) : (
                    <motion.div
                      key={`drawer-${activeWidgetTab}`}
                      initial={reducedMotion ? false : { opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reducedMotion ? undefined : { opacity: 0, y: -4 }}
                      transition={{ duration: reducedMotion ? 0.01 : 0.1, ease: [0.16, 1, 0.3, 1] }}
                      className="px-3 pb-3"
                    >
                  {/* MUSIC VIEW: HEYNIXI SPLIT CARD (Artwork/Seek/Controls LEFT | Synced Lyrics RIGHT) */}
                  {activeWidgetTab === 'music' ? (
                    <div className="rounded-[20px] bg-[#121317] border border-white/[0.06] p-4 flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 min-w-0 flex flex-col justify-between gap-3">
                        <div className="flex items-center justify-between gap-2.5">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center border border-white/12 shadow-inner"
                              style={{
                                background: `linear-gradient(155deg, ${activeTrack.accent} 0%, #311B4E 55%, #161822 100%)`,
                              }}
                            >
                              <Music className="w-5 h-5 text-white drop-shadow" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[13.5px] font-semibold text-white truncate">
                                {activeTrack.title}
                              </div>
                              <div className="text-[11.5px] text-white/55 truncate">
                                {activeTrack.artist}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => xeroStore.petXero()}
                              aria-label="Pet XERO"
                              title="XERO vibes with your music"
                              className="rounded-lg px-1 py-0.5 bg-[#1A1C22] border border-white/[0.05] cursor-pointer"
                            >
                              <XeroFace
                                emotion={emotion}
                                nuance={emotionNuance}
                                musicPlaying={music.playing}
                                pokeTick={pokeTick}
                                rapidPokeStreak={rapidPokeStreak}
                                faceColor={settings.appearance.faceColor}
                                accentColor={accent}
                                reducedMotion={reducedMotion}
                                size="mini"
                              />
                            </button>
                            <button
                              type="button"
                              onClick={() => xeroStore.toggleLyricsPinned()}
                              aria-label={lyricsPinned ? 'Unpin lyrics' : 'Pin lyrics'}
                              title={lyricsPinned ? 'Unpin floating lyrics' : 'Pin floating lyrics'}
                              className={`p-1.5 rounded-full border cursor-pointer transition-colors ${
                                lyricsPinned
                                  ? 'bg-white text-[#050608] border-white'
                                  : 'bg-[#1B1D24] border-white/[0.08] text-white/65 hover:text-white'
                              }`}
                            >
                              <Pin className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        <div>
                          <input
                            type="range"
                            aria-label="Seek audio position"
                            min={0}
                            max={activeTrack.durationSec}
                            value={Math.floor(music.elapsedSec)}
                            onChange={(e) => xeroStore.seekMusic(Number(e.target.value))}
                            className="w-full h-1 accent-white cursor-pointer"
                          />
                          <div className="flex items-center justify-between font-mono-tabular text-[10px] text-white/45 mt-0.5">
                            <span>{formatClock(music.elapsedSec)}</span>
                            <span>-{formatClock(Math.max(0, activeTrack.durationSec - music.elapsedSec))}</span>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => xeroStore.prevTrack()}
                              aria-label="Previous track"
                              className="p-1.5 rounded-full text-white/75 hover:text-white hover:bg-white/10 cursor-pointer"
                            >
                              <SkipBack className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => (music.playing ? xeroStore.pauseMusic() : xeroStore.playMusic())}
                              aria-label={music.playing ? 'Pause music' : 'Play music'}
                              className="w-8 h-8 rounded-full bg-white text-[#050608] flex items-center justify-center hover:opacity-90 cursor-pointer"
                            >
                              {music.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => xeroStore.nextTrack()}
                              aria-label="Next track"
                              className="p-1.5 rounded-full text-white/75 hover:text-white hover:bg-white/10 cursor-pointer"
                            >
                              <SkipForward className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex items-center gap-1.5 w-24">
                            <button
                              type="button"
                              onClick={() => xeroStore.toggleMute()}
                              aria-label={muted ? 'Unmute' : 'Mute'}
                              className="text-white/60 hover:text-white cursor-pointer"
                            >
                              {muted || volume === 0 ? (
                                <VolumeX className="w-3.5 h-3.5 text-[#FF4567]" />
                              ) : (
                                <Volume2 className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={muted ? 0 : volume}
                              onChange={(e) => xeroStore.setVolume(Number(e.target.value))}
                              aria-label="Master Volume"
                              className="flex-1 min-w-0 h-1 accent-white cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Right Synced Lyrics Pane */}
                      <div className="sm:w-[44%] sm:border-l sm:border-white/[0.08] sm:pl-4 pt-3 sm:pt-0 border-t sm:border-t-0 border-white/[0.06] flex flex-col justify-center min-w-0">
                        {showAllLyrics ? (
                          <div className="max-h-28 overflow-y-auto space-y-1 pr-1">
                            {activeTrack.lyrics.map((line, idx) => (
                              <button
                                key={`${line.timeSec}-${idx}`}
                                type="button"
                                onClick={() => xeroStore.seekMusic(line.timeSec)}
                                className={`w-full text-left text-[11.5px] leading-snug rounded px-1.5 py-0.5 cursor-pointer transition-colors ${
                                  idx === activeLyricIdx
                                    ? 'text-white font-semibold bg-white/[0.07]'
                                    : 'text-white/40 hover:text-white/75'
                                }`}
                              >
                                {line.text}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div>
                            <div className="text-[13.5px] font-semibold text-white leading-snug">
                              {activeLyric?.text || 'Instrumental wave…'}
                            </div>
                            {nextLyric && (
                              <div className="text-[12.5px] text-white/40 leading-snug mt-1.5">
                                {nextLyric.text}
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => setShowAllLyrics((v) => !v)}
                          className="self-start mt-2.5 text-[10px] text-white/45 hover:text-white/80 cursor-pointer"
                        >
                          {showAllLyrics ? 'Compact lyrics' : 'All synced lyrics'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* TWO-COLUMN HEYNIXI CARD: Left XeroFace Character Stage + Right Active View */
                    <div className="rounded-[20px] bg-[#121317] border border-white/[0.06] p-4 flex flex-col sm:flex-row gap-4">
                      {/* Left Character Portrait Stage (Single seamless HeyNixi capsule hosting protected XeroFace) */}
                      <button
                        type="button"
                        onClick={() => xeroStore.petXero()}
                        aria-label="Pet XERO"
                        title="Pet XERO · Expressive companion face"
                        className="sm:w-[144px] shrink-0 rounded-[18px] bg-[#0B0C10] hover:bg-[#16181F] border flex sm:flex-col items-center justify-between sm:justify-center gap-2 px-3 py-2.5 sm:py-3.5 transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-white/70"
                        style={{
                          borderColor:
                            isThinking || isListening
                              ? `${accent}55`
                              : 'rgba(255, 255, 255, 0.05)',
                          boxShadow:
                            isThinking || isListening
                              ? `inset 0 0 18px ${accent}14`
                              : undefined,
                        }}
                      >
                        <XeroFace
                          emotion={dragOver ? 'surprised' : emotion}
                          nuance={emotionNuance}
                          isSpeaking={isSpeaking}
                          isListening={isListening}
                          musicPlaying={music.playing}
                          pokeTick={pokeTick}
                          rapidPokeStreak={rapidPokeStreak}
                          faceColor={settings.appearance.faceColor}
                          accentColor={accent}
                          reducedMotion={reducedMotion}
                          size="preview"
                        />
                        <div className="text-center leading-tight">
                          <div className="text-[10.5px] font-medium text-white/55">
                            {EMOTION_SPECS[emotion].label}
                          </div>
                          <div className="text-[9.5px] text-white/30 mt-0.5">
                            {providerBadgeText}
                          </div>
                        </div>
                      </button>

                      {/* Right Content Column */}
                      <div className="flex-1 min-w-0 flex flex-col justify-between gap-2.5">
                        {/* TAB: ASSISTANT (COMMAND | DICTATE | WRITE) */}
                        {activeWidgetTab === 'chat' && (
                          <>
                            {interactionMode === 'command' && (
                              <div className="flex flex-col justify-between gap-3 h-full">
                                {messages.length <= 1 && !streamingText ? (
                                  <div className="space-y-3">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-[15px] font-semibold text-white tracking-tight truncate">
                                        Ready. Say &ldquo;{settings.voice.wakeWord || `Hey ${settings.personalization.assistantName}`}&rdquo;.
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          xeroStore.updateSettings((p) => ({
                                            ...p,
                                            voice: { ...p.voice, wakeWordEnabled: !p.voice.wakeWordEnabled },
                                          }))
                                        }
                                        aria-label="Toggle Wake Word"
                                        className={`shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium border transition-colors cursor-pointer ${
                                          settings.voice.wakeWordEnabled
                                            ? 'bg-[#39FF88]/12 border-[#39FF88]/40 text-[#39FF88]'
                                            : 'bg-[#1A1C23] border-white/[0.08] text-white/60 hover:text-white'
                                        }`}
                                        title={`Toggle lightweight Web Speech wake-word (${settings.voice.wakeWord})`}
                                      >
                                        <span
                                          className="w-1.5 h-1.5 rounded-full"
                                          style={{
                                            backgroundColor: settings.voice.wakeWordEnabled
                                              ? wakeWordStatus === 'blocked' || wakeWordStatus === 'unsupported'
                                                ? '#FFC857'
                                                : '#39FF88'
                                              : 'rgba(255,255,255,0.35)',
                                          }}
                                        />
                                        <span>
                                          {settings.voice.wakeWordEnabled
                                            ? wakeWordStatus === 'blocked'
                                              ? 'Mic Blocked'
                                              : wakeWordStatus === 'unsupported'
                                                ? 'No Speech API'
                                                : 'Wake On'
                                            : 'Wake Off'}
                                        </span>
                                      </button>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {[
                                        { label: 'Daily Brief', cmd: 'daily briefing' },
                                        { label: 'Focus Mode', cmd: 'focus protocol' },
                                        { label: music.playing ? 'Pause music' : 'Play music', cmd: music.playing ? 'pause music' : 'play music' },
                                        { label: 'Set a timer', cmd: 'set timer 1m' },
                                        { label: 'Take a note', cmd: 'take note Drink water & review sprint' },
                                        { label: '24 * 17', cmd: '24 * 17' },
                                        { label: 'Screenshot', cmd: 'take screenshot' },
                                      ].map((q) => (
                                        <button
                                          key={q.label}
                                          type="button"
                                          onClick={() => void executePrompt(q.cmd)}
                                          className="px-3.5 py-1.5 rounded-full bg-[#21232B] hover:bg-[#2C2F3A] text-xs font-medium text-white/90 transition-colors whitespace-nowrap cursor-pointer active:scale-[0.96]"
                                        >
                                          {q.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <div ref={chatScrollRef} className="max-h-44 overflow-y-auto space-y-2 pt-0.5 pr-1">
                                      {messages.map((msg) => (
                                        <motion.div
                                          key={msg.id}
                                          initial={reducedMotion ? false : { opacity: 0, y: 5 }}
                                          animate={{ opacity: 1, y: 0 }}
                                          transition={{ duration: 0.16 }}
                                          className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                                        >
                                          <div
                                            className={`max-w-[92%] px-3 py-1.5 rounded-2xl text-[12.5px] leading-relaxed whitespace-pre-wrap ${
                                              msg.role === 'user'
                                                ? 'bg-[#252832] text-white'
                                                : 'bg-[#191B21] text-white/95 border border-white/[0.06]'
                                            }`}
                                          >
                                            {msg.text}
                                          </div>
                                          {msg.actionsApplied && msg.actionsApplied.length > 0 && (
                                            <div className="mt-1 flex flex-wrap items-center gap-1">
                                              {msg.actionsApplied.map((act, idx) => (
                                                <span
                                                  key={`${msg.id}-act-${idx}`}
                                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/[0.06] border border-white/[0.08] text-[10px] text-white/75"
                                                >
                                                  <Zap className="w-2.5 h-2.5" style={{ color: accent }} />
                                                  <span>{act}</span>
                                                </span>
                                              ))}
                                            </div>
                                          )}
                                          {msg.role === 'assistant' && msg.provider && (
                                            <span className="mt-0.5 px-1 text-[10px] text-white/40">
                                              {msg.provider === 'gemini'
                                                ? 'Gemini'
                                                : msg.provider === 'local-llm'
                                                  ? 'Local LLM'
                                                  : 'Offline Core'}
                                            </span>
                                          )}
                                        </motion.div>
                                      ))}
                                      {streamingText && (
                                        <div className="flex flex-col items-start">
                                          <div className="max-w-[92%] px-3 py-1.5 rounded-2xl text-[12.5px] leading-relaxed bg-[#191B21] text-white border border-white/15 whitespace-pre-wrap">
                                            {streamingText}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      {[
                                        { label: 'Brief', cmd: 'daily briefing' },
                                        { label: 'Focus', cmd: 'focus protocol' },
                                        { label: 'Timer 1m', cmd: 'set timer 1m' },
                                        { label: '100 km to mi', cmd: '100 km to miles' },
                                        { label: music.playing ? 'Pause' : 'Play', cmd: music.playing ? 'pause music' : 'play music' },
                                        { label: 'Snap', cmd: 'take screenshot' },
                                      ].map((q) => (
                                        <button
                                          key={q.label}
                                          type="button"
                                          onClick={() => void executePrompt(q.cmd)}
                                          className="px-2.5 py-1 rounded-full bg-[#21232B] hover:bg-[#2C2F3A] text-[11px] text-white/80 transition-colors cursor-pointer active:scale-[0.96]"
                                        >
                                          {q.label}
                                        </button>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {pendingConfirmation && (
                                  <div
                                    role="region"
                                    aria-label="Confirm action"
                                    className="px-3 py-2 rounded-2xl bg-[#191B21] border border-white/15 flex items-center justify-between gap-2 text-xs"
                                  >
                                    <span className="text-white/90 truncate">{pendingConfirmation.summary}</span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const msg = xeroStore.resolvePendingConfirmation(true);
                                          xeroStore.addMessage({
                                            role: 'assistant',
                                            text: msg,
                                            provider: 'offline',
                                            emotion: 'happy',
                                          });
                                        }}
                                        className="px-2.5 py-1 rounded-full bg-white text-[#050608] text-[11px] font-semibold cursor-pointer"
                                      >
                                        Confirm
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const msg = xeroStore.resolvePendingConfirmation(false);
                                          xeroStore.addMessage({
                                            role: 'assistant',
                                            text: msg,
                                            provider: 'offline',
                                            emotion: 'neutral',
                                          });
                                        }}
                                        className="px-2.5 py-1 rounded-full bg-[#252832] text-white/80 hover:text-white text-[11px] cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {(liveSession.userTranscriptDraft || liveSession.assistantTranscriptDraft) && (
                                  <div
                                    aria-live="polite"
                                    className="px-3 py-1.5 rounded-xl bg-[#0D0F14] border border-white/[0.06] text-[11px] text-white/80 space-y-0.5"
                                  >
                                    {liveSession.userTranscriptDraft && (
                                      <div className="truncate text-white/60">
                                        You: {liveSession.userTranscriptDraft}
                                      </div>
                                    )}
                                    {liveSession.assistantTranscriptDraft && (
                                      <div className="line-clamp-2 text-white/95">
                                        {liveSession.assistantTranscriptDraft}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    void executePrompt(promptInput);
                                  }}
                                  className="flex items-center gap-1.5"
                                >
                                  <input
                                    type="text"
                                    value={promptInput}
                                    onChange={(e) => setPromptInput(e.target.value)}
                                    placeholder={`Ask ${settings.personalization.assistantName} anything…`}
                                    aria-label="Message XERO"
                                    className="flex-1 min-w-0 px-3.5 py-1.5 rounded-full bg-[#090A0D] border border-white/[0.09] text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-white/35"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => void triggerScreenAssist()}
                                    disabled={screenAssistActive}
                                    title="Explicit screen frame assistance"
                                    aria-label="Screen assist"
                                    className="p-2 rounded-full bg-[#21232B] hover:bg-[#2C2F3A] text-white/75 hover:text-white cursor-pointer shrink-0"
                                  >
                                    <Monitor className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="submit"
                                    disabled={!promptInput.trim() || isThinking}
                                    aria-label="Send message"
                                    className="p-2 rounded-full bg-white text-[#050608] hover:opacity-90 disabled:opacity-35 transition-opacity shrink-0 cursor-pointer"
                                  >
                                    <Send className="w-3.5 h-3.5" />
                                  </button>
                                </form>
                              </div>
                            )}

                            {interactionMode === 'dictate' && (
                              <div data-testid="xero-dictate-panel" className="space-y-2.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-[14px] font-semibold text-white">Dictate</span>
                                  <div className="flex items-center gap-1">
                                    {(
                                      [
                                        { id: 'verbatim', label: 'Verbatim' },
                                        { id: 'clean', label: 'Clean' },
                                        { id: 'ai-polished', label: 'Polished' },
                                      ] as Array<{ id: DictationStyle; label: string }>
                                    ).map((st) => {
                                      const active = settings.voice.dictationStyle === st.id;
                                      return (
                                        <button
                                          key={st.id}
                                          type="button"
                                          onClick={() =>
                                            xeroStore.updateSettings((p) => ({
                                              ...p,
                                              voice: { ...p.voice, dictationStyle: st.id },
                                            }))
                                          }
                                          className={`relative px-2.5 py-0.5 rounded-full text-[10.5px] cursor-pointer transition-colors ${
                                            active
                                              ? 'text-[#050608] font-semibold'
                                              : 'bg-[#21232B] text-white/70 hover:text-white'
                                          }`}
                                        >
                                          {active && (
                                            <motion.span
                                              layoutId={reducedMotion ? undefined : 'xero-dictate-style-pill'}
                                              transition={NOTCH_OPEN_SPRING}
                                              className="absolute inset-0 rounded-full bg-white"
                                            />
                                          )}
                                          <span className="relative z-10">{st.label}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>

                                <textarea
                                  rows={2}
                                  value={dictationRaw}
                                  onChange={(e) => setDictationRaw(e.target.value)}
                                  placeholder='Speak or type — try "scratch that", "comma", "new line"…'
                                  aria-label="Raw dictation input"
                                  className="w-full px-3 py-2 rounded-xl bg-[#090A0D] border border-white/[0.08] text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-white/35"
                                />

                                <div className="p-2.5 rounded-xl bg-[#191B21] border border-white/[0.06] space-y-1.5">
                                  <div className="flex items-center justify-between text-[10.5px] text-white/50">
                                    <span>Formatted Output</span>
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={toggleVoiceInput}
                                        className="px-2 py-0.5 rounded-full bg-[#252832] text-white/80 hover:text-white cursor-pointer"
                                      >
                                        {isListening ? 'Stop Mic' : 'Mic'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDictationRaw('');
                                          setDictationEdited('');
                                        }}
                                        className="hover:text-white cursor-pointer"
                                      >
                                        Clear
                                      </button>
                                      <button
                                        type="button"
                                        disabled={!dictationEdited}
                                        onClick={() => copyWithFeedback(dictationEdited, 'dictate')}
                                        className="flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white text-[#050608] font-semibold disabled:opacity-40 cursor-pointer"
                                      >
                                        {copiedId === 'dictate' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                        <span>{copiedId === 'dictate' ? 'Copied' : 'Copy'}</span>
                                      </button>
                                    </div>
                                  </div>
                                  <div className="text-xs text-white whitespace-pre-wrap min-h-[24px]">
                                    {dictationEdited || 'Your formatted dictation will appear here.'}
                                  </div>
                                </div>
                              </div>
                            )}

                            {interactionMode === 'write' && (
                              <div data-testid="xero-write-panel" className="space-y-2">
                                <div className="flex items-center gap-1 overflow-x-auto pb-1">
                                  {WRITE_TASKS.map((t) => (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() => setWriteTask(t.id)}
                                      className={`px-2.5 py-1 rounded-full text-[10.5px] whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                                        writeTask === t.id
                                          ? 'bg-white text-[#050608] font-semibold'
                                          : 'bg-[#21232B] text-white/70 hover:text-white'
                                      }`}
                                    >
                                      {t.label}
                                    </button>
                                  ))}
                                </div>

                                <textarea
                                  rows={2}
                                  value={writeInput}
                                  onChange={(e) => setWriteInput(e.target.value)}
                                  placeholder={`Describe what to ${writeTask.replace('-', ' ')}…`}
                                  aria-label="Write task input"
                                  className="w-full px-3 py-2 rounded-xl bg-[#090A0D] border border-white/[0.08] text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-white/35"
                                />

                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <button
                                    type="button"
                                    disabled={!writeInput.trim() || isThinking}
                                    onClick={() => void executeWriteTask()}
                                    className="px-3.5 py-1.5 rounded-full bg-white text-[#050608] text-xs font-semibold disabled:opacity-40 cursor-pointer active:scale-[0.97] transition-transform"
                                  >
                                    {isThinking ? 'Drafting…' : `Generate ${WRITE_TASKS.find((w) => w.id === writeTask)?.label}`}
                                  </button>
                                  {writeOutput && (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          xeroStore.updateTeleprompter((p) => ({
                                            ...p,
                                            isOpen: true,
                                            script: writeOutput,
                                            activeLine: 0,
                                            playing: false,
                                          }));
                                          xeroStore.triggerTaskResultHud('Sent to Teleprompter', 'Ready to scroll independently');
                                        }}
                                        className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#21232B] hover:bg-[#2C2F3A] text-xs text-white cursor-pointer active:scale-[0.97] transition-transform"
                                        title="Send draft to independent Teleprompter window"
                                      >
                                        <ScrollText className="w-3.5 h-3.5" />
                                        <span>Teleprompter</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => copyWithFeedback(writeOutput, 'write')}
                                        className="flex items-center gap-1 px-3 py-1 rounded-full bg-[#21232B] hover:bg-[#2C2F3A] text-xs text-white cursor-pointer active:scale-[0.97] transition-transform"
                                      >
                                        {copiedId === 'write' ? <Check className="w-3.5 h-3.5 text-[#39FF88]" /> : <Copy className="w-3.5 h-3.5" />}
                                        <span>{copiedId === 'write' ? 'Copied' : 'Copy Draft'}</span>
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {writeOutput && (
                                  <textarea
                                    rows={3}
                                    value={writeOutput}
                                    onChange={(e) => setWriteOutput(e.target.value)}
                                    aria-label="Generated draft output"
                                    className="w-full px-3 py-2 rounded-xl bg-[#191B21] border border-white/[0.06] text-xs text-white leading-relaxed focus:outline-none focus:border-white/35"
                                  />
                                )}
                              </div>
                            )}
                          </>
                        )}

                        {/* TAB: TIMERS, CHECKLIST REMINDERS, LISTS, NOTES & STOPWATCH */}
                        {activeWidgetTab === 'timers' && (
                          <div className="space-y-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex items-center gap-1">
                                {(
                                  [
                                    { id: 'timers', label: 'Timers' },
                                    { id: 'lists', label: `Lists${todos.length ? ` (${todos.length})` : ''}` },
                                    { id: 'notes', label: `Notes${notes.length ? ` (${notes.length})` : ''}` },
                                    { id: 'watch', label: 'Watch' },
                                  ] as const
                                ).map((sub) => {
                                  const active = timersSubView === sub.id;
                                  return (
                                    <button
                                      key={sub.id}
                                      type="button"
                                      onClick={() => setTimersSubView(sub.id)}
                                      className={`relative px-2.5 py-0.5 rounded-full text-[11px] font-medium transition-colors cursor-pointer ${
                                        active
                                          ? 'text-[#050608] font-semibold'
                                          : 'bg-[#21232B] text-white/75 hover:text-white'
                                      }`}
                                    >
                                      {active && (
                                        <motion.span
                                          layoutId={reducedMotion ? undefined : 'xero-timers-subpill'}
                                          transition={NOTCH_OPEN_SPRING}
                                          className="absolute inset-0 rounded-full bg-white"
                                        />
                                      )}
                                      <span className="relative z-10">{sub.label}</span>
                                    </button>
                                  );
                                })}
                              </div>

                              <button
                                type="button"
                                onClick={() => xeroStore.logWater(250)}
                                aria-label="Log +250ml water"
                                title="Log +250 ml hydration"
                                className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#191B21] hover:bg-[#242731] border border-white/[0.08] text-[10.5px] font-mono-tabular text-white/85 cursor-pointer active:scale-95 transition-transform"
                              >
                                <Droplets className="w-3 h-3" style={{ color: accent }} />
                                <span>{waterMl}ml</span>
                              </button>
                            </div>

                            {timersSubView === 'timers' && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs font-medium text-white/60">Quick Presets</span>
                                  <div className="flex items-center gap-1">
                                    {[
                                      { label: '30s', sec: 30 },
                                      { label: '1m', sec: 60 },
                                      { label: '5m', sec: 300 },
                                      { label: '25m', sec: 1500 },
                                    ].map((preset) => (
                                      <button
                                        key={preset.label}
                                        type="button"
                                        onClick={() => xeroStore.startTimer(preset.sec, `${preset.label} Focus`)}
                                        className="px-2 py-0.5 rounded-full bg-[#21232B] hover:bg-[#2C2F3A] text-[11px] font-mono-tabular text-white cursor-pointer active:scale-95 transition-transform"
                                      >
                                        +{preset.label}
                                      </button>
                                    ))}
                                  </div>
                                </div>

                                {timers.length > 0 && (
                                  <div className="space-y-1 max-h-24 overflow-y-auto">
                                    {timers.map((t) => (
                                      <div
                                        key={t.id}
                                        className="flex items-center justify-between px-3 py-1.5 rounded-xl bg-[#191B21] border border-white/[0.05]"
                                      >
                                        <div className="flex items-center gap-2 min-w-0">
                                          <span className="text-xs text-white/90 truncate">{t.label}</span>
                                          <span className="font-mono-tabular text-xs font-semibold text-white">
                                            {formatClock(computeRemainingSeconds(t))}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => xeroStore.toggleTimer(t.id)}
                                            aria-label={t.running ? `Pause ${t.label}` : `Resume ${t.label}`}
                                            className="p-1 text-white/60 hover:text-white cursor-pointer"
                                          >
                                            {t.running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => xeroStore.removeTimer(t.id)}
                                            aria-label={`Delete ${t.label}`}
                                            className="p-1 text-white/60 hover:text-[#FF4567] cursor-pointer"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {reminders.length === 0 ? (
                                  <div className="flex items-center gap-2 text-xs text-white/55">
                                    <Circle className="w-3.5 h-3.5 text-white/40 shrink-0" />
                                    <span>Add a quick reminder or start a focus timer</span>
                                  </div>
                                ) : (
                                  <div className="space-y-1.5 max-h-24 overflow-y-auto">
                                    {reminders.map((r) => (
                                      <div key={r.id} className="flex items-center justify-between gap-2 text-xs">
                                        <button
                                          type="button"
                                          onClick={() => xeroStore.toggleReminder(r.id)}
                                          aria-label={`Toggle reminder ${r.text}`}
                                          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group"
                                        >
                                          {r.completed ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-[#39FF88] shrink-0" />
                                          ) : (
                                            <Circle className="w-3.5 h-3.5 text-white/50 group-hover:text-white shrink-0" />
                                          )}
                                          <span className={r.completed ? 'line-through text-white/40 truncate' : 'text-white/90 truncate'}>
                                            {r.text}
                                          </span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => xeroStore.removeReminder(r.id)}
                                          aria-label={`Remove reminder ${r.text}`}
                                          className="text-white/45 hover:text-[#FF4567] cursor-pointer"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!reminderDraft.trim()) return;
                                    xeroStore.addReminder(reminderDraft.trim(), 30);
                                    setReminderDraft('');
                                  }}
                                  className="flex items-center gap-1.5"
                                >
                                  <input
                                    type="text"
                                    value={reminderDraft}
                                    onChange={(e) => setReminderDraft(e.target.value)}
                                    placeholder="Add 30s reminder…"
                                    aria-label="New reminder text"
                                    className="flex-1 min-w-0 px-3 py-1.5 rounded-full bg-[#090A0D] border border-white/[0.08] text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-white/35"
                                  />
                                  <button
                                    type="submit"
                                    aria-label="Add reminder"
                                    className="px-3 py-1.5 rounded-full bg-white text-[#050608] text-xs font-semibold whitespace-nowrap cursor-pointer active:scale-95 transition-transform"
                                  >
                                    Remind
                                  </button>
                                </form>
                              </div>
                            )}

                            {timersSubView === 'lists' && (
                              <div className="space-y-2">
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!todoDraft.trim()) return;
                                    xeroStore.addTodoItems([todoDraft.trim()], todoListType);
                                    setTodoDraft('');
                                  }}
                                  className="flex items-center gap-1.5"
                                >
                                  <select
                                    aria-label="List category"
                                    value={todoListType}
                                    onChange={(e) => setTodoListType(e.target.value as 'todo' | 'shopping')}
                                    className="px-2 py-1.5 rounded-full bg-[#090A0D] border border-white/[0.08] text-[11px] text-white"
                                  >
                                    <option value="todo">To-Do</option>
                                    <option value="shopping">Shop</option>
                                  </select>
                                  <input
                                    type="text"
                                    value={todoDraft}
                                    onChange={(e) => setTodoDraft(e.target.value)}
                                    placeholder="Add task or grocery item…"
                                    aria-label="New list item"
                                    className="flex-1 min-w-0 px-3 py-1.5 rounded-full bg-[#090A0D] border border-white/[0.08] text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-white/35"
                                  />
                                  <button
                                    type="submit"
                                    aria-label="Add list item"
                                    className="px-3 py-1.5 rounded-full bg-white text-[#050608] text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                                  >
                                    Add
                                  </button>
                                </form>
                                <div className="space-y-1 max-h-28 overflow-y-auto">
                                  {todos.length === 0 ? (
                                    <p className="text-xs text-white/50">No tasks yet. Add one above or ask XERO!</p>
                                  ) : (
                                    todos.map((item) => (
                                      <div
                                        key={item.id}
                                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#191B21] border border-white/[0.05] text-xs"
                                      >
                                        <button
                                          type="button"
                                          onClick={() => xeroStore.toggleTodoItem(item.id)}
                                          className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                                        >
                                          {item.done ? (
                                            <CheckCircle2 className="w-3.5 h-3.5 text-[#39FF88] shrink-0" />
                                          ) : (
                                            <Circle className="w-3.5 h-3.5 text-white/45 shrink-0" />
                                          )}
                                          <span className={item.done ? 'line-through text-white/40 truncate' : 'text-white truncate'}>
                                            {item.text}
                                          </span>
                                          <span className="text-[10px] text-white/40 uppercase shrink-0">{item.listType}</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => xeroStore.removeTodoItem(item.id)}
                                          aria-label={`Delete ${item.text}`}
                                          className="text-white/45 hover:text-[#FF4567] cursor-pointer"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}

                            {timersSubView === 'notes' && (
                              <div className="space-y-2">
                                <form
                                  onSubmit={(e) => {
                                    e.preventDefault();
                                    if (!noteDraft.trim()) return;
                                    xeroStore.addNote(noteDraft);
                                    setNoteDraft('');
                                  }}
                                  className="flex items-center gap-1.5"
                                >
                                  <input
                                    type="text"
                                    value={noteDraft}
                                    onChange={(e) => setNoteDraft(e.target.value)}
                                    placeholder="Quick scratch note…"
                                    aria-label="New quick note"
                                    className="flex-1 min-w-0 px-3 py-1.5 rounded-full bg-[#090A0D] border border-white/[0.08] text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-white/35"
                                  />
                                  <button
                                    type="submit"
                                    aria-label="Save quick note"
                                    className="px-3 py-1.5 rounded-full bg-white text-[#050608] text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const md = xeroStore.exportNotesMarkdown();
                                      const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
                                      const url = URL.createObjectURL(blob);
                                      const a = document.createElement('a');
                                      a.href = url;
                                      a.download = `xero-notes-${new Date().toISOString().slice(0, 10)}.md`;
                                      a.click();
                                      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                                      xeroStore.pushNotification('Markdown Exported', 'Saved notes & checklists as .md', 'success');
                                    }}
                                    aria-label="Export notes as Markdown"
                                    title="Export notes & checklists as Markdown (.md)"
                                    className="px-2.5 py-1.5 rounded-full bg-[#21232B] hover:bg-[#2C2F3A] text-white/85 text-xs font-medium cursor-pointer"
                                  >
                                    .md
                                  </button>
                                </form>
                                <div className="space-y-1 max-h-28 overflow-y-auto">
                                  {notes.length === 0 ? (
                                    <p className="text-xs text-white/50">No notes yet. Try &ldquo;take note …&rdquo; or &ldquo;capture that&rdquo; in Command mode.</p>
                                  ) : (
                                    notes.map((n) => (
                                      <div
                                        key={n.id}
                                        className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#191B21] border border-white/[0.05] text-xs"
                                      >
                                        <span className="text-white truncate">{n.text}</span>
                                        <button
                                          type="button"
                                          onClick={() => xeroStore.removeNote(n.id)}
                                          aria-label="Delete note"
                                          className="text-white/45 hover:text-[#FF4567] cursor-pointer"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))
                                  )}
                                </div>
                              </div>
                            )}

                            {timersSubView === 'watch' && (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[#191B21] border border-white/[0.05]">
                                  <span className="font-mono-tabular text-lg font-semibold text-white">
                                    {formatMs(stopwatch.elapsedMs)}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        stopwatch.running ? xeroStore.pauseStopwatch() : xeroStore.startStopwatch()
                                      }
                                      className="px-3 py-1 rounded-full bg-white text-[#050608] text-xs font-semibold cursor-pointer active:scale-95 transition-transform"
                                    >
                                      {stopwatch.running ? 'Pause' : 'Start'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => xeroStore.lapStopwatch()}
                                      disabled={!stopwatch.running}
                                      className="px-2.5 py-1 rounded-full bg-[#252832] text-xs text-white disabled:opacity-35 cursor-pointer"
                                    >
                                      Lap
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => xeroStore.resetStopwatch()}
                                      className="px-2.5 py-1 rounded-full bg-[#252832] text-xs text-white/75 hover:text-white cursor-pointer"
                                    >
                                      Reset
                                    </button>
                                  </div>
                                </div>
                                {stopwatch.laps.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {stopwatch.laps.slice(0, 4).map((lap, idx) => (
                                      <span
                                        key={`${lap}-${idx}`}
                                        className="px-2 py-0.5 rounded-full bg-[#191B21] border border-white/[0.06] font-mono-tabular text-[10.5px] text-white/75"
                                      >
                                        #{stopwatch.laps.length - idx} {formatMs(lap)}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {/* TAB: CLIPBOARD HISTORY */}
                        {activeWidgetTab === 'clipboard' && (
                          <div className="space-y-2.5">
                            <div className="text-[14px] font-semibold text-white">Clipboard</div>
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                if (!clipboardDraft.trim()) return;
                                xeroStore.addClipboardItem(clipboardDraft);
                                setClipboardDraft('');
                              }}
                              className="flex items-center gap-1.5"
                            >
                              <input
                                type="text"
                                value={clipboardDraft}
                                onChange={(e) => setClipboardDraft(e.target.value)}
                                placeholder="Save snippet to clipboard…"
                                aria-label="Clipboard snippet"
                                className="flex-1 min-w-0 px-3 py-1.5 rounded-full bg-[#090A0D] border border-white/[0.08] text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-white/35"
                              />
                              <button
                                type="submit"
                                aria-label="Save clipboard snippet"
                                className="p-1.5 rounded-full bg-white text-[#050608] cursor-pointer"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            </form>

                            <div className="space-y-1 max-h-32 overflow-y-auto">
                              {clipboard.length === 0 ? (
                                <p className="text-xs text-white/50 py-1">Clipboard history is empty.</p>
                              ) : (
                                clipboard.map((c) => (
                                  <div
                                    key={c.id}
                                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-[#191B21] border border-white/[0.05]"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void navigator.clipboard?.writeText(c.text).catch(() => {});
                                        xeroStore.pushNotification('Copied', c.text.slice(0, 42), 'success');
                                      }}
                                      className="text-left text-xs text-white truncate flex-1 cursor-pointer hover:underline"
                                      title="Click to copy"
                                    >
                                      {c.text}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => xeroStore.removeClipboardItem(c.id)}
                                      aria-label="Delete clipboard entry"
                                      className="text-white/45 hover:text-[#FF4567] p-0.5 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>
                        )}

                        {/* TAB: FILE SHELF & CANVAS IMAGE COPY TOOLS */}
                        {activeWidgetTab === 'files' && (
                          <div className="space-y-2.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[14px] font-semibold text-white">
                                Shelf ({files.length})
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => xeroStore.triggerScreenshot()}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#21232B] hover:bg-[#2C2F3A] text-[11px] text-white cursor-pointer"
                                >
                                  <Camera className="w-3 h-3" />
                                  <span>Snap</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => fileInputRef.current?.click()}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white text-[#050608] text-[11px] font-semibold cursor-pointer"
                                >
                                  <Upload className="w-3 h-3" />
                                  <span>Add File</span>
                                </button>
                              </div>
                            </div>
                            <input
                              ref={fileInputRef}
                              type="file"
                              multiple
                              className="hidden"
                              onChange={(e) => handleFilesDrop(e.target.files)}
                            />

                            {files.length === 0 ? (
                              <div className="px-3 py-3 rounded-xl border border-dashed border-white/15 bg-[#090A0D] text-xs text-white/50">
                                Drop a file on the notch to keep it on the Shelf ({memories.length} memories).
                              </div>
                            ) : (
                              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                                {files.map((f) => (
                                  <div
                                    key={f.id}
                                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#191B21] border border-white/[0.05]"
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      {f.previewDataUrl ? (
                                        <img
                                          src={f.previewDataUrl}
                                          alt={f.name}
                                          className="w-8 h-5 rounded object-cover border border-white/15 shrink-0"
                                        />
                                      ) : (
                                        <FileText className="w-3.5 h-3.5 text-white/70 shrink-0" />
                                      )}
                                      <div className="min-w-0">
                                        <div className="text-xs font-medium text-white truncate">{f.name}</div>
                                        <div className="text-[10px] text-white/45 font-mono-tabular">
                                          {Math.max(1, Math.round(f.sizeBytes / 1024))} KB
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {f.previewDataUrl && f.mimeType.startsWith('image/') && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => void xeroStore.applyShelfImageOp('resize-half', f.id)}
                                            className="px-1.5 py-0.5 rounded bg-[#090A0D] border border-white/10 text-[10px] text-white hover:border-white/35 cursor-pointer"
                                            title="Save 50% resized new copy"
                                          >
                                            50%
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => void xeroStore.applyShelfImageOp('rotate-90', f.id)}
                                            className="px-1.5 py-0.5 rounded bg-[#090A0D] border border-white/10 text-[10px] text-white hover:border-white/35 cursor-pointer"
                                            title="Save 90° rotated new copy"
                                          >
                                            90°
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => downloadDataUrl(f.previewDataUrl!, f.name)}
                                            aria-label={`Download ${f.name}`}
                                            className="text-white/60 hover:text-white p-1 cursor-pointer"
                                          >
                                            <Download className="w-3.5 h-3.5" />
                                          </button>
                                        </>
                                      )}
                                      {!f.mimeType.startsWith('image/') && f.previewText && (
                                        <button
                                          type="button"
                                          onClick={() => xeroStore.summarizeLatestDoc(f.id)}
                                          className="px-1.5 py-0.5 rounded bg-[#090A0D] border border-white/10 text-[10px] text-white cursor-pointer"
                                        >
                                          Summary
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        onClick={() => xeroStore.removeShelfFile(f.id)}
                                        aria-label={`Remove ${f.name}`}
                                        className="text-white/45 hover:text-[#FF4567] p-1 cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        <NotchCornerEar
          side="right"
          fill={notchBg}
          visible={showCornerEars}
          transition={activeSpring}
        />
      </aside>
      </div>

      {/* Cute floating whisper reaction centered beneath the notch */}
      <AnimatePresence>
        {reactionWhisper && !isMinimized && !isPanelOpen && !liveHud && !notification && (
          <div className="pointer-events-none fixed inset-x-0 top-14 z-50 flex justify-center">
            <motion.div
              key={reactionWhisper}
              role="status"
              initial={reducedMotion ? false : { opacity: 0, y: -6, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.92 }}
              transition={NOTCH_OPEN_SPRING}
              className="px-3 py-1 rounded-full bg-[#0B0E12]/95 border border-white/12 text-xs text-[#EDF5FF] shadow-lg backdrop-blur-md whitespace-nowrap"
            >
              {reactionWhisper}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
