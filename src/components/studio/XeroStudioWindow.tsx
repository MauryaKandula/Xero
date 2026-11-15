import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  Cpu,
  ExternalLink,
  HardDrive,
  Minus,
  Palette,
  RefreshCw,
  RotateCcw,
  Sliders,
  Smile,
  Trash2,
  User,
  Volume2,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { xeroStore, useXeroStore } from '../../core/store';
import { discoverLocalModels } from '../../core/aiClient';
import { ALL_EMOTIONS, EMOTION_SPECS } from '../../core/emotions';
import { audioService } from '../../core/audioEngine';
import { APPEARANCE_PRESETS } from '../../core/productivity';
import type {
  AIProviderMode,
  LocalLLMFormat,
  NotchShape,
  PersonalityTone,
  StudioTab,
  VoiceResponseMode,
} from '../../core/types';
import { XeroFace } from '../xero/XeroFace';

interface XeroStudioWindowProps {
  standalone?: boolean;
}

const PERSONALITY_OPTIONS: PersonalityTone[] = [
  'Friendly Cyberpunk',
  'Concise Technical',
  'Playful Companion',
  'Calm Minimalist',
];

const STUDIO_NAV: Array<{
  id: StudioTab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'general', label: 'General', icon: Sliders },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'ai', label: 'AI & Local LLM', icon: Cpu },
  { id: 'voice', label: 'Voice & Audio', icon: Volume2 },
  { id: 'personalization', label: 'Personalization', icon: User },
  { id: 'expressions', label: 'Expressions', icon: Smile },
  { id: 'advanced', label: 'Diagnostics', icon: Activity },
];

export const XeroStudioWindow: React.FC<XeroStudioWindowProps> = ({ standalone = false }) => {
  const state = useXeroStore();
  const { settings, studio, emotion, isOnline, geminiConfigured, memories, timers, files, clipboard } = state;

  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [localCheckState, setLocalCheckState] = useState<{
    status: 'idle' | 'checking' | 'ok' | 'error';
    message: string;
  }>({ status: 'idle', message: '' });
  const [newMemoryInput, setNewMemoryInput] = useState('');
  const [micDevices, setMicDevices] = useState<Array<{ deviceId: string; label: string }>>([]);
  const [vocabDraft, setVocabDraft] = useState(settings.voice.customVocabulary.join(', '));

  // Dragging state for desktop-simulated window
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  useEffect(() => {
    const nav = navigator as unknown as {
      mediaDevices?: { enumerateDevices?: () => Promise<MediaDeviceInfo[]> };
    };
    if (nav.mediaDevices?.enumerateDevices) {
      void nav.mediaDevices
        .enumerateDevices()
        .then((devices) => {
          const inputs = devices
            .filter((d) => d.kind === 'audioinput')
            .map((d, idx) => ({
              deviceId: d.deviceId || `mic-${idx}`,
              label: d.label || `Microphone ${idx + 1}`,
            }));
          setMicDevices(inputs);
        })
        .catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (standalone) return;
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      xeroStore.moveStudio(dragRef.current.origX + dx, dragRef.current.origY + dy);
    };
    const onPointerUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [standalone]);

  const handleTestLocalLLM = async () => {
    setLocalCheckState({ status: 'checking', message: 'Probing local endpoint…' });
    const res = await discoverLocalModels(settings.ai.localEndpoint, settings.ai.localFormat);
    if (res.ok) {
      setDiscoveredModels(res.models);
      if (res.models.length > 0 && !res.models.includes(settings.ai.localModel)) {
        xeroStore.updateSettings((prev) => ({
          ...prev,
          ai: { ...prev.ai, localModel: res.models[0] },
        }));
      }
      setLocalCheckState({
        status: 'ok',
        message:
          res.models.length > 0
            ? `Connected (${res.latencyMs ?? 0}ms) · ${res.models.length} model(s) detected`
            : `Endpoint reachable (${res.latencyMs ?? 0}ms), no models listed yet`,
      });
    } else {
      setLocalCheckState({
        status: 'error',
        message: res.error || 'Local LLM endpoint unreachable',
      });
    }
  };

  const handlePopOutWindow = () => {
    const url = `${window.location.origin}/?window=studio`;
    window.open(url, 'xero-studio-window', 'width=980,height=660');
  };

  const accent = settings.appearance.accentColor;

  const windowShellClass = standalone
    ? 'w-full min-h-screen bg-[#0B0E12] text-[#EDF5FF] flex flex-col'
    : 'fixed z-40 rounded-2xl bg-[#0B0E12]/96 backdrop-blur-2xl border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.82)] flex flex-col overflow-hidden';

  const windowStyle: React.CSSProperties = standalone
    ? {}
    : {
        left: `${Math.min(studio.x, Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 1280) - 360))}px`,
        top: `${studio.y}px`,
        width: 'min(940px, calc(100vw - 32px))',
        height: 'min(610px, calc(100vh - 130px))',
      };

  return (
    <section
      aria-label="XERO Studio Control Centre"
      data-testid="xero-studio-window"
      className={windowShellClass}
      style={windowStyle}
    >
      {/* Window Title Bar */}
      <header
        onPointerDown={(e) => {
          if (standalone) return;
          if ((e.target as HTMLElement).closest('button')) return;
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: studio.x,
            origY: studio.y,
          };
        }}
        className={`flex items-center justify-between gap-4 px-5 py-3 bg-[#050608]/85 border-b border-white/8 select-none ${
          standalone ? '' : 'cursor-grab active:cursor-grabbing'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: accent, boxShadow: `0 0 8px ${accent}` }}
          />
          <h1 className="font-display text-sm font-semibold tracking-tight text-[#EDF5FF] whitespace-nowrap">
            XERO Studio
          </h1>
          <span className="text-xs text-[#8793A3] whitespace-nowrap truncate">
            {standalone ? 'Standalone Window' : 'Independent Control Centre'}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!standalone && (
            <>
              <button
                type="button"
                onClick={handlePopOutWindow}
                aria-label="Pop out Studio into browser window"
                title="Open Studio in a separate browser window"
                className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/6 transition-colors whitespace-nowrap cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Pop Out</span>
              </button>
              <button
                type="button"
                onClick={() => xeroStore.minimizeStudio(true)}
                aria-label="Minimize Studio"
                className="p-1.5 rounded-lg text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/8 transition-colors cursor-pointer"
              >
                <Minus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => xeroStore.closeStudio()}
                aria-label="Close Studio"
                className="p-1.5 rounded-lg text-[#8793A3] hover:text-[#FF4567] hover:bg-white/8 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Main Split Workspace */}
      <div className="flex flex-1 min-h-0 flex-col md:flex-row">
        {/* Sidebar Navigation */}
        <nav
          aria-label="Studio settings sections"
          className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-white/8 p-3 flex md:flex-col gap-1 overflow-x-auto bg-[#050608]/35"
        >
          {STUDIO_NAV.map((item) => {
            const Icon = item.icon;
            const active = studio.activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => xeroStore.setStudioTab(item.id)}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-[#12161B] text-[#EDF5FF] border border-white/12'
                    : 'text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/5 border border-transparent'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* Content Viewport */}
        <main className="flex-1 min-w-0 overflow-y-auto p-6 space-y-6">
          {/* GENERAL */}
          {studio.activeTab === 'general' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#EDF5FF]">General Behaviour</h2>
                <p className="text-sm text-[#8793A3] mt-1">
                  Configure startup state, gaming coexistence, and Dynamic Island auto-collapse.
                </p>
              </div>

              <div className="divide-y divide-white/8 border border-white/10 rounded-xl bg-[#12161B]">
                <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Gaming Mode</div>
                    <div className="text-xs text-[#8793A3]">
                      Dims outer neon edge glow to minimize distraction during games or full-screen work.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.general.gamingMode}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        general: { ...p.general, gamingMode: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Launch Minimized</div>
                    <div className="text-xs text-[#8793A3]">
                      Start XERO in ultra-compact capsule mode on next launch.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.general.launchMinimized}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        general: { ...p.general, launchMinimized: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Audio Chimes</div>
                    <div className="text-xs text-[#8793A3]">
                      Play subtle Web Audio feedback for timers, reminders, and file drops.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.general.soundEffects}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        general: { ...p.general, soundEffects: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Spontaneous Companion Behaviour</div>
                    <div className="text-xs text-[#8793A3]">
                      Allow subtle idle sleepiness, gentle waking reactions, and occasional organic mood shifts.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.general.spontaneousBehavior}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        general: { ...p.general, spontaneousBehavior: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                </label>

                <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Auto-Expand on Track Change</div>
                    <div className="text-xs text-[#8793A3]">
                      Briefly expand the music strip when advancing to a new track.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.general.autoExpandOnTrackChange}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        general: { ...p.general, autoExpandOnTrackChange: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                </label>

                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Auto-Collapse Delay</div>
                    <div className="text-xs text-[#8793A3]">
                      Automatically return expanded island to compact state when idle.
                    </div>
                  </div>
                  <select
                    aria-label="Auto-Collapse Delay"
                    value={settings.general.autoCollapseMs}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        general: { ...p.general, autoCollapseMs: Number(e.target.value) },
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF]"
                  >
                    <option value={0}>Manual (Off)</option>
                    <option value={8000}>8 seconds</option>
                    <option value={15000}>15 seconds</option>
                    <option value={30000}>30 seconds</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* APPEARANCE */}
          {studio.activeTab === 'appearance' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#EDF5FF]">Appearance & Atmosphere</h2>
                <p className="text-sm text-[#8793A3] mt-1">
                  Customize HeyNixi notch geometry, theme presets, opacity, and refined neon edge illumination.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#12161B] border border-white/10 space-y-4">
                <div>
                  <div className="text-sm font-medium text-[#EDF5FF] mb-2">Theme Presets</div>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {APPEARANCE_PRESETS.map((opt) => {
                      const selected = settings.appearance.presetName === opt.name;
                      return (
                        <button
                          key={opt.name}
                          type="button"
                          onClick={() => xeroStore.applyAppearancePreset(opt.name)}
                          className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-[#050608] text-[#EDF5FF] border-white/35'
                              : 'bg-[#050608]/50 text-[#8793A3] border-white/8 hover:text-[#EDF5FF]'
                          }`}
                        >
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: opt.accentColor }}
                          />
                          <span className="truncate">{opt.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/8 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Notch Shape</div>
                    <div className="text-xs text-[#8793A3]">
                      Choose top-bezel cutout, soft rounded pill, or crisp squircle silhouette.
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {(['bezel', 'pill', 'squircle'] as NotchShape[]).map((shape) => (
                      <button
                        key={shape}
                        type="button"
                        onClick={() =>
                          xeroStore.updateSettings((p) => ({
                            ...p,
                            appearance: { ...p.appearance, notchShape: shape },
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs capitalize border cursor-pointer ${
                          settings.appearance.notchShape === shape
                            ? 'bg-[#00E5FF] text-[#050608] border-[#00E5FF] font-semibold'
                            : 'bg-[#050608] text-[#8793A3] border-white/10 hover:text-[#EDF5FF]'
                        }`}
                      >
                        {shape}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/8 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Dynamic Island Scale</div>
                    <div className="text-xs text-[#8793A3] font-mono-tabular">
                      {Math.round(settings.appearance.islandScale * 100)}%
                    </div>
                  </div>
                  <input
                    type="range"
                    aria-label="Dynamic Island Scale"
                    min={0.85}
                    max={1.2}
                    step={0.05}
                    value={settings.appearance.islandScale}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        appearance: { ...p.appearance, islandScale: parseFloat(e.target.value) },
                      }))
                    }
                    className="w-40 accent-[#00E5FF]"
                  />
                </div>

                <div className="pt-3 border-t border-white/8 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Surface Opacity</div>
                    <div className="text-xs text-[#8793A3] font-mono-tabular">
                      {Math.round(settings.appearance.islandOpacity * 100)}%
                    </div>
                  </div>
                  <input
                    type="range"
                    aria-label="Surface Opacity"
                    min={0.72}
                    max={1}
                    step={0.02}
                    value={settings.appearance.islandOpacity}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        appearance: { ...p.appearance, islandOpacity: parseFloat(e.target.value) },
                      }))
                    }
                    className="w-40 accent-[#00E5FF]"
                  />
                </div>

                <div className="pt-3 border-t border-white/8 flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Edge Glow & Border Illumination</div>
                    <div className="text-xs text-[#8793A3] font-mono-tabular">
                      Glow {Math.round(settings.appearance.glowIntensity * 100)}% · Border {Math.round(settings.appearance.borderIllumination * 100)}%
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      aria-label="Edge Glow Intensity"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.appearance.glowIntensity}
                      onChange={(e) =>
                        xeroStore.updateSettings((p) => ({
                          ...p,
                          appearance: { ...p.appearance, glowIntensity: parseFloat(e.target.value) },
                        }))
                      }
                      className="w-24 accent-[#00E5FF]"
                    />
                    <input
                      type="range"
                      aria-label="Border Illumination"
                      min={0}
                      max={1}
                      step={0.05}
                      value={settings.appearance.borderIllumination}
                      onChange={(e) =>
                        xeroStore.updateSettings((p) => ({
                          ...p,
                          appearance: { ...p.appearance, borderIllumination: parseFloat(e.target.value) },
                        }))
                      }
                      className="w-24 accent-[#00E5FF]"
                    />
                  </div>
                </div>

                <label className="pt-3 border-t border-white/8 flex items-center justify-between gap-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Show Media Progress Hairline</div>
                    <div className="text-xs text-[#8793A3]">
                      Display a subtle bottom playback bar while compact music is playing.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.appearance.showMediaProgress}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        appearance: { ...p.appearance, showMediaProgress: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                </label>

                <label className="pt-3 border-t border-white/8 flex items-center justify-between gap-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Reduced Motion</div>
                    <div className="text-xs text-[#8793A3]">
                      Disables blinking, gaze tracking, and speech oscillation animations.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.appearance.reducedMotion}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        appearance: { ...p.appearance, reducedMotion: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                </label>
              </div>
            </div>
          )}

          {/* AI & LOCAL LLM */}
          {studio.activeTab === 'ai' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#EDF5FF]">
                  AI Engine · Offline, Local LLM & Cloud
                </h2>
                <p className="text-sm text-[#8793A3] mt-1">
                  Run completely offline, route to your local Ollama / LM Studio server, or stream via server-side Gemini.
                </p>
              </div>

              {/* Provider Mode Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(
                  [
                    { id: 'auto', title: 'Auto Routing', sub: 'Smart fallback' },
                    { id: 'offline', title: 'Offline Core', sub: 'Zero network' },
                    { id: 'local-llm', title: 'Local LLM', sub: 'Ollama / LM Studio' },
                    { id: 'gemini', title: 'Gemini Cloud', sub: 'Server key' },
                  ] as Array<{ id: AIProviderMode; title: string; sub: string }>
                ).map((mode) => {
                  const active = settings.ai.providerMode === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() =>
                        xeroStore.updateSettings((p) => ({
                          ...p,
                          ai: { ...p.ai, providerMode: mode.id },
                        }))
                      }
                      className={`p-3 rounded-xl text-left border transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#12161B] border-[#00E5FF] text-[#EDF5FF]'
                          : 'bg-[#12161B]/50 border-white/8 text-[#8793A3] hover:text-[#EDF5FF]'
                      }`}
                    >
                      <div className="text-xs font-semibold">{mode.title}</div>
                      <div className="text-[11px] opacity-80 mt-0.5">{mode.sub}</div>
                    </button>
                  );
                })}
              </div>

              {/* Local LLM Configuration */}
              <div className="p-4 rounded-xl bg-[#12161B] border border-white/10 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <HardDrive className="w-4 h-4 text-[#00E5FF]" />
                    <h3 className="text-sm font-semibold text-[#EDF5FF]">Local LLM Endpoint</h3>
                  </div>
                  <select
                    aria-label="Local LLM API Format"
                    value={settings.ai.localFormat}
                    onChange={(e) => {
                      const nextFormat = e.target.value as LocalLLMFormat;
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        ai: {
                          ...p.ai,
                          localFormat: nextFormat,
                          localEndpoint:
                            nextFormat === 'ollama' ? 'http://127.0.0.1:11434' : 'http://127.0.0.1:1234/v1',
                        },
                      }));
                    }}
                    className="px-2.5 py-1 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF]"
                  >
                    <option value="ollama">Ollama (/api/chat)</option>
                    <option value="openai">OpenAI-Compatible (LM Studio / llama.cpp)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="local-endpoint-input" className="block text-xs text-[#8793A3] mb-1">
                      Endpoint URL
                    </label>
                    <input
                      id="local-endpoint-input"
                      type="url"
                      value={settings.ai.localEndpoint}
                      onChange={(e) =>
                        xeroStore.updateSettings((p) => ({
                          ...p,
                          ai: { ...p.ai, localEndpoint: e.target.value },
                        }))
                      }
                      placeholder="http://127.0.0.1:11434"
                      className="w-full px-3 py-2 rounded-lg bg-[#050608] border border-white/12 text-xs font-mono-tabular text-[#EDF5FF] focus:outline-none focus:border-[#00E5FF]"
                    />
                  </div>
                  <div>
                    <label htmlFor="local-model-input" className="block text-xs text-[#8793A3] mb-1">
                      Model Name
                    </label>
                    <input
                      id="local-model-input"
                      type="text"
                      value={settings.ai.localModel}
                      onChange={(e) =>
                        xeroStore.updateSettings((p) => ({
                          ...p,
                          ai: { ...p.ai, localModel: e.target.value },
                        }))
                      }
                      placeholder="llama3.2"
                      className="w-full px-3 py-2 rounded-lg bg-[#050608] border border-white/12 text-xs font-mono-tabular text-[#EDF5FF] focus:outline-none focus:border-[#00E5FF]"
                    />
                  </div>
                </div>

                {discoveredModels.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {discoveredModels.map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() =>
                          xeroStore.updateSettings((p) => ({
                            ...p,
                            ai: { ...p.ai, localModel: m },
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs font-mono-tabular border cursor-pointer ${
                          settings.ai.localModel === m
                            ? 'bg-[#00E5FF]/15 border-[#00E5FF] text-[#EDF5FF]'
                            : 'bg-[#050608] border-white/10 text-[#8793A3]'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleTestLocalLLM()}
                    disabled={localCheckState.status === 'checking'}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#050608] hover:bg-white/8 border border-white/15 text-xs font-medium text-[#EDF5FF] cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${localCheckState.status === 'checking' ? 'animate-spin' : ''}`} />
                    <span>Detect Local Models & Test</span>
                  </button>
                  {localCheckState.message && (
                    <span
                      className={`text-xs ${
                        localCheckState.status === 'ok'
                          ? 'text-[#39FF88]'
                          : localCheckState.status === 'error'
                            ? 'text-[#FFC857]'
                            : 'text-[#8793A3]'
                      }`}
                    >
                      {localCheckState.message}
                    </span>
                  )}
                </div>
              </div>

              {/* Cloud Gemini Status (No API Key UI — Server Managed) */}
              <div className="p-4 rounded-xl bg-[#12161B] border border-white/10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Bot className="w-4 h-4 text-[#9C6BFF]" />
                    <h3 className="text-sm font-semibold text-[#EDF5FF]">Gemini Cloud Engine</h3>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs">
                    {isOnline ? (
                      <Wifi className="w-3.5 h-3.5 text-[#39FF88]" />
                    ) : (
                      <WifiOff className="w-3.5 h-3.5 text-[#FFC857]" />
                    )}
                    <span className="text-[#8793A3]">
                      {!isOnline
                        ? 'Offline'
                        : geminiConfigured
                          ? 'Server-Managed Key Active'
                          : 'No Server Key (Using Local/Offline)'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs text-[#8793A3]">Gemini Model</span>
                  <select
                    aria-label="Gemini Model"
                    value={settings.ai.geminiModel}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        ai: {
                          ...p.ai,
                          geminiModel: e.target.value as 'gemini-4-hydrogen' | 'gemini-3.1-flash-lite',
                        },
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#050608] border border-white/12 text-xs font-mono-tabular text-[#EDF5FF]"
                  >
                    <option value="gemini-4-hydrogen">gemini-4-hydrogen (Balanced)</option>
                    <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Fast)</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="system-prompt-textarea" className="block text-xs text-[#8793A3] mb-1">
                    Custom System Instruction
                  </label>
                  <textarea
                    id="system-prompt-textarea"
                    rows={2}
                    value={settings.ai.systemPrompt}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        ai: { ...p.ai, systemPrompt: e.target.value },
                      }))
                    }
                    placeholder="Optional guidance for XERO across Local LLM & Gemini…"
                    className="w-full px-3 py-2 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF] placeholder:text-[#8793A3] focus:outline-none focus:border-[#00E5FF]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* VOICE & AUDIO */}
          {studio.activeTab === 'voice' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#EDF5FF]">Voice, Dictation & Privacy</h2>
                <p className="text-sm text-[#8793A3] mt-1">
                  Configure speech response modes, microphone selection, timeouts, custom vocabulary, and privacy.
                </p>
              </div>

              <div className="divide-y divide-white/8 border border-white/10 rounded-xl bg-[#12161B]">
                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Voice Response Mode</div>
                    <div className="text-xs text-[#8793A3]">Choose silent, gentle chimes, or spoken TTS responses.</div>
                  </div>
                  <select
                    aria-label="Voice Response Mode"
                    value={settings.voice.responseMode}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        voice: {
                          ...p.voice,
                          responseMode: e.target.value as VoiceResponseMode,
                          ttsEnabled: e.target.value === 'system-voice' || e.target.value === 'tts-provider',
                        },
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF]"
                  >
                    <option value="silent">Silent</option>
                    <option value="chimes">Chimes Only</option>
                    <option value="system-voice">System Voice (TTS)</option>
                    <option value="tts-provider">TTS Provider</option>
                  </select>
                </div>

                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Microphone Input</div>
                    <div className="text-xs text-[#8793A3]">Detected browser audio inputs.</div>
                  </div>
                  <select
                    aria-label="Microphone Input Device"
                    value={settings.voice.micDeviceId}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        voice: { ...p.voice, micDeviceId: e.target.value },
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF] max-w-[200px]"
                  >
                    <option value="default">System Default Mic</option>
                    {micDevices.map((m) => (
                      <option key={m.deviceId} value={m.deviceId}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Noise Suppression Preference</div>
                    <div className="text-xs text-[#8793A3]">
                      Request echo cancellation and noise suppression on supported microphones.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.voice.noiseSuppression}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        voice: { ...p.voice, noiseSuppression: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                </label>

                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Silence Auto-Stop</div>
                    <div className="text-xs text-[#8793A3] font-mono-tabular">
                      {(settings.voice.silenceTimeoutMs / 1000).toFixed(1)}s idle mic cutoff
                    </div>
                  </div>
                  <input
                    type="range"
                    aria-label="Silence Auto-Stop Timeout"
                    min={2000}
                    max={9000}
                    step={500}
                    value={settings.voice.silenceTimeoutMs}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        voice: { ...p.voice, silenceTimeoutMs: Number(e.target.value) },
                      }))
                    }
                    className="w-40 accent-[#00E5FF]"
                  />
                </div>

                <div className="flex items-center justify-between gap-4 p-4">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Dictation Language</div>
                    <div className="text-xs text-[#8793A3]">Supports English (US/India/UK), Hindi, Telugu, Japanese, German, Spanish.</div>
                  </div>
                  <select
                    aria-label="Dictation Language"
                    value={settings.voice.dictationLang}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        voice: { ...p.voice, dictationLang: e.target.value },
                      }))
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF]"
                  >
                    <option value="en-US">English (US)</option>
                    <option value="en-IN">English (India)</option>
                    <option value="hi-IN">Hindi (hi-IN)</option>
                    <option value="te-IN">Telugu (te-IN)</option>
                    <option value="en-GB">English (UK)</option>
                    <option value="ja-JP">Japanese</option>
                    <option value="de-DE">German</option>
                    <option value="es-ES">Spanish</option>
                  </select>
                </div>

                <div className="p-4 space-y-2">
                  <label htmlFor="custom-vocab-input" className="block text-sm font-medium text-[#EDF5FF]">
                    Custom Dictation Vocabulary
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="custom-vocab-input"
                      type="text"
                      value={vocabDraft}
                      onChange={(e) => setVocabDraft(e.target.value)}
                      placeholder="XERO, TypeScript, Ollama"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF]"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const list = vocabDraft
                          .split(',')
                          .map((s) => s.trim())
                          .filter(Boolean);
                        xeroStore.updateSettings((p) => ({
                          ...p,
                          voice: { ...p.voice, customVocabulary: list },
                        }));
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#050608] border border-white/15 text-xs text-[#EDF5FF] cursor-pointer"
                    >
                      Save Terms
                    </button>
                  </div>
                </div>

                <label className="flex items-center justify-between gap-4 p-4 cursor-pointer">
                  <div>
                    <div className="text-sm font-medium text-[#EDF5FF]">Privacy: Save Clipboard Snippets</div>
                    <div className="text-xs text-[#8793A3]">
                      When enabled, non-sensitive snippets save locally. Password/API key patterns are always skipped.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.privacy.captureClipboardHistory}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        privacy: { ...p.privacy, captureClipboardHistory: e.target.checked },
                      }))
                    }
                    className="w-4 h-4 accent-[#00E5FF]"
                  />
                </label>

                <div className="p-4 flex items-center justify-between gap-4">
                  <div className="text-xs text-[#8793A3]">Preview current voice settings</div>
                  <button
                    type="button"
                    onClick={() =>
                      audioService.speakText(
                        `Hello, I am ${settings.personalization.assistantName}. Voice output is calibrated.`,
                        {
                          enabled: true,
                          responseMode: 'system-voice',
                          rate: settings.voice.ttsRate,
                          pitch: settings.voice.ttsPitch,
                          lang: settings.voice.dictationLang,
                        }
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-[#00E5FF] text-[#050608] text-xs font-semibold cursor-pointer"
                  >
                    Test Voice
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* PERSONALIZATION & MEMORY */}
          {studio.activeTab === 'personalization' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#EDF5FF]">Personalization & Memory</h2>
                <p className="text-sm text-[#8793A3] mt-1">
                  Customize assistant identity and manage persistent local memory facts.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#12161B] border border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="assistant-name-input" className="block text-xs text-[#8793A3] mb-1">
                    Assistant Name
                  </label>
                  <input
                    id="assistant-name-input"
                    type="text"
                    value={settings.personalization.assistantName}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        personalization: { ...p.personalization, assistantName: e.target.value || 'XERO' },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF]"
                  />
                </div>
                <div>
                  <label htmlFor="user-name-input" className="block text-xs text-[#8793A3] mb-1">
                    Your Name
                  </label>
                  <input
                    id="user-name-input"
                    type="text"
                    value={settings.personalization.userName}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        personalization: { ...p.personalization, userName: e.target.value },
                      }))
                    }
                    placeholder="Optional"
                    className="w-full px-3 py-2 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF]"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label htmlFor="personality-tone-select" className="block text-xs text-[#8793A3] mb-1">
                    Personality Tone
                  </label>
                  <select
                    id="personality-tone-select"
                    value={settings.personalization.personalityTone}
                    onChange={(e) =>
                      xeroStore.updateSettings((p) => ({
                        ...p,
                        personalization: {
                          ...p.personalization,
                          personalityTone: e.target.value as PersonalityTone,
                        },
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF]"
                  >
                    {PERSONALITY_OPTIONS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#12161B] border border-white/10 space-y-3">
                <div className="text-sm font-semibold text-[#EDF5FF]">Persistent Local Memory</div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newMemoryInput.trim()) return;
                    xeroStore.addMemory(newMemoryInput);
                    setNewMemoryInput('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={newMemoryInput}
                    onChange={(e) => setNewMemoryInput(e.target.value)}
                    placeholder="Add a fact for XERO to remember…"
                    aria-label="Add memory fact"
                    className="flex-1 px-3 py-2 rounded-lg bg-[#050608] border border-white/12 text-xs text-[#EDF5FF]"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 rounded-lg bg-[#00E5FF] text-[#050608] text-xs font-semibold cursor-pointer"
                  >
                    Save
                  </button>
                </form>

                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {memories.length === 0 ? (
                    <p className="text-xs text-[#8793A3]">No saved memories.</p>
                  ) : (
                    memories.map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-[#050608] border border-white/8 text-xs"
                      >
                        <span className="text-[#EDF5FF]">{m.fact}</span>
                        <button
                          type="button"
                          onClick={() => xeroStore.removeMemory(m.id)}
                          aria-label="Delete memory"
                          className="text-[#8793A3] hover:text-[#FF4567] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* EXPRESSIONS TESTER */}
          {studio.activeTab === 'expressions' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-lg font-semibold text-[#EDF5FF]">
                    Protected Expression Matrix (16 States)
                  </h2>
                  <p className="text-sm text-[#8793A3] mt-1">
                    Click any expression to trigger XERO live in the floating Dynamic Island.
                  </p>
                </div>
                <div className="px-4 py-2 rounded-xl bg-[#12161B] border border-white/10 flex items-center gap-3">
                  <XeroFace
                    emotion={emotion}
                    faceColor={settings.appearance.faceColor}
                    accentColor={accent}
                    reducedMotion={settings.appearance.reducedMotion}
                    size="compact"
                    interactiveGaze={false}
                  />
                  <div>
                    <div className="text-xs font-semibold text-[#EDF5FF]">{EMOTION_SPECS[emotion].label}</div>
                    <div className="text-[11px] text-[#8793A3]">{EMOTION_SPECS[emotion].description}</div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {ALL_EMOTIONS.map((emo) => {
                  const spec = EMOTION_SPECS[emo];
                  const active = emotion === emo;
                  return (
                    <button
                      key={emo}
                      type="button"
                      onClick={() => xeroStore.setEmotion(emo, true)}
                      className={`p-3 rounded-xl border text-left transition-colors cursor-pointer ${
                        active
                          ? 'bg-[#12161B] border-[#00E5FF] text-[#EDF5FF]'
                          : 'bg-[#12161B]/60 border-white/8 text-[#8793A3] hover:text-[#EDF5FF] hover:border-white/20'
                      }`}
                    >
                      <div className="text-xs font-semibold text-[#EDF5FF]">{spec.label}</div>
                      <div className="text-[11px] text-[#8793A3] mt-0.5 line-clamp-2">{spec.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* DIAGNOSTICS & ADVANCED */}
          {studio.activeTab === 'advanced' && (
            <div className="space-y-6 max-w-2xl">
              <div>
                <h2 className="font-display text-lg font-semibold text-[#EDF5FF]">Architecture & Diagnostics</h2>
                <p className="text-sm text-[#8793A3] mt-1">
                  Runtime telemetry for XERO Dynamic Island and XERO Studio window isolation.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-[#12161B] border border-white/10">
                  <div className="text-[11px] text-[#8793A3]">Network</div>
                  <div className="text-sm font-semibold text-[#EDF5FF] mt-1">
                    {isOnline ? 'Online' : 'Offline'}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#12161B] border border-white/10">
                  <div className="text-[11px] text-[#8793A3]">Timers</div>
                  <div className="text-sm font-semibold font-mono-tabular text-[#EDF5FF] mt-1">
                    {timers.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#12161B] border border-white/10">
                  <div className="text-[11px] text-[#8793A3]">Shelf Files</div>
                  <div className="text-sm font-semibold font-mono-tabular text-[#EDF5FF] mt-1">
                    {files.length}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-[#12161B] border border-white/10">
                  <div className="text-[11px] text-[#8793A3]">Clipboard</div>
                  <div className="text-sm font-semibold font-mono-tabular text-[#EDF5FF] mt-1">
                    {clipboard.length}
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#12161B] border border-white/10 space-y-2 text-xs text-[#8793A3]">
                <div className="text-sm font-semibold text-[#EDF5FF]">Window Lifecycle & Capability Boundaries</div>
                <p>
                  XERO Dynamic Island, Teleprompter, and XERO Studio operate as independent surfaces. In browser preview, floating overlay positioning, Night Light/dimmer filter, Canvas image tools, and 2D snapshots work locally, while OS-wide global hotkeys, Bluetooth/Wi-Fi hardware toggles, OS backlight, and external app text injection require the Windows native Electron/Tauri host (see docs/CAPABILITY_STATUS.md).
                </p>
              </div>

              <div className="flex items-center justify-between p-4 rounded-xl bg-[#12161B] border border-white/10">
                <div>
                  <div className="text-sm font-medium text-[#EDF5FF]">Reset Preferences</div>
                  <div className="text-xs text-[#8793A3]">Restore default appearance, AI, and voice settings.</div>
                </div>
                <button
                  type="button"
                  onClick={() => xeroStore.resetSettings()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#050608] hover:bg-[#FF4567]/15 border border-white/12 hover:border-[#FF4567]/50 text-xs text-[#EDF5FF] cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Defaults</span>
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </section>
  );
};
