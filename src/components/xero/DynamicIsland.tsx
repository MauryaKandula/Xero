import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  Camera,
  Check,
  ChevronUp,
  Clipboard,
  Copy,
  Download,
  FileText,
  FolderOpen,
  LayoutGrid,
  Mic,
  MicOff,
  Monitor,
  Music,
  Pause,
  Pin,
  Play,
  Plus,
  Send,
  Settings2,
  SkipBack,
  SkipForward,
  Sparkles,
  Timer,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  Wind,
  X,
} from 'lucide-react';
import { xeroStore, useXeroStore } from '../../core/store';
import { generateXeroReply } from '../../core/aiClient';
import { BUILTIN_TRACKS, SITUATION_VOICE_LINES, audioService } from '../../core/audioEngine';
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
  IslandWidgetTab,
  WriteTaskKind,
} from '../../core/types';
import { XeroFace } from './XeroFace';
import { NotchContextMenu } from './NotchContextMenu';

interface SpeechRecognitionInstance {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

// Buttery physics springs: slight overshoot on open, crisp non-bouncy contraction on close
const NOTCH_OPEN_SPRING = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 24,
  mass: 0.78,
};

const NOTCH_CLOSE_SPRING = {
  type: 'spring' as const,
  stiffness: 430,
  damping: 34,
  mass: 0.72,
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

/** Animated inverted top bezel corner ear so the notch morphs smoothly without width pop */
const NotchCornerEar: React.FC<{
  side: 'left' | 'right';
  fill: string;
  visible: boolean;
  transition: typeof NOTCH_OPEN_SPRING;
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
  const [dragOver, setDragOver] = useState(false);
  const [isDraggingIsland, setIsDraggingIsland] = useState(false);
  const [showShutterFlash, setShowShutterFlash] = useState(false);
  const [breathPhase, setBreathPhase] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');
  const [micUnavailable, setMicUnavailable] = useState(false);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
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
    pokeTick,
    rapidPokeStreak,
    reactionWhisper,
    messages,
    timers,
    reminders,
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
  const notchBg = '#030407';

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
      if (!drag.detachedDuringDrag && Math.hypot(dx, dy) < 8) return;

      drag.detachedDuringDrag = true;
      setIsDraggingIsland(true);
      const nextX = Math.max(12, Math.min(window.innerWidth - 160, drag.origX + dx));
      const nextY = Math.max(0, Math.min(window.innerHeight - 90, drag.origY + dy));
      xeroStore.setIslandPosition({ docked: false, x: nextX, y: nextY });
    };

    const onPointerUp = (e: PointerEvent) => {
      const drag = dragStartRef.current;
      dragStartRef.current = null;
      setIsDraggingIsland(false);
      if (!drag || !drag.detachedDuringDrag) return;

      // Magnetic snap back to top-center notch if dragged close to top-center
      const centerDist = Math.abs(e.clientX - window.innerWidth / 2);
      if (e.clientY <= 30 && centerDist <= 120) {
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

  // Detect cursor approaching top screen edge when tucked away
  useEffect(() => {
    if (islandMode !== 'minimized') {
      setNearTopBezel(false);
      return;
    }
    const handleMove = (e: PointerEvent) => {
      setNearTopBezel(e.clientY <= 44);
    };
    window.addEventListener('pointermove', handleMove, { passive: true });
    return () => window.removeEventListener('pointermove', handleMove);
  }, [islandMode]);

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
    return () => {
      recognitionRef.current?.stop();
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      if (followUpTimerRef.current) window.clearTimeout(followUpTimerRef.current);
    };
  }, []);

  const activeTrack = BUILTIN_TRACKS[music.trackIndex % BUILTIN_TRACKS.length];
  const activeLyric = activeTrack.lyrics[getActiveLyricIndex(activeTrack.lyrics, music.elapsedSec)];
  const runningTimer = timers.find((t) => t.running);
  const timerRemaining = runningTimer ? computeRemainingSeconds(runningTimer) : 0;
  const timerProgress =
    runningTimer && runningTimer.durationSec > 0
      ? Math.max(0, Math.min(1, timerRemaining / runningTimer.durationSec))
      : 0;

  const isPanelOpen = islandExpanded || menuOpen;
  const showFullControls =
    isPanelOpen ||
    hovered ||
    focusWithin ||
    dragOver ||
    Boolean(liveHud) ||
    Boolean(notification) ||
    isListening ||
    isThinking ||
    isSpeaking ||
    screenAssistActive;

  // Deterministic width target (zero layout snap / width: 'auto' thrashing)
  const targetWidthPx = isPanelOpen
    ? Math.min(528, viewportWidth - 24)
    : liveHud || notification
      ? Math.min(392, viewportWidth - 24)
      : showFullControls
        ? Math.min(314, viewportWidth - 24)
        : music.playing || runningTimer
          ? 162
          : 118;

  const activeSpring = reducedMotion
    ? { duration: 0.01 }
    : isPanelOpen || Boolean(liveHud) || showFullControls
      ? NOTCH_OPEN_SPRING
      : NOTCH_CLOSE_SPRING;

  const showCornerEars =
    islandPosition.docked && notchShape === 'bezel' && !isPanelOpen && !isDraggingIsland;

  const statusDotColor = screenAssistActive
    ? '#FF4567'
    : isThinking
      ? '#9C6BFF'
      : isListening
        ? accent
        : emotion === 'affectionate'
          ? '#FF5CA1'
          : music.playing
            ? '#39FF88'
            : runningTimer
              ? '#FFC857'
              : '#EAB308';

  const getNotchShadowStyle = (): React.CSSProperties => {
    const borderAlpha = Math.round(Math.min(1, Math.max(0.08, borderGlow)) * 90)
      .toString(16)
      .padStart(2, '0');
    if (dragOver || liveHud?.type === 'screenshot') {
      return {
        boxShadow: `0 12px 34px rgba(0, 0, 0, 0.9), inset 0 0 0 1px ${accent}55`,
        borderColor: `${accent}88`,
      };
    }
    if (isThinking) {
      return {
        boxShadow: `0 12px 34px rgba(0, 0, 0, 0.9), 0 0 ${Math.round(14 * glow)}px rgba(156, 107, 255, 0.24)`,
        borderColor: 'rgba(156, 107, 255, 0.5)',
      };
    }
    if (isListening || isSpeaking || screenAssistActive) {
      return {
        boxShadow: `0 12px 34px rgba(0, 0, 0, 0.9), 0 0 ${Math.round(12 * glow)}px ${accent}28`,
        borderColor: `${accent}66`,
      };
    }
    return {
      boxShadow: showFullControls
        ? `0 14px 38px rgba(0, 0, 0, 0.9), 0 0 ${Math.round(10 * borderGlow)}px ${accent}18`
        : '0 8px 24px rgba(0, 0, 0, 0.85)',
      borderColor: showFullControls ? `${accent}${borderAlpha}` : 'rgba(255, 255, 255, 0.08)',
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

    xeroStore.setThinking(true);

    const reply = await generateXeroReply({
      prompt: text,
      history: xeroStore.getSnapshot().messages,
      settings: xeroStore.getSnapshot().settings,
      memories: xeroStore.getSnapshot().memories,
      contextSummary: {
        timersCount: xeroStore.getSnapshot().timers.length,
        clipboardCount: xeroStore.getSnapshot().clipboard.length,
        filesCount: xeroStore.getSnapshot().files.length,
        isOnline: xeroStore.getSnapshot().isOnline,
      },
      geminiAvailable: xeroStore.getSnapshot().geminiConfigured,
      onStreamChunk: (partial) => {
        xeroStore.setStreamingText(partial);
      },
    });

    xeroStore.setThinking(false);

    if (reply.action) {
      if (reply.action.type === 'screen-assist') {
        void triggerScreenAssist(String(reply.action.payload?.prompt || text));
      } else {
        xeroStore.executeOfflineAction(reply.action);
      }
    }

    const displayText = reply.fallbackNote ? `${reply.text}\n(${reply.fallbackNote})` : reply.text;

    xeroStore.addMessage({
      role: 'assistant',
      text: displayText,
      provider: reply.provider,
      emotion: reply.emotion,
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

    const reply = await generateXeroReply({
      prompt: composedPrompt,
      history: [],
      settings: xeroStore.getSnapshot().settings,
      memories: xeroStore.getSnapshot().memories,
      contextSummary: {
        timersCount: timers.length,
        clipboardCount: clipboard.length,
        filesCount: files.length,
        isOnline,
      },
      geminiAvailable: geminiConfigured,
    });

    setWriteOutput(reply.provider === 'offline' ? offlineFallback : reply.text);
    xeroStore.setThinking(false);
    xeroStore.setEmotion('happy', false, 'satisfied');
    if (settings.voice.responseMode === 'chimes') {
      audioService.playSuccessChime(settings.general.soundEffects);
    }
  };

  const toggleVoiceInput = () => {
    if (isSpeaking) {
      // Self-trigger safeguard while speaking
      return;
    }
    if (isListening) {
      if (silenceTimerRef.current) window.clearTimeout(silenceTimerRef.current);
      recognitionRef.current?.stop();
      xeroStore.setListening(false);
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
          combined += event.results[i][0].transcript;
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

  // HIDDEN / TUCKED TOP-EDGE PEEK MODE
  if (islandMode === 'minimized') {
    const isPeeking = nearTopBezel || hovered || focusWithin;
    return (
      <aside
        aria-label="XERO Assistant (Hidden Peek)"
        data-testid="xero-island"
        data-xero-mode="minimized"
        data-xero-emotion={emotion}
        className="fixed top-0 left-1/2 z-50"
        style={{
          transform: `translateX(-50%) scale(${settings.appearance.islandScale})`,
          transformOrigin: 'top center',
          opacity: islandOpacity,
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onFocus={() => setFocusWithin(true)}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setFocusWithin(false);
          }
        }}
      >
        <motion.div
          animate={{ y: isPeeking ? 0 : -13 }}
          transition={NOTCH_OPEN_SPRING}
          className="flex items-start"
        >
          <NotchCornerEar side="left" fill={notchBg} visible={true} transition={NOTCH_OPEN_SPRING} />
          <div
            className="flex items-center gap-2 px-3.5 pt-1 rounded-b-[18px] bg-[#030407] border-x border-b border-white/[0.07] shadow-[0_8px_22px_rgba(0,0,0,0.85)]"
            style={{ paddingBottom: isPeeking ? 6 : 3 }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0 transition-colors"
              style={{ backgroundColor: isPeeking ? accent : '#EAB308' }}
            />
            <button
              type="button"
              onClick={() => {
                audioService.playPopChime(settings.general.soundEffects);
                xeroStore.setIslandExpanded(false);
              }}
              aria-label="Restore XERO Dynamic Island"
              title="Click to bring XERO back down"
              className="flex items-center gap-2 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#00E5FF] rounded-full"
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
            </button>
            <AnimatePresence initial={false}>
              {isPeeking && (
                <motion.button
                  key="peek-studio"
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.85 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reducedMotion ? undefined : { opacity: 0, scale: 0.85 }}
                  transition={{ duration: 0.16 }}
                  type="button"
                  onClick={() => xeroStore.openStudio()}
                  aria-label="Open XERO Studio"
                  className="p-1 text-[#8793A3] hover:text-[#EDF5FF] transition-colors cursor-pointer"
                >
                  <Settings2 className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
          <NotchCornerEar side="right" fill={notchBg} visible={true} transition={NOTCH_OPEN_SPRING} />
        </motion.div>
      </aside>
    );
  }

  return (
    <>
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

      {/* Top-Edge Living Notch or Drag-Detached Floating Companion */}
      <aside
        aria-label="XERO Floating Dynamic Island"
        data-testid="xero-island"
        data-xero-mode={menuOpen ? 'menu' : islandExpanded ? 'expanded' : hovered ? 'hovered' : islandMode}
        data-xero-docked={islandPosition.docked ? 'true' : 'false'}
        data-xero-emotion={emotion}
        className={`fixed z-50 flex items-start max-w-[calc(100vw-8px)] ${
          islandPosition.docked ? `top-0 left-1/2 ${dockTopMarginClass}` : ''
        }`}
        style={
          islandPosition.docked
            ? {
                transform: `translateX(-50%) scale(${settings.appearance.islandScale})`,
                transformOrigin: 'top center',
                opacity: islandOpacity,
              }
            : {
                left: `${Math.min(islandPosition.x, Math.max(12, viewportWidth - 160))}px`,
                top: `${islandPosition.y}px`,
                transform: `scale(${settings.appearance.islandScale})`,
                transformOrigin: 'top left',
                opacity: islandOpacity,
              }
        }
        onMouseEnter={() => {
          xeroStore.recordUserActivity();
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
          animate={{ width: targetWidthPx }}
          transition={activeSpring}
          className={`relative overflow-hidden bg-[#030407]/98 backdrop-blur-2xl ${shapeClass} ${
            dragOver ? 'ring-1 ring-[#00E5FF]/70' : ''
          }`}
          style={getNotchShadowStyle()}
        >
          {/* NOTCH TOP CAPSULE BAR — drag to detach into floating companion */}
          <div
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button, input, select, textarea, a')) return;
              const rect = e.currentTarget.getBoundingClientRect();
              dragStartRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                origX: islandPosition.docked ? rect.left : islandPosition.x,
                origY: islandPosition.docked ? rect.top : islandPosition.y,
                detachedDuringDrag: false,
              };
            }}
            className="flex items-center justify-between gap-2 px-3.5 py-1.5 select-none cursor-grab active:cursor-grabbing"
          >
            <div className="flex items-center gap-2 min-w-0">
              {/* Signature tiny glowing notch LED dot */}
              <motion.span
                aria-hidden="true"
                animate={
                  reducedMotion
                    ? { opacity: 0.9 }
                    : { opacity: [0.68, 1, 0.68], scale: [0.94, 1.08, 0.94] }
                }
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{
                  backgroundColor: statusDotColor,
                  boxShadow: `0 0 6px ${statusDotColor}`,
                }}
              />

              {/* Protected pure 2D animated face */}
              <button
                type="button"
                onClick={() => xeroStore.petXero()}
                onDoubleClick={() => xeroStore.setIslandExpanded(!islandExpanded, 'chat')}
                aria-label="Pet XERO"
                title="Click to pet XERO · Double-click to open Assistant · Drag bar to float free"
                className="rounded-xl px-0.5 py-0.5 hover:bg-white/[0.04] transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-[#00E5FF] shrink-0"
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
                  size={isPanelOpen ? 'expanded' : 'compact'}
                />
              </button>

              {/* Micro resting indicators ONLY when music or timer active */}
              {!showFullControls && music.playing && (
                <span className="flex items-end gap-0.5 h-3 pr-0.5" aria-hidden="true">
                  {[0, 1, 2].map((bar) => (
                    <motion.span
                      key={bar}
                      className="w-0.5 rounded-full bg-[#39FF88]"
                      animate={reducedMotion ? { height: 6 } : { height: ['3px', '10px', '4px'] }}
                      transition={{ repeat: Infinity, duration: 0.65, delay: bar * 0.14, ease: 'easeInOut' }}
                    />
                  ))}
                </span>
              )}
              {!showFullControls && !music.playing && runningTimer && (
                <span className="font-mono-tabular text-[10px] text-[#FFC857] pr-0.5">
                  {formatClock(timerRemaining)}
                </span>
              )}

              {/* Contextual Label when hovered, listening, or expanded */}
              <AnimatePresence initial={false}>
                {showFullControls && (
                  <motion.button
                    key="notch-label"
                    type="button"
                    initial={reducedMotion ? false : { opacity: 0, x: -4 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={reducedMotion ? undefined : { opacity: 0, x: -4 }}
                    transition={{ duration: 0.16 }}
                    onClick={() => {
                      audioService.playPopChime(settings.general.soundEffects);
                      xeroStore.setIslandExpanded(!islandExpanded, 'chat');
                    }}
                    aria-expanded={islandExpanded}
                    aria-label={islandExpanded ? 'Collapse XERO Dynamic Island' : 'Expand XERO Dynamic Island'}
                    className="flex flex-col min-w-0 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#00E5FF] rounded-lg px-1 py-0.5"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[13px] font-semibold tracking-tight text-[#EDF5FF] whitespace-nowrap">
                        {settings.personalization.assistantName}
                      </span>
                      <span className="text-[11px] text-[#8793A3] whitespace-nowrap truncate">
                        · {EMOTION_SPECS[emotion].label}
                      </span>
                    </div>

                    {isPanelOpen ? (
                      <span className="text-[11px] text-[#8793A3] whitespace-nowrap truncate max-w-[165px] sm:max-w-[230px]">
                        {menuOpen ? 'Contextual Menu' : `${interactionMode.toUpperCase()} · ${providerBadgeText}`}
                      </span>
                    ) : screenAssistActive ? (
                      <span className="text-[11px] text-[#FF4567] whitespace-nowrap">Capturing screen…</span>
                    ) : isListening ? (
                      <span className="flex items-center gap-1.5 text-[11px] whitespace-nowrap" style={{ color: accent }}>
                        <span className="flex items-end gap-0.5 h-2.5" aria-hidden="true">
                          {[0, 1, 2, 3].map((bar) => (
                            <motion.span
                              key={bar}
                              className="w-0.5 rounded-full"
                              style={{ backgroundColor: accent }}
                              animate={reducedMotion ? { height: 6 } : { height: ['3px', '9px', '4px'] }}
                              transition={{ repeat: Infinity, duration: 0.55, delay: bar * 0.1, ease: 'easeInOut' }}
                            />
                          ))}
                        </span>
                        <span>Listening…</span>
                      </span>
                    ) : runningTimer ? (
                      <span className="flex items-center gap-1.5 font-mono-tabular text-[11px] text-[#00E5FF] whitespace-nowrap">
                        <svg width="11" height="11" viewBox="0 0 14 14" aria-hidden="true" className="shrink-0 -rotate-90">
                          <circle cx="7" cy="7" r="5" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="2" />
                          <circle
                            cx="7"
                            cy="7"
                            r="5"
                            fill="none"
                            stroke={accent}
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeDasharray={31.42}
                            strokeDashoffset={31.42 * (1 - timerProgress)}
                          />
                        </svg>
                        <span>{formatClock(timerRemaining)}</span>
                      </span>
                    ) : music.playing ? (
                      <span className="text-[11px] text-[#39FF88] whitespace-nowrap truncate max-w-[130px]">
                        {activeTrack.title}
                      </span>
                    ) : dragOver ? (
                      <span className="text-[11px] text-[#00E5FF] whitespace-nowrap">Drop onto Shelf!</span>
                    ) : (
                      <span className="text-[11px] text-[#8793A3] whitespace-nowrap">
                        {isThinking ? 'Thinking…' : 'Ask me anything'}
                      </span>
                    )}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {/* Revealed Compact Assistant-First Controls */}
            <AnimatePresence initial={false}>
              {showFullControls && (
                <motion.div
                  key="notch-actions"
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reducedMotion ? undefined : { opacity: 0, scale: 0.96 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-center gap-0.5 shrink-0"
                >
                  {!islandPosition.docked && (
                    <button
                      type="button"
                      onClick={() => xeroStore.resetIslandPosition()}
                      aria-label="Re-dock XERO to top notch"
                      className="px-2 py-1 rounded-full bg-white/8 hover:bg-white/15 text-[10px] text-[#EDF5FF] cursor-pointer mr-0.5"
                      title="Return XERO to top-center notch"
                    >
                      Dock
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={toggleVoiceInput}
                    aria-label={isListening ? 'Stop voice listening' : 'Start voice command'}
                    className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                      isListening
                        ? 'bg-[#00E5FF]/15 text-[#00E5FF]'
                        : micUnavailable
                          ? 'text-[#FF4567]/85 hover:bg-white/5'
                          : 'text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/5'
                    }`}
                    title={isListening ? 'Listening… click to stop' : micUnavailable ? 'Microphone unavailable' : 'Voice command'}
                  >
                    {isListening ? (
                      <Mic className="w-3.5 h-3.5 animate-pulse" />
                    ) : micUnavailable ? (
                      <MicOff className="w-3.5 h-3.5" />
                    ) : (
                      <Mic className="w-3.5 h-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => xeroStore.setMenuOpen(!menuOpen)}
                    aria-label={menuOpen ? 'Close contextual menu' : 'Open contextual menu'}
                    aria-expanded={menuOpen}
                    className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                      menuOpen
                        ? 'bg-white/12 text-[#EDF5FF]'
                        : 'text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/5'
                    }`}
                    title="Contextual Menu (Widgets, System, Apps, Music, Productivity, Shelf, Appearance)"
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => xeroStore.openStudio()}
                    aria-label="Open XERO Studio"
                    className="p-1.5 rounded-full text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/5 transition-colors cursor-pointer"
                    title="Open independent XERO Studio window"
                  >
                    <Settings2 className="w-3.5 h-3.5" />
                  </button>

                  {isPanelOpen ? (
                    <button
                      type="button"
                      onClick={() => {
                        xeroStore.setIslandExpanded(false);
                        xeroStore.setMenuOpen(false);
                      }}
                      aria-label="Collapse Dynamic Island"
                      className="p-1.5 rounded-full text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/5 transition-colors cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => xeroStore.setIslandMode('minimized')}
                      aria-label="Hide XERO"
                      className="p-1.5 rounded-full text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/5 transition-colors cursor-pointer"
                      title="Hide XERO into top bezel"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Subtle bottom media progress hairline when playing compact */}
          {settings.appearance.showMediaProgress && music.playing && !isPanelOpen && (
            <div className="h-[2px] w-full bg-white/8">
              <div
                className="h-full transition-all duration-300"
                style={{
                  width: `${Math.min(100, (music.elapsedSec / activeTrack.durationSec) * 100)}%`,
                  backgroundColor: activeTrack.accent,
                }}
              />
            </div>
          )}

          {/* LIVE 2D HUD MORPH STRIP (Volume, Screenshot, Breathing, System Vitals, Task Result) */}
          <AnimatePresence>
            {liveHud && (
              <motion.div
                key={liveHud.type}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={NOTCH_CLOSE_SPRING}
                className="overflow-hidden border-t border-white/8"
              >
                {liveHud.type === 'volume' && (
                  <div
                    role="status"
                    data-testid="xero-volume-hud"
                    className="px-4 py-2.5 flex items-center justify-between gap-3 bg-[#0B0E12]"
                  >
                    <button
                      type="button"
                      onClick={() => xeroStore.toggleMute()}
                      aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                      className="p-1.5 rounded-lg bg-white/6 hover:bg-white/12 text-[#EDF5FF] cursor-pointer shrink-0"
                    >
                      {muted || volume === 0 ? (
                        <VolumeX className="w-4 h-4 text-[#FF4567]" />
                      ) : (
                        <Volume2 className="w-4 h-4" style={{ color: accent }} />
                      )}
                    </button>

                    <div className="flex-1 flex items-center gap-1 h-6" aria-label={`Volume level ${muted ? 0 : volume}%`}>
                      {Array.from({ length: 12 }).map((_, idx) => {
                        const threshold = ((idx + 1) / 12) * 100;
                        const effectiveVol = muted ? 0 : volume;
                        const active = effectiveVol >= threshold - 4;
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => xeroStore.setVolume(Math.round(((idx + 1) / 12) * 100))}
                            aria-label={`Set volume to ${Math.round(((idx + 1) / 12) * 100)}%`}
                            className="flex-1 h-full flex items-center cursor-pointer"
                          >
                            <motion.span
                              className="w-full rounded-full"
                              animate={{
                                height: active ? 10 + (idx % 3) * 3 : 5,
                                opacity: active ? 1 : 0.25,
                              }}
                              transition={{ type: 'spring', stiffness: 520, damping: 28 }}
                              style={{ backgroundColor: active ? accent : '#8793A3' }}
                            />
                          </button>
                        );
                      })}
                    </div>

                    <span className="font-mono-tabular text-xs font-semibold text-[#EDF5FF] w-11 text-right shrink-0">
                      {muted ? 'MUTE' : `${volume}%`}
                    </span>
                  </div>
                )}

                {liveHud.type === 'screenshot' && (
                  <div
                    role="status"
                    data-testid="xero-screenshot-hud"
                    className="px-4 py-2.5 flex items-center justify-between gap-3 bg-[#0B0E12]"
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
                        <div className="text-xs font-semibold text-[#EDF5FF] truncate">Snapshot Captured</div>
                        <div className="text-[11px] font-mono-tabular text-[#8793A3] truncate">
                          {liveHud.label} · Saved to Shelf
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {liveHud.previewDataUrl && (
                        <button
                          type="button"
                          onClick={() => downloadDataUrl(liveHud.previewDataUrl!, liveHud.label)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#050608] cursor-pointer"
                          style={{ backgroundColor: accent }}
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
                        className="px-2 py-1 rounded-lg bg-white/8 hover:bg-white/14 text-[11px] text-[#EDF5FF] cursor-pointer"
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
                    className="px-4 py-3 flex items-center justify-between gap-3 bg-[#0B0E12]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="relative w-9 h-9 flex items-center justify-center shrink-0">
                        <motion.span
                          className="absolute inset-0 rounded-full border-2"
                          style={{ borderColor: '#FF5CA1' }}
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
                        <div className="text-xs font-semibold text-[#EDF5FF]">{breathPhase} slowly…</div>
                        <div className="text-[11px] text-[#8793A3]">2D guided calm breathing rhythm</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => xeroStore.dismissLiveHud()}
                      className="px-2.5 py-1 rounded-lg bg-white/8 hover:bg-white/14 text-[11px] text-[#EDF5FF] cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                )}

                {liveHud.type === 'system' && (
                  <div
                    role="status"
                    data-testid="xero-system-hud"
                    className="px-4 py-2.5 flex items-center justify-between gap-3 bg-[#0B0E12]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <Activity className="w-4 h-4 shrink-0" style={{ color: '#39FF88' }} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between text-xs font-semibold text-[#EDF5FF]">
                          <span>{liveHud.label}</span>
                          <span className="font-mono-tabular text-[#39FF88]">{liveHud.value ?? 100}%</span>
                        </div>
                        <div className="mt-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <motion.div
                            className="h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${liveHud.value ?? 96}%` }}
                            transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                            style={{ backgroundColor: '#39FF88' }}
                          />
                        </div>
                        <div className="mt-1 text-[10px] font-mono-tabular text-[#8793A3] truncate">
                          {liveHud.detail}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => xeroStore.dismissLiveHud()}
                      aria-label="Close system HUD"
                      className="p-1 rounded-lg text-[#8793A3] hover:text-[#EDF5FF] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {liveHud.type === 'task-result' && (
                  <div
                    role="status"
                    data-testid="xero-task-result-hud"
                    className="px-4 py-2.5 flex items-center justify-between gap-3 bg-[#0B0E12]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Check className="w-4 h-4 text-[#39FF88] shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-[#EDF5FF] truncate">{liveHud.label}</div>
                        {liveHud.detail && (
                          <div className="text-[11px] text-[#8793A3] truncate">{liveHud.detail}</div>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => xeroStore.dismissLiveHud()}
                      aria-label="Dismiss result"
                      className="p-1 rounded-lg text-[#8793A3] hover:text-[#EDF5FF] cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
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
                <div className="mx-3 mb-2 px-3 py-2 rounded-2xl bg-[#12161B] border border-white/10 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <span className="font-semibold text-[#EDF5FF] mr-1.5">{notification.title}:</span>
                    <span className="text-[#8793A3]">{notification.detail}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => xeroStore.dismissNotification()}
                    aria-label="Dismiss notification"
                    className="text-[#8793A3] hover:text-[#EDF5FF] p-0.5 shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* COMPACT CONTEXTUAL MENU IN NOTCH */}
          <AnimatePresence initial={false}>
            {menuOpen && (
              <motion.div
                key="context-menu-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={activeSpring}
                className="overflow-hidden"
              >
                <NotchContextMenu />
              </motion.div>
            )}
          </AnimatePresence>

          {/* EXPANDED DYNAMIC ISLAND PANEL */}
          <AnimatePresence initial={false}>
            {islandExpanded && !menuOpen && (
              <motion.div
                key="expanded-panel"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={activeSpring}
                className="overflow-hidden border-t border-white/8"
              >
                <div className="px-3.5 pb-3.5 pt-2.5">
                  <nav aria-label="XERO island views" className="flex items-center justify-between gap-1 mb-3 overflow-x-auto">
                    {(
                      [
                        { id: 'chat', label: 'Assistant', icon: Sparkles },
                        { id: 'timers', label: `Timers${timers.length ? ` (${timers.length})` : ''}`, icon: Timer },
                        { id: 'music', label: 'Music', icon: Music },
                        { id: 'clipboard', label: `Clipboard (${clipboard.length})`, icon: Clipboard },
                        { id: 'files', label: `Shelf (${files.length})`, icon: FolderOpen },
                      ] as Array<{ id: IslandWidgetTab; label: string; icon: React.ComponentType<{ className?: string }> }>
                    ).map((tab) => {
                      const Icon = tab.icon;
                      const active = activeWidgetTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => xeroStore.setActiveWidgetTab(tab.id)}
                          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                            active
                              ? 'bg-[#12161B] text-[#EDF5FF] border border-white/12'
                              : 'text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/5'
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          <span>{tab.label}</span>
                        </button>
                      );
                    })}
                  </nav>

                  {/* TAB 1: THREE INDEPENDENT MODES — COMMAND | DICTATE | WRITE */}
                  {activeWidgetTab === 'chat' && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 pb-1 border-b border-white/6">
                        <div className="flex items-center gap-1" role="tablist" aria-label="Interaction mode">
                          {(
                            [
                              { id: 'command', label: 'Command' },
                              { id: 'dictate', label: 'Dictate' },
                              { id: 'write', label: 'Write' },
                            ] as Array<{ id: InteractionMode; label: string }>
                          ).map((mode) => (
                            <button
                              key={mode.id}
                              type="button"
                              role="tab"
                              aria-selected={interactionMode === mode.id}
                              onClick={() => xeroStore.setInteractionMode(mode.id)}
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                                interactionMode === mode.id
                                  ? 'bg-[#12161B] text-[#EDF5FF] border border-white/15'
                                  : 'text-[#8793A3] hover:text-[#EDF5FF]'
                              }`}
                            >
                              {mode.label}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => void triggerScreenAssist()}
                          disabled={screenAssistActive}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#12161B] hover:bg-white/10 border border-white/10 text-[10px] text-[#EDF5FF] cursor-pointer"
                          title="Explicit screen frame assistance"
                        >
                          <Monitor className="w-3 h-3" style={{ color: accent }} />
                          <span>{screenAssistActive ? 'Capturing…' : 'Screen'}</span>
                        </button>
                      </div>

                      {/* MODE A: COMMAND MODE */}
                      {interactionMode === 'command' && (
                        <div>
                          <div ref={chatScrollRef} className="max-h-48 overflow-y-auto space-y-2.5 pr-1 mb-2.5">
                            {messages.map((msg) => (
                              <motion.div
                                key={msg.id}
                                initial={reducedMotion ? false : { opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.18 }}
                                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                              >
                                <div
                                  className={`max-w-[88%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${
                                    msg.role === 'user'
                                      ? 'bg-[#12161B] text-[#EDF5FF] border border-white/10'
                                      : 'bg-white/[0.04] text-[#EDF5FF] border border-white/6'
                                  }`}
                                >
                                  {msg.text}
                                </div>
                                {msg.role === 'assistant' && msg.provider && (
                                  <span className="mt-1 px-1 text-[10px] text-[#8793A3]">
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
                                <div className="max-w-[88%] px-3 py-2 rounded-2xl text-[13px] leading-relaxed bg-white/[0.04] text-[#EDF5FF] border border-[#00E5FF]/30 whitespace-pre-wrap">
                                  {streamingText}
                                </div>
                              </div>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
                            {[
                              { label: 'Timer 1m', cmd: 'set timer 1m' },
                              { label: '24 * 17', cmd: '24 * 17' },
                              { label: music.playing ? 'Pause music' : 'Play music', cmd: music.playing ? 'pause music' : 'play music' },
                              { label: 'Screenshot', cmd: 'take screenshot' },
                              { label: 'Breathe', cmd: 'breathe' },
                              { label: 'Water +250ml', cmd: 'log water' },
                            ].map((q) => (
                              <button
                                key={q.label}
                                type="button"
                                onClick={() => void executePrompt(q.cmd)}
                                className="px-2 py-1 rounded-lg text-[11px] text-[#8793A3] hover:text-[#EDF5FF] bg-[#12161B] hover:bg-white/10 border border-white/8 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                              >
                                {q.label}
                              </button>
                            ))}
                          </div>

                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              void executePrompt(promptInput);
                            }}
                            className="flex items-center gap-2"
                          >
                            <input
                              type="text"
                              value={promptInput}
                              onChange={(e) => setPromptInput(e.target.value)}
                              placeholder={`Ask ${settings.personalization.assistantName} a command…`}
                              aria-label="Message XERO"
                              className="flex-1 min-w-0 px-3.5 py-2 rounded-xl bg-[#050608] border border-white/12 text-sm text-[#EDF5FF] placeholder:text-[#8793A3] focus:outline-none focus:border-[#00E5FF]"
                            />
                            <button
                              type="submit"
                              disabled={!promptInput.trim() || isThinking}
                              aria-label="Send message"
                              className="p-2.5 rounded-xl bg-[#00E5FF] text-[#050608] font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity shrink-0 cursor-pointer"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          </form>
                        </div>
                      )}

                      {/* MODE B: DICTATE MODE */}
                      {interactionMode === 'dictate' && (
                        <div data-testid="xero-dictate-panel" className="space-y-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1">
                              {(
                                [
                                  { id: 'verbatim', label: 'Verbatim' },
                                  { id: 'clean', label: 'Clean' },
                                  { id: 'ai-polished', label: 'Polished' },
                                ] as Array<{ id: DictationStyle; label: string }>
                              ).map((st) => (
                                <button
                                  key={st.id}
                                  type="button"
                                  onClick={() =>
                                    xeroStore.updateSettings((p) => ({
                                      ...p,
                                      voice: { ...p.voice, dictationStyle: st.id },
                                    }))
                                  }
                                  className={`px-2 py-1 rounded-lg text-[10px] border cursor-pointer ${
                                    settings.voice.dictationStyle === st.id
                                      ? 'bg-[#12161B] border-[#00E5FF]/50 text-[#EDF5FF]'
                                      : 'bg-[#050608] border-white/8 text-[#8793A3]'
                                  }`}
                                >
                                  {st.label}
                                </button>
                              ))}
                            </div>
                            <span className="text-[10px] text-[#8793A3] font-mono-tabular">
                              {settings.voice.dictationLang}
                            </span>
                          </div>

                          <textarea
                            rows={2}
                            value={dictationRaw}
                            onChange={(e) => setDictationRaw(e.target.value)}
                            placeholder='Speak via mic or type here — try "scratch that", "comma", "new line", "bullet point"…'
                            aria-label="Raw dictation input"
                            className="w-full px-3 py-2 rounded-xl bg-[#050608] border border-white/10 text-xs text-[#EDF5FF] placeholder:text-[#8793A3] focus:outline-none focus:border-[#00E5FF]"
                          />

                          <div className="p-2.5 rounded-xl bg-[#12161B] border border-white/10 space-y-1.5">
                            <div className="flex items-center justify-between text-[10px] text-[#8793A3]">
                              <span>Formatted Output (ready to copy)</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setDictationRaw('');
                                    setDictationEdited('');
                                  }}
                                  className="hover:text-[#EDF5FF] cursor-pointer"
                                >
                                  Clear
                                </button>
                                <button
                                  type="button"
                                  disabled={!dictationEdited}
                                  onClick={() => copyWithFeedback(dictationEdited, 'dictate')}
                                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-[#00E5FF] text-[#050608] font-semibold disabled:opacity-40 cursor-pointer"
                                >
                                  {copiedId === 'dictate' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                                  <span>{copiedId === 'dictate' ? 'Copied' : 'Copy'}</span>
                                </button>
                              </div>
                            </div>
                            <div className="text-xs text-[#EDF5FF] whitespace-pre-wrap min-h-[28px]">
                              {dictationEdited || 'Your formatted dictation will appear here.'}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* MODE C: WRITE MODE */}
                      {interactionMode === 'write' && (
                        <div data-testid="xero-write-panel" className="space-y-2.5">
                          <div className="flex items-center gap-1 overflow-x-auto pb-1">
                            {WRITE_TASKS.map((t) => (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => setWriteTask(t.id)}
                                className={`px-2 py-1 rounded-lg text-[10px] whitespace-nowrap shrink-0 border cursor-pointer ${
                                  writeTask === t.id
                                    ? 'bg-[#12161B] border-[#00E5FF]/60 text-[#EDF5FF]'
                                    : 'bg-[#050608] border-white/8 text-[#8793A3] hover:text-[#EDF5FF]'
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
                            className="w-full px-3 py-2 rounded-xl bg-[#050608] border border-white/10 text-xs text-[#EDF5FF] placeholder:text-[#8793A3] focus:outline-none focus:border-[#00E5FF]"
                          />

                          <div className="flex items-center justify-between gap-2">
                            <button
                              type="button"
                              disabled={!writeInput.trim() || isThinking}
                              onClick={() => void executeWriteTask()}
                              className="px-3 py-1.5 rounded-xl bg-[#00E5FF] text-[#050608] text-xs font-semibold disabled:opacity-40 cursor-pointer"
                            >
                              {isThinking ? 'Drafting…' : `Generate ${WRITE_TASKS.find((w) => w.id === writeTask)?.label}`}
                            </button>
                            {writeOutput && (
                              <button
                                type="button"
                                onClick={() => copyWithFeedback(writeOutput, 'write')}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#12161B] border border-white/12 text-xs text-[#EDF5FF] cursor-pointer"
                              >
                                {copiedId === 'write' ? <Check className="w-3.5 h-3.5 text-[#39FF88]" /> : <Copy className="w-3.5 h-3.5" />}
                                <span>{copiedId === 'write' ? 'Copied' : 'Copy Draft'}</span>
                              </button>
                            )}
                          </div>

                          {writeOutput && (
                            <textarea
                              rows={3}
                              value={writeOutput}
                              onChange={(e) => setWriteOutput(e.target.value)}
                              aria-label="Generated draft output"
                              className="w-full px-3 py-2 rounded-xl bg-[#12161B] border border-white/10 text-xs text-[#EDF5FF] leading-relaxed focus:outline-none focus:border-[#00E5FF]"
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: TIMERS & REMINDERS */}
                  {activeWidgetTab === 'timers' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-[#8793A3]">Quick Timers</span>
                        <div className="flex items-center gap-1.5">
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
                              className="px-2.5 py-1 rounded-lg bg-[#12161B] hover:bg-white/10 border border-white/10 text-xs font-mono-tabular text-[#EDF5FF] cursor-pointer"
                            >
                              +{preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {timers.length === 0 ? (
                        <p className="text-xs text-[#8793A3] py-2">No active timers. Start a preset above or ask XERO.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-32 overflow-y-auto">
                          {timers.map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#12161B] border border-white/8"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-medium text-[#EDF5FF] truncate">{t.label}</div>
                                <div className="font-mono-tabular text-sm text-[#00E5FF]">
                                  {formatClock(computeRemainingSeconds(t))}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => xeroStore.toggleTimer(t.id)}
                                  aria-label={t.running ? `Pause ${t.label}` : `Resume ${t.label}`}
                                  className="p-1.5 rounded-lg text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/8 cursor-pointer"
                                >
                                  {t.running ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => xeroStore.removeTimer(t.id)}
                                  aria-label={`Delete ${t.label}`}
                                  className="p-1.5 rounded-lg text-[#8793A3] hover:text-[#FF4567] hover:bg-white/8 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
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
                        className="flex items-center gap-2 pt-1 border-t border-white/8"
                      >
                        <input
                          type="text"
                          value={reminderDraft}
                          onChange={(e) => setReminderDraft(e.target.value)}
                          placeholder="Add 30s reminder…"
                          aria-label="New reminder text"
                          className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-[#050608] border border-white/10 text-xs text-[#EDF5FF] placeholder:text-[#8793A3] focus:outline-none focus:border-[#00E5FF]"
                        />
                        <button
                          type="submit"
                          aria-label="Add reminder"
                          className="px-2.5 py-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/10 text-xs text-[#EDF5FF] whitespace-nowrap cursor-pointer"
                        >
                          Remind
                        </button>
                      </form>

                      {reminders.length > 0 && (
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {reminders.map((r) => (
                            <div key={r.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-white/[0.03]">
                              <span className={r.completed ? 'line-through text-[#8793A3]' : 'text-[#EDF5FF]'}>{r.text}</span>
                              <button
                                type="button"
                                onClick={() => xeroStore.removeReminder(r.id)}
                                aria-label={`Remove reminder ${r.text}`}
                                className="text-[#8793A3] hover:text-[#FF4567] cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: MUSIC + SCRUB + SYNCED LYRICS */}
                  {activeWidgetTab === 'music' && (
                    <div className="p-3 rounded-2xl bg-[#12161B] border border-white/8 space-y-2.5">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center border border-white/15"
                            style={{
                              background: `radial-gradient(circle at 30% 30%, ${activeTrack.accent}, #0B0E12 85%)`,
                            }}
                          >
                            <Music className="w-4 h-4 text-[#050608]" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-[#EDF5FF] truncate">{activeTrack.title}</div>
                            <div className="text-xs text-[#8793A3] truncate">
                              {activeTrack.artist} · {activeTrack.bpm} BPM
                            </div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => xeroStore.toggleLyricsPinned()}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border cursor-pointer shrink-0 ${
                            lyricsPinned
                              ? 'bg-[#00E5FF]/15 border-[#00E5FF]/50 text-[#00E5FF]'
                              : 'bg-[#050608] border-white/10 text-[#8793A3] hover:text-[#EDF5FF]'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                          <span>{lyricsPinned ? 'Pinned' : 'Pin Lyrics'}</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="font-mono-tabular text-[11px] text-[#8793A3] w-9">
                          {formatClock(music.elapsedSec)}
                        </span>
                        <input
                          type="range"
                          aria-label="Seek audio position"
                          min={0}
                          max={activeTrack.durationSec}
                          value={Math.floor(music.elapsedSec)}
                          onChange={(e) => xeroStore.seekMusic(Number(e.target.value))}
                          className="flex-1 accent-[#00E5FF] cursor-pointer"
                        />
                        <span className="font-mono-tabular text-[11px] text-[#8793A3] w-10 text-right">
                          -{formatClock(Math.max(0, activeTrack.durationSec - music.elapsedSec))}
                        </span>
                      </div>

                      {activeLyric && (
                        <div className="text-[11px] text-[#EDF5FF]/90 bg-[#050608]/60 px-2.5 py-1.5 rounded-lg border border-white/6 truncate">
                          ♪ {activeLyric.text}
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => xeroStore.prevTrack()}
                            aria-label="Previous track"
                            className="p-2 rounded-full text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/8 cursor-pointer"
                          >
                            <SkipBack className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => (music.playing ? xeroStore.pauseMusic() : xeroStore.playMusic())}
                            aria-label={music.playing ? 'Pause music' : 'Play music'}
                            className="p-2.5 rounded-full text-[#050608] hover:opacity-90 cursor-pointer"
                            style={{ backgroundColor: activeTrack.accent }}
                          >
                            {music.playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => xeroStore.nextTrack()}
                            aria-label="Next track"
                            className="p-2 rounded-full text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/8 cursor-pointer"
                          >
                            <SkipForward className="w-4 h-4" />
                          </button>
                        </div>

                        <div className="flex items-center gap-2 flex-1 max-w-[190px]">
                          <button
                            type="button"
                            onClick={() => xeroStore.toggleMute()}
                            aria-label={muted ? 'Unmute' : 'Mute'}
                            className="text-[#8793A3] hover:text-[#EDF5FF] cursor-pointer"
                          >
                            {muted || volume === 0 ? (
                              <VolumeX className="w-4 h-4 text-[#FF4567]" />
                            ) : (
                              <Volume2 className="w-4 h-4 text-[#00E5FF]" />
                            )}
                          </button>
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={muted ? 0 : volume}
                            onChange={(e) => xeroStore.setVolume(Number(e.target.value))}
                            aria-label="Master Volume"
                            className="flex-1 accent-[#00E5FF] cursor-pointer"
                          />
                          <span className="font-mono-tabular text-[11px] text-[#8793A3] w-8 text-right">
                            {muted ? '0%' : `${volume}%`}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB 4: CLIPBOARD HISTORY */}
                  {activeWidgetTab === 'clipboard' && (
                    <div className="space-y-2.5">
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!clipboardDraft.trim()) return;
                          xeroStore.addClipboardItem(clipboardDraft);
                          setClipboardDraft('');
                        }}
                        className="flex items-center gap-2"
                      >
                        <input
                          type="text"
                          value={clipboardDraft}
                          onChange={(e) => setClipboardDraft(e.target.value)}
                          placeholder="Save snippet to clipboard shelf…"
                          aria-label="Clipboard snippet"
                          className="flex-1 min-w-0 px-3 py-1.5 rounded-xl bg-[#050608] border border-white/10 text-xs text-[#EDF5FF] placeholder:text-[#8793A3] focus:outline-none focus:border-[#00E5FF]"
                        />
                        <button
                          type="submit"
                          aria-label="Save clipboard snippet"
                          className="p-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/10 text-[#EDF5FF] cursor-pointer"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </form>

                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {clipboard.length === 0 ? (
                          <p className="text-xs text-[#8793A3] py-2">Clipboard history is empty.</p>
                        ) : (
                          clipboard.map((c) => (
                            <div
                              key={c.id}
                              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#12161B] border border-white/8"
                            >
                              <button
                                type="button"
                                onClick={() => {
                                  void navigator.clipboard?.writeText(c.text).catch(() => {});
                                  xeroStore.pushNotification('Copied', c.text.slice(0, 42), 'success');
                                }}
                                className="text-left text-xs text-[#EDF5FF] truncate flex-1 cursor-pointer hover:text-[#00E5FF]"
                                title="Click to copy"
                              >
                                {c.text}
                              </button>
                              <button
                                type="button"
                                onClick={() => xeroStore.removeClipboardItem(c.id)}
                                aria-label="Delete clipboard entry"
                                className="text-[#8793A3] hover:text-[#FF4567] p-1 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  {/* TAB 5: FILE SHELF & CANVAS IMAGE COPY TOOLS */}
                  {activeWidgetTab === 'files' && (
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-2xl border border-dashed border-white/20 bg-[#050608]/60">
                        <span className="text-xs text-[#8793A3]">
                          Drag files, snap, or edit copies ({memories.length} memories)
                        </span>
                        <input
                          ref={fileInputRef}
                          type="file"
                          multiple
                          className="hidden"
                          onChange={(e) => handleFilesDrop(e.target.files)}
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => xeroStore.triggerScreenshot()}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#12161B] hover:bg-white/10 border border-white/10 text-xs text-[#EDF5FF] whitespace-nowrap cursor-pointer"
                          >
                            <Camera className="w-3.5 h-3.5 text-[#00E5FF]" />
                            <span>Snap</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#12161B] hover:bg-white/10 border border-white/10 text-xs text-[#EDF5FF] whitespace-nowrap cursor-pointer"
                          >
                            <Upload className="w-3.5 h-3.5 text-[#00E5FF]" />
                            <span>Add File</span>
                          </button>
                        </div>
                      </div>

                      {files.length === 0 ? (
                        <p className="text-xs text-[#8793A3] py-1">No files on shelf yet.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-40 overflow-y-auto">
                          {files.map((f) => (
                            <div
                              key={f.id}
                              className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#12161B] border border-white/8"
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {f.previewDataUrl ? (
                                  <img
                                    src={f.previewDataUrl}
                                    alt={f.name}
                                    className="w-10 h-6 rounded object-cover border border-white/15 shrink-0"
                                  />
                                ) : (
                                  <FileText className="w-4 h-4 text-[#00E5FF] shrink-0" />
                                )}
                                <div className="min-w-0">
                                  <div className="text-xs font-medium text-[#EDF5FF] truncate">{f.name}</div>
                                  <div className="text-[11px] text-[#8793A3] font-mono-tabular">
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
                                      className="px-1.5 py-0.5 rounded bg-[#050608] border border-white/10 text-[10px] text-[#EDF5FF] hover:border-[#00E5FF] cursor-pointer"
                                      title="Save 50% resized new copy"
                                    >
                                      50%
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => void xeroStore.applyShelfImageOp('rotate-90', f.id)}
                                      className="px-1.5 py-0.5 rounded bg-[#050608] border border-white/10 text-[10px] text-[#EDF5FF] hover:border-[#00E5FF] cursor-pointer"
                                      title="Save 90° rotated new copy"
                                    >
                                      90°
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => downloadDataUrl(f.previewDataUrl!, f.name)}
                                      aria-label={`Download ${f.name}`}
                                      className="text-[#8793A3] hover:text-[#00E5FF] p-1 cursor-pointer"
                                    >
                                      <Download className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                                {!f.mimeType.startsWith('image/') && f.previewText && (
                                  <button
                                    type="button"
                                    onClick={() => xeroStore.summarizeLatestDoc(f.id)}
                                    className="px-1.5 py-0.5 rounded bg-[#050608] border border-white/10 text-[10px] text-[#EDF5FF] cursor-pointer"
                                  >
                                    Summary
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => xeroStore.removeShelfFile(f.id)}
                                  aria-label={`Remove ${f.name}`}
                                  className="text-[#8793A3] hover:text-[#FF4567] p-1 cursor-pointer"
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

      {/* Cute floating whisper reaction positioned under the notch */}
      <AnimatePresence>
        {reactionWhisper && !isPanelOpen && !liveHud && !notification && (
          <motion.div
            key={reactionWhisper}
            role="status"
            initial={reducedMotion ? false : { opacity: 0, y: -6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.92 }}
            transition={NOTCH_OPEN_SPRING}
            className="pointer-events-none fixed top-14 left-1/2 -translate-x-1/2 z-50 px-3 py-1 rounded-full bg-[#0B0E12]/95 border border-white/12 text-xs text-[#EDF5FF] shadow-lg backdrop-blur-md whitespace-nowrap"
          >
            {reactionWhisper}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
