import React, { useMemo, useState } from 'react';
import {
  Activity,
  AppWindow,
  ArrowDown,
  ArrowUp,
  Battery,
  BatteryCharging,
  Camera,
  CheckSquare,
  Clock,
  Droplets,
  ExternalLink,
  FileText,
  FolderOpen,
  Globe,
  Grid,
  Headphones,
  Image as ImageIcon,
  Keyboard,
  Maximize2,
  Moon,
  Music,
  Palette,
  Pause,
  Pin,
  Play,
  Plus,
  RotateCw,
  ScrollText,
  Settings2,
  SkipBack,
  SkipForward,
  Sliders,
  Square,
  Sun,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  Wind,
} from 'lucide-react';
import { xeroStore, useXeroStore } from '../../core/store';
import { BUILTIN_TRACKS } from '../../core/audioEngine';
import {
  APPEARANCE_PRESETS,
  WORLD_CLOCK_CITIES,
  formatWorldTime,
  getActiveLyricIndex,
} from '../../core/productivity';
import type { MenuCategory, NotchShape } from '../../core/types';

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

const MENU_CATEGORIES: Array<{
  id: MenuCategory;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'widgets', label: 'Widgets', icon: Grid },
  { id: 'system', label: 'System', icon: Sliders },
  { id: 'apps', label: 'Apps', icon: AppWindow },
  { id: 'music', label: 'Music', icon: Music },
  { id: 'productivity', label: 'Productivity', icon: CheckSquare },
  { id: 'shelf', label: 'Shelf', icon: FolderOpen },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'studio', label: 'Studio', icon: Settings2 },
];

export const NotchContextMenu: React.FC = () => {
  const state = useXeroStore();
  const {
    settings,
    activeMenuCategory,
    islandPosition,
    music,
    lyricsPinned,
    volume,
    muted,
    systemStatus,
    todos,
    notes,
    waterMl,
    stopwatch,
    shortcuts,
    files,
    clipboard,
    timers,
  } = state;

  const [todoDraft, setTodoDraft] = useState('');
  const [todoListType, setTodoListType] = useState<'todo' | 'shopping'>('todo');
  const [noteDraft, setNoteDraft] = useState('');
  const [newShortcutLabel, setNewShortcutLabel] = useState('');
  const [newShortcutUrl, setNewShortcutUrl] = useState('');
  const [prodView, setProdView] = useState<'lists' | 'stopwatch' | 'notes' | 'clocks'>('lists');

  const accent = settings.appearance.accentColor;
  const activeTrack = BUILTIN_TRACKS[music.trackIndex % BUILTIN_TRACKS.length];
  const activeLyricIdx = useMemo(
    () => getActiveLyricIndex(activeTrack.lyrics, music.elapsedSec),
    [activeTrack.lyrics, music.elapsedSec]
  );

  return (
    <div
      data-testid="xero-context-menu"
      className="border-t border-white/8 px-3.5 pb-3.5 pt-2.5 bg-[#030407]/98"
    >
      {/* Category Navigation Strip */}
      <nav
        aria-label="XERO contextual menu categories"
        className="flex items-center gap-1 overflow-x-auto pb-2 mb-2.5 border-b border-white/8"
      >
        {MENU_CATEGORIES.map((cat) => {
          const Icon = cat.icon;
          const active = activeMenuCategory === cat.id;
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => xeroStore.setMenuCategory(cat.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#12161B] text-[#EDF5FF] border border-white/15'
                  : 'text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/5 border border-transparent'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </nav>

      {/* 1. WIDGETS */}
      {activeMenuCategory === 'widgets' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5">
            {(
              [
                { id: 'command', label: 'Command Mode', sub: 'R-Ctrl / Chat' },
                { id: 'dictate', label: 'Dictate Mode', sub: 'R-Alt / Clean' },
                { id: 'write', label: 'Write Mode', sub: 'Draft & Tone' },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => xeroStore.setInteractionMode(m.id)}
                className="p-2.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-left transition-colors cursor-pointer"
              >
                <div className="text-xs font-semibold text-[#EDF5FF]">{m.label}</div>
                <div className="text-[10px] text-[#8793A3] mt-0.5">{m.sub}</div>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => {
                xeroStore.updateTeleprompter((p) => ({ ...p, isOpen: !p.isOpen }));
                xeroStore.setMenuOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] cursor-pointer"
            >
              <ScrollText className="w-3.5 h-3.5" style={{ color: accent }} />
              <span>Teleprompter</span>
            </button>

            <button
              type="button"
              onClick={() => {
                xeroStore.triggerScreenshot();
                xeroStore.setMenuOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" style={{ color: accent }} />
              <span>Snapshot</span>
            </button>

            <button
              type="button"
              onClick={() => {
                xeroStore.triggerBreathingHud();
                xeroStore.setMenuOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] cursor-pointer"
            >
              <Wind className="w-3.5 h-3.5 text-[#FF5CA1]" />
              <span>Breathe</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (islandPosition.docked) {
                  xeroStore.setIslandPosition({
                    docked: false,
                    x: Math.round((window.innerWidth - 260) / 2),
                    y: 72,
                  });
                } else {
                  xeroStore.resetIslandPosition();
                }
                xeroStore.setMenuOpen(false);
              }}
              className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5 text-[#9C6BFF]" />
              <span>{islandPosition.docked ? 'Float Free' : 'Re-dock'}</span>
            </button>
          </div>
        </div>
      )}

      {/* 2. SYSTEM CONTROLS (Genuine Web Probes + Honest Windows Sandbox Note) */}
      {activeMenuCategory === 'system' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <div className="p-2.5 rounded-xl bg-[#12161B] border border-white/8">
              <div className="flex items-center gap-1.5 text-[10px] text-[#8793A3]">
                {systemStatus.charging ? (
                  <BatteryCharging className="w-3.5 h-3.5 text-[#39FF88]" />
                ) : (
                  <Battery className="w-3.5 h-3.5 text-[#39FF88]" />
                )}
                <span>Battery</span>
              </div>
              <div className="text-xs font-mono-tabular font-semibold text-[#EDF5FF] mt-1">
                {systemStatus.batteryPct !== null
                  ? `${systemStatus.batteryPct}%${systemStatus.charging ? ' · AC' : ''}`
                  : 'N/A (Desktop)'}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#12161B] border border-white/8">
              <div className="flex items-center gap-1.5 text-[10px] text-[#8793A3]">
                <Keyboard className="w-3.5 h-3.5 text-[#00E5FF]" />
                <span>Caps / Locale</span>
              </div>
              <div className="text-xs font-mono-tabular font-semibold text-[#EDF5FF] mt-1 truncate">
                {systemStatus.capsLock ? 'CAPS ON' : 'Caps Off'} · {systemStatus.keyboardLang}
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-[#12161B] border border-white/8">
              <div className="flex items-center gap-1.5 text-[10px] text-[#8793A3]">
                <Headphones className="w-3.5 h-3.5 text-[#9C6BFF]" />
                <span>Audio Outputs</span>
              </div>
              <div className="text-xs font-mono-tabular font-semibold text-[#EDF5FF] mt-1">
                {systemStatus.audioOutputCount !== null ? `${systemStatus.audioOutputCount} detected` : 'Default'}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void xeroStore.toggleWakeLock()}
              className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                systemStatus.wakeLockActive
                  ? 'bg-[#00E5FF]/12 border-[#00E5FF]/40 text-[#EDF5FF]'
                  : 'bg-[#12161B] border-white/8 text-[#EDF5FF]'
              }`}
            >
              <div className="flex items-center gap-1.5 text-[10px] text-[#8793A3]">
                <Activity className="w-3.5 h-3.5" style={{ color: accent }} />
                <span>Keep Awake</span>
              </div>
              <div className="text-xs font-semibold mt-1">
                {systemStatus.wakeLockActive ? 'Active' : 'Inactive'}
              </div>
            </button>
          </div>

          <div className="p-2.5 rounded-xl bg-[#12161B] border border-white/8 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => xeroStore.toggleMute()}
                aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                className="flex items-center gap-1.5 text-xs text-[#EDF5FF] cursor-pointer"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="w-3.5 h-3.5 text-[#FF4567]" />
                ) : (
                  <Volume2 className="w-3.5 h-3.5" style={{ color: accent }} />
                )}
                <span>Volume</span>
              </button>
              <input
                type="range"
                aria-label="System Audio Volume"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                onChange={(e) => xeroStore.setVolume(Number(e.target.value))}
                className="flex-1 accent-[#00E5FF] cursor-pointer"
              />
              <span className="font-mono-tabular text-[11px] text-[#8793A3] w-10 text-right">
                {muted ? 'MUTE' : `${volume}%`}
              </span>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/6">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => xeroStore.toggleNightLight()}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] border cursor-pointer ${
                    systemStatus.nightLight
                      ? 'bg-[#FFC857]/15 border-[#FFC857]/50 text-[#FFC857]'
                      : 'bg-[#050608] border-white/10 text-[#8793A3]'
                  }`}
                >
                  <Moon className="w-3 h-3" />
                  <span>Night Light</span>
                </button>
              </div>
              <div className="flex items-center gap-2 flex-1 max-w-[230px]">
                <Sun className="w-3.5 h-3.5 text-[#8793A3]" />
                <input
                  type="range"
                  aria-label="Preview Brightness Filter"
                  min={35}
                  max={100}
                  value={systemStatus.brightness}
                  onChange={(e) => xeroStore.setBrightness(Number(e.target.value))}
                  className="flex-1 accent-[#00E5FF] cursor-pointer"
                />
                <span className="font-mono-tabular text-[11px] text-[#8793A3] w-9 text-right">
                  {systemStatus.brightness}%
                </span>
              </div>
            </div>
          </div>

          <p className="text-[10px] text-[#8793A3] leading-relaxed px-1">
            Browser-safe controls active (volume, Night Light, dimmer, Wake Lock, battery/locale). OS Lock Screen, Wi-Fi/Bluetooth hardware switches, and hardware backlight require Windows native host.
          </p>
        </div>
      )}

      {/* 3. PINNED APPLICATIONS & SHORTCUTS (Max 8) */}
      {activeMenuCategory === 'apps' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-40 overflow-y-auto">
            {shortcuts.map((sc, idx) => (
              <div
                key={sc.id}
                className="flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#12161B] border border-white/8"
              >
                {sc.url === '#teleprompter' ? (
                  <button
                    type="button"
                    onClick={() => {
                      xeroStore.updateTeleprompter((p) => ({ ...p, isOpen: true }));
                      xeroStore.setMenuOpen(false);
                    }}
                    className="flex items-center gap-1.5 text-left min-w-0 flex-1 text-xs text-[#EDF5FF] hover:text-[#00E5FF] cursor-pointer"
                  >
                    <ScrollText className="w-3.5 h-3.5 shrink-0" style={{ color: accent }} />
                    <span className="truncate">{sc.label}</span>
                  </button>
                ) : (
                  <a
                    href={sc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 min-w-0 flex-1 text-xs text-[#EDF5FF] hover:text-[#00E5FF]"
                  >
                    <ExternalLink className="w-3.5 h-3.5 shrink-0 text-[#8793A3]" />
                    <span className="truncate">{sc.label}</span>
                    <span className="text-[10px] text-[#8793A3] font-mono-tabular">"{sc.alias}"</span>
                  </a>
                )}

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    disabled={idx === 0}
                    onClick={() => xeroStore.reorderShortcut(sc.id, -1)}
                    aria-label={`Move ${sc.label} up`}
                    className="p-1 text-[#8793A3] hover:text-[#EDF5FF] disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={idx === shortcuts.length - 1}
                    onClick={() => xeroStore.reorderShortcut(sc.id, 1)}
                    aria-label={`Move ${sc.label} down`}
                    className="p-1 text-[#8793A3] hover:text-[#EDF5FF] disabled:opacity-30 cursor-pointer"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => xeroStore.removeShortcut(sc.id)}
                    aria-label={`Unpin ${sc.label}`}
                    className="p-1 text-[#8793A3] hover:text-[#FF4567] cursor-pointer"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {shortcuts.length < 8 && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newShortcutLabel.trim() || !newShortcutUrl.trim()) return;
                xeroStore.addShortcut(newShortcutLabel, newShortcutUrl);
                setNewShortcutLabel('');
                setNewShortcutUrl('');
              }}
              className="flex items-center gap-1.5"
            >
              <input
                type="text"
                value={newShortcutLabel}
                onChange={(e) => setNewShortcutLabel(e.target.value)}
                placeholder="Name"
                aria-label="Shortcut name"
                className="w-28 px-2.5 py-1.5 rounded-lg bg-[#050608] border border-white/10 text-xs text-[#EDF5FF]"
              />
              <input
                type="url"
                value={newShortcutUrl}
                onChange={(e) => setNewShortcutUrl(e.target.value)}
                placeholder="https://…"
                aria-label="Shortcut URL"
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#050608] border border-white/10 text-xs text-[#EDF5FF]"
              />
              <button
                type="submit"
                aria-label="Pin shortcut"
                className="px-2.5 py-1.5 rounded-lg bg-[#12161B] hover:bg-white/10 border border-white/10 text-xs text-[#EDF5FF] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </form>
          )}
        </div>
      )}

      {/* 4. MUSIC & GENUINE TIMESTAMP-SYNCED LYRICS */}
      {activeMenuCategory === 'music' && (
        <div className="space-y-2.5">
          <div className="p-3 rounded-2xl bg-[#12161B] border border-white/8 space-y-2.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Adaptive track artwork badge */}
                <div
                  className="w-9 h-9 rounded-xl shrink-0 flex items-center justify-center border border-white/15"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, ${activeTrack.accent}, #0B0E12 85%)`,
                  }}
                >
                  <Music className="w-4 h-4 text-[#050608]" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#EDF5FF] truncate">{activeTrack.title}</div>
                  <div className="text-[11px] text-[#8793A3] truncate">
                    {activeTrack.artist} · {activeTrack.bpm} BPM
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => xeroStore.toggleLyricsPinned()}
                  aria-label={lyricsPinned ? 'Unpin lyrics strip' : 'Pin lyrics to workspace'}
                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] border cursor-pointer ${
                    lyricsPinned
                      ? 'bg-[#00E5FF]/15 border-[#00E5FF]/50 text-[#00E5FF]'
                      : 'bg-[#050608] border-white/10 text-[#8793A3] hover:text-[#EDF5FF]'
                  }`}
                >
                  <Pin className="w-3 h-3" />
                  <span>{lyricsPinned ? 'Pinned' : 'Pin Lyrics'}</span>
                </button>
              </div>
            </div>

            {/* Interactive scrubbable seek bar */}
            <div className="flex items-center gap-2">
              <span className="font-mono-tabular text-[10px] text-[#8793A3] w-9">
                {formatClock(music.elapsedSec)}
              </span>
              <input
                type="range"
                aria-label="Seek music track"
                min={0}
                max={activeTrack.durationSec}
                value={Math.floor(music.elapsedSec)}
                onChange={(e) => xeroStore.seekMusic(Number(e.target.value))}
                className="flex-1 accent-[#00E5FF] cursor-pointer"
              />
              <span className="font-mono-tabular text-[10px] text-[#8793A3] w-10 text-right">
                -{formatClock(Math.max(0, activeTrack.durationSec - music.elapsedSec))}
              </span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => xeroStore.prevTrack()}
                  aria-label="Previous track"
                  className="p-1.5 rounded-full text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/8 cursor-pointer"
                >
                  <SkipBack className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => (music.playing ? xeroStore.pauseMusic() : xeroStore.playMusic())}
                  aria-label={music.playing ? 'Pause music' : 'Play music'}
                  className="p-2 rounded-full text-[#050608] cursor-pointer"
                  style={{ backgroundColor: activeTrack.accent }}
                >
                  {music.playing ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                </button>
                <button
                  type="button"
                  onClick={() => xeroStore.nextTrack()}
                  aria-label="Next track"
                  className="p-1.5 rounded-full text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/8 cursor-pointer"
                >
                  <SkipForward className="w-3.5 h-3.5" />
                </button>
              </div>

              <span className="text-[11px] text-[#8793A3] truncate max-w-[230px]">
                {activeTrack.lyrics[activeLyricIdx]?.text}
              </span>
            </div>
          </div>

          {/* Timestamp-aligned synced lyrics */}
          <div className="max-h-24 overflow-y-auto space-y-1 px-1">
            {activeTrack.lyrics.map((line, i) => (
              <button
                key={`${line.timeSec}-${i}`}
                type="button"
                onClick={() => xeroStore.seekMusic(line.timeSec)}
                className={`w-full text-left flex items-center gap-2 px-2 py-1 rounded-lg text-[11px] transition-colors cursor-pointer ${
                  i === activeLyricIdx
                    ? 'bg-white/8 text-[#EDF5FF] font-medium'
                    : 'text-[#8793A3] hover:text-[#EDF5FF]'
                }`}
              >
                <span className="font-mono-tabular text-[10px] opacity-70">{formatClock(line.timeSec)}</span>
                <span className="truncate">{line.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 5. PRODUCTIVITY (Lists, Water, Pomodoro/Stopwatch, Notes, World Clocks) */}
      {activeMenuCategory === 'productivity' && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'lists', label: 'Lists & Water' },
                  { id: 'stopwatch', label: 'Focus & Watch' },
                  { id: 'notes', label: 'Notes' },
                  { id: 'clocks', label: 'Clocks' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setProdView(tab.id)}
                  className={`px-2 py-1 rounded-lg text-[11px] font-medium cursor-pointer ${
                    prodView === tab.id
                      ? 'bg-[#12161B] text-[#EDF5FF] border border-white/15'
                      : 'text-[#8793A3] hover:text-[#EDF5FF]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => xeroStore.logWater(250)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#12161B] border border-white/10 text-[11px] text-[#EDF5FF] cursor-pointer"
              title="Log +250ml water"
            >
              <Droplets className="w-3 h-3 text-[#00E5FF]" />
              <span className="font-mono-tabular">{waterMl} ml</span>
            </button>
          </div>

          {prodView === 'lists' && (
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
                  className="px-2 py-1.5 rounded-lg bg-[#050608] border border-white/10 text-[11px] text-[#EDF5FF]"
                >
                  <option value="todo">To-Do</option>
                  <option value="shopping">Shop</option>
                </select>
                <input
                  type="text"
                  value={todoDraft}
                  onChange={(e) => setTodoDraft(e.target.value)}
                  placeholder="Add item…"
                  aria-label="New list item"
                  className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-[#050608] border border-white/10 text-xs text-[#EDF5FF]"
                />
                <button
                  type="submit"
                  aria-label="Add list item"
                  className="px-2.5 py-1.5 rounded-lg bg-[#00E5FF] text-[#050608] text-xs font-semibold cursor-pointer"
                >
                  Add
                </button>
              </form>

              <div className="max-h-28 overflow-y-auto space-y-1">
                {todos.length === 0 ? (
                  <p className="text-xs text-[#8793A3]">
                    No items yet. Try voice: "Add milk, eggs, and coffee to my shopping list".
                  </p>
                ) : (
                  todos.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#12161B] border border-white/8 text-xs"
                    >
                      <label className="flex items-center gap-2 min-w-0 flex-1 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => xeroStore.toggleTodoItem(item.id)}
                          className="accent-[#00E5FF]"
                        />
                        <span className={item.done ? 'line-through text-[#8793A3] truncate' : 'text-[#EDF5FF] truncate'}>
                          {item.text}
                        </span>
                        <span className="text-[10px] text-[#8793A3] uppercase">{item.listType}</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => xeroStore.removeTodoItem(item.id)}
                        aria-label={`Delete ${item.text}`}
                        className="text-[#8793A3] hover:text-[#FF4567] cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {prodView === 'stopwatch' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[#12161B] border border-white/8">
                <div className="font-mono-tabular text-base font-semibold text-[#EDF5FF]">
                  {formatMs(stopwatch.elapsedMs)}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      stopwatch.running ? xeroStore.pauseStopwatch() : xeroStore.startStopwatch()
                    }
                    className="px-2.5 py-1 rounded-lg bg-[#00E5FF] text-[#050608] text-[11px] font-semibold cursor-pointer"
                  >
                    {stopwatch.running ? 'Pause' : 'Start'}
                  </button>
                  <button
                    type="button"
                    onClick={() => xeroStore.lapStopwatch()}
                    disabled={!stopwatch.running}
                    className="px-2 py-1 rounded-lg bg-[#050608] border border-white/10 text-[11px] text-[#EDF5FF] disabled:opacity-40 cursor-pointer"
                  >
                    Lap
                  </button>
                  <button
                    type="button"
                    onClick={() => xeroStore.resetStopwatch()}
                    className="px-2 py-1 rounded-lg bg-[#050608] border border-white/10 text-[11px] text-[#8793A3] cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#8793A3]">
                  Focus Presets ({timers.filter((t) => t.running).length} active)
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => xeroStore.startTimer(1500, 'Pomodoro 25m', 'pomodoro')}
                    className="px-2 py-1 rounded-lg bg-[#12161B] border border-white/10 text-[11px] text-[#EDF5FF] cursor-pointer"
                  >
                    25m Pomodoro
                  </button>
                  <button
                    type="button"
                    onClick={() => xeroStore.startTimer(300, 'Short Break 5m', 'break')}
                    className="px-2 py-1 rounded-lg bg-[#12161B] border border-white/10 text-[11px] text-[#EDF5FF] cursor-pointer"
                  >
                    5m Break
                  </button>
                </div>
              </div>
            </div>
          )}

          {prodView === 'notes' && (
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
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-[#050608] border border-white/10 text-xs text-[#EDF5FF]"
                />
                <button
                  type="submit"
                  className="px-2.5 py-1.5 rounded-lg bg-[#12161B] border border-white/10 text-xs text-[#EDF5FF] cursor-pointer"
                >
                  Save
                </button>
              </form>
              <div className="max-h-24 overflow-y-auto space-y-1">
                {notes.map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-[#12161B] border border-white/8 text-xs"
                  >
                    <span className="text-[#EDF5FF] truncate">{n.text}</span>
                    <button
                      type="button"
                      onClick={() => xeroStore.removeNote(n.id)}
                      aria-label="Delete note"
                      className="text-[#8793A3] hover:text-[#FF4567] cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {prodView === 'clocks' && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {WORLD_CLOCK_CITIES.map((city) => (
                <div
                  key={city.id}
                  className="p-2 rounded-xl bg-[#12161B] border border-white/8 text-center"
                >
                  <div className="flex items-center justify-center gap-1 text-[10px] text-[#8793A3]">
                    <Globe className="w-3 h-3" />
                    <span>{city.label}</span>
                  </div>
                  <div className="font-mono-tabular text-sm font-semibold text-[#EDF5FF] mt-0.5">
                    {formatWorldTime(city.timeZone)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 6. SHELF + CANVAS IMAGE COPY TOOLS + CLIPBOARD */}
      {activeMenuCategory === 'shelf' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs text-[#8793A3]">
            <span>{files.length} shelf item(s) · {clipboard.length} clipboard</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => xeroStore.triggerScreenshot()}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#12161B] border border-white/10 text-[11px] text-[#EDF5FF] cursor-pointer"
              >
                <Camera className="w-3 h-3 text-[#00E5FF]" />
                <span>Snap</span>
              </button>
              <button
                type="button"
                onClick={() => xeroStore.setActiveWidgetTab('files')}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[#12161B] border border-white/10 text-[11px] text-[#EDF5FF] cursor-pointer"
              >
                <Upload className="w-3 h-3 text-[#00E5FF]" />
                <span>Manage All</span>
              </button>
            </div>
          </div>

          <div className="max-h-36 overflow-y-auto space-y-1.5">
            {files.length === 0 ? (
              <p className="text-xs text-[#8793A3]">Drop an image or document onto XERO to transform or summarize it.</p>
            ) : (
              files.slice(0, 4).map((f) => (
                <div
                  key={f.id}
                  className="p-2 rounded-xl bg-[#12161B] border border-white/8 flex flex-wrap items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {f.previewDataUrl ? (
                      <img src={f.previewDataUrl} alt={f.name} className="w-8 h-5 rounded object-cover border border-white/15 shrink-0" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-[#00E5FF] shrink-0" />
                    )}
                    <span className="text-xs text-[#EDF5FF] truncate max-w-[160px]">{f.name}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    {f.mimeType.startsWith('image/') && f.previewDataUrl ? (
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
                          className="p-1 rounded bg-[#050608] border border-white/10 text-[#EDF5FF] hover:border-[#00E5FF] cursor-pointer"
                          title="Save 90° rotated new copy"
                        >
                          <RotateCw className="w-3 h-3" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void xeroStore.applyShelfImageOp('compress', f.id)}
                          className="px-1.5 py-0.5 rounded bg-[#050608] border border-white/10 text-[10px] text-[#EDF5FF] hover:border-[#00E5FF] cursor-pointer"
                          title="Save compressed JPEG copy"
                        >
                          JPG
                        </button>
                        <button
                          type="button"
                          onClick={() => void xeroStore.applyShelfImageOp('convert-png', f.id)}
                          className="px-1.5 py-0.5 rounded bg-[#050608] border border-white/10 text-[10px] text-[#EDF5FF] hover:border-[#00E5FF] cursor-pointer"
                          title="Save PNG copy"
                        >
                          PNG
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => xeroStore.summarizeLatestDoc(f.id)}
                        className="px-2 py-0.5 rounded bg-[#050608] border border-white/10 text-[10px] text-[#EDF5FF] hover:border-[#00E5FF] cursor-pointer"
                      >
                        Summarize
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 7. QUICK APPEARANCE CUSTOMIZER */}
      {activeMenuCategory === 'appearance' && (
        <div className="space-y-2.5">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {APPEARANCE_PRESETS.map((preset) => {
              const selected = settings.appearance.presetName === preset.name;
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => xeroStore.applyAppearancePreset(preset.name)}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[11px] border cursor-pointer ${
                    selected
                      ? 'bg-[#12161B] border-white/40 text-[#EDF5FF]'
                      : 'bg-[#050608] border-white/8 text-[#8793A3] hover:text-[#EDF5FF]'
                  }`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: preset.accentColor }}
                  />
                  <span className="truncate">{preset.name}</span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xl bg-[#12161B] border border-white/8">
              <span className="text-[11px] text-[#8793A3]">Shape</span>
              <div className="flex items-center gap-1">
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
                    className={`px-1.5 py-0.5 rounded text-[10px] capitalize cursor-pointer ${
                      settings.appearance.notchShape === shape
                        ? 'bg-[#00E5FF] text-[#050608] font-semibold'
                        : 'text-[#8793A3] hover:text-[#EDF5FF]'
                    }`}
                  >
                    {shape}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#12161B] border border-white/8">
              <span className="text-[11px] text-[#8793A3] shrink-0">Opacity</span>
              <input
                type="range"
                aria-label="Notch Opacity"
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
                className="flex-1 accent-[#00E5FF] cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-[#12161B] border border-white/8">
              <span className="text-[11px] text-[#8793A3] shrink-0">Edge Glow</span>
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
                className="flex-1 accent-[#00E5FF] cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
