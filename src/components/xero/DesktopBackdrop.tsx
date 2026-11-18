import React, { useState } from 'react';
import {
  Activity,
  Camera,
  ChevronDown,
  ChevronUp,
  FileText,
  Heart,
  Layers,
  SlidersHorizontal,
  Sparkles,
  Volume1,
  Volume2,
  Wind,
  X,
} from 'lucide-react';
import { xeroStore, useXeroStore } from '../../core/store';
import { BUILTIN_TRACKS } from '../../core/audioEngine';
import { getActiveLyricIndex } from '../../core/productivity';

/**
 * Pure obsidian desktop canvas for browser preview.
 * Keeps the default viewport completely distraction-free around XERO's top-docked
 * living notch, with optional test utilities tucked inside a collapsed corner drawer.
 */
export const DesktopBackdrop: React.FC = () => {
  const { studio, islandMode, petCount, volume, muted, systemStatus, music, lyricsPinned } =
    useXeroStore();
  const [toolsOpen, setToolsOpen] = useState(false);

  const isHiddenPeek = islandMode === 'minimized';
  const activeTrack = BUILTIN_TRACKS[music.trackIndex % BUILTIN_TRACKS.length];
  const activeLyric = activeTrack.lyrics[getActiveLyricIndex(activeTrack.lyrics, music.elapsedSec)];

  const handleSampleDropSeed = () => {
    xeroStore.addShelfFile({
      name: 'project-notes.md',
      sizeBytes: 1420,
      mimeType: 'text/markdown',
      previewText: '# XERO Quick Note\nLocal LLM endpoint: http://127.0.0.1:11434',
    });
    xeroStore.setIslandExpanded(true, 'files');
  };

  const brightnessOpacity = Math.max(0, Math.min(0.65, (100 - systemStatus.brightness) / 100));

  return (
    <div
      className="min-h-screen w-full relative overflow-hidden text-[#EDF5FF]"
      style={{
        background:
          'radial-gradient(125% 115% at 88% 95%, #1A2842 0%, #121B2E 32%, #0D1320 62%, #090C14 100%)',
      }}
    >
      {/* Subtle architectural curved arcs reminiscent of HeyNixi wallpaper in dark obsidian */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden opacity-45"
      >
        <div className="absolute -right-[14%] -bottom-[38%] w-[82vw] h-[82vw] rounded-full bg-white/[0.025]" />
        <div className="absolute -right-[4%] -bottom-[26%] w-[58vw] h-[58vw] rounded-full bg-[#3B82F6]/[0.05]" />
        <div className="absolute right-[8%] -bottom-[14%] w-[36vw] h-[36vw] rounded-full bg-[#60A5FA]/[0.06]" />
      </div>

      {/* Real preview optical dimmer & Night Light tint */}
      {(systemStatus.nightLight || brightnessOpacity > 0) && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 z-10 transition-colors duration-300"
          style={{
            backgroundColor: systemStatus.nightLight
              ? `rgba(255, 168, 76, ${0.12 + brightnessOpacity * 0.45})`
              : `rgba(0, 0, 0, ${brightnessOpacity})`,
          }}
        />
      )}

      {/* Optional compact Pinned Lyrics strip */}
      {lyricsPinned && activeLyric && (
        <div
          data-testid="xero-pinned-lyrics"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-[#0B0E12]/92 border border-white/10 shadow-xl backdrop-blur-xl max-w-[calc(100vw-32px)]"
        >
          <span
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: activeTrack.accent }}
          />
          <span className="text-xs text-[#EDF5FF] truncate">♪ {activeLyric.text}</span>
          <button
            type="button"
            onClick={() => xeroStore.toggleLyricsPinned()}
            aria-label="Unpin lyrics"
            className="text-[#8793A3] hover:text-[#EDF5FF] cursor-pointer"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Collapsed-by-default Preview Tools (zero clutter on default load) */}
      <div className="fixed bottom-4 left-4 z-20 flex flex-col items-start gap-2">
        {toolsOpen && (
          <div
            role="region"
            aria-label="Preview Tools"
            className="flex flex-wrap items-center gap-1.5 max-w-[calc(100vw-32px)] p-2 rounded-2xl bg-[#0B0E12]/95 border border-white/10 shadow-2xl backdrop-blur-xl"
          >
            <button
              type="button"
              onClick={() => xeroStore.petXero()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Heart className="w-3.5 h-3.5 text-[#FF2D75]" />
              <span>Pet{petCount > 0 ? ` (${petCount})` : ''}</span>
            </button>

            <button
              type="button"
              onClick={() => xeroStore.cheerXero()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#00E5FF]" />
              <span>Cheer</span>
            </button>

            <div className="flex items-center rounded-xl bg-[#12161B] border border-white/8 overflow-hidden">
              <button
                type="button"
                onClick={() => xeroStore.adjustVolume(-15)}
                aria-label="Volume Down"
                className="flex items-center gap-1 px-2 py-1.5 hover:bg-white/10 text-xs text-[#EDF5FF] transition-colors cursor-pointer"
              >
                <Volume1 className="w-3.5 h-3.5 text-[#8793A3]" />
              </button>
              <span className="px-2 font-mono-tabular text-[11px] text-[#8793A3] border-x border-white/8 select-none">
                {muted ? 'MUTE' : `${volume}%`}
              </span>
              <button
                type="button"
                onClick={() => xeroStore.adjustVolume(15)}
                aria-label="Volume Up"
                className="flex items-center gap-1 px-2 py-1.5 hover:bg-white/10 text-xs text-[#EDF5FF] transition-colors cursor-pointer"
              >
                <Volume2 className="w-3.5 h-3.5 text-[#00E5FF]" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => xeroStore.triggerScreenshot()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-[#00E5FF]" />
              <span>Screenshot</span>
            </button>

            <button
              type="button"
              onClick={() => xeroStore.triggerBreathingHud()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Wind className="w-3.5 h-3.5 text-[#FF5CA1]" />
              <span>Breathe</span>
            </button>

            <button
              type="button"
              onClick={() => xeroStore.triggerSystemHud()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] transition-colors whitespace-nowrap cursor-pointer"
            >
              <Activity className="w-3.5 h-3.5 text-[#39FF88]" />
              <span>Vitals</span>
            </button>

            <button
              type="button"
              onClick={() =>
                isHiddenPeek
                  ? xeroStore.setIslandExpanded(false)
                  : xeroStore.setIslandMode('minimized')
              }
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#EDF5FF] transition-colors whitespace-nowrap cursor-pointer"
            >
              {isHiddenPeek ? (
                <>
                  <ChevronDown className="w-3.5 h-3.5 text-[#00E5FF]" />
                  <span>Peek Out</span>
                </>
              ) : (
                <>
                  <ChevronUp className="w-3.5 h-3.5 text-[#8793A3]" />
                  <span>Hide Up</span>
                </>
              )}
            </button>

            <button
              type="button"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(
                  'application/x-xero-note',
                  JSON.stringify({
                    name: 'project-notes.md',
                    sizeBytes: 1420,
                    mimeType: 'text/markdown',
                    previewText: '# XERO Quick Note\nLocal LLM endpoint: http://127.0.0.1:11434',
                  })
                );
              }}
              onClick={handleSampleDropSeed}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-white/8 text-xs text-[#8793A3] hover:text-[#EDF5FF] transition-colors whitespace-nowrap cursor-grab active:cursor-grabbing"
            >
              <FileText className="w-3.5 h-3.5 text-[#00E5FF]" />
              <span>Drag Note</span>
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={() => setToolsOpen((v) => !v)}
          aria-expanded={toolsOpen}
          aria-label={toolsOpen ? 'Close Preview Tools' : 'Open Preview Tools'}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#0B0E12]/90 border border-white/8 text-[11px] text-[#8793A3] hover:text-[#EDF5FF] transition-opacity cursor-pointer ${
            toolsOpen ? 'opacity-100' : 'opacity-20 hover:opacity-95 focus:opacity-100'
          }`}
        >
          {toolsOpen ? (
            <>
              <X className="w-3 h-3" />
              <span>Close Tools</span>
            </>
          ) : (
            <>
              <SlidersHorizontal className="w-3 h-3" />
              <span>Preview Tools</span>
            </>
          )}
        </button>
      </div>

      {/* Restore minimized Studio window dock */}
      {studio.isOpen && studio.minimized && (
        <div className="fixed bottom-4 right-4 z-20">
          <button
            type="button"
            onClick={() => xeroStore.minimizeStudio(false)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#12161B] hover:bg-white/10 border border-[#00E5FF]/40 text-xs font-medium text-[#EDF5FF] cursor-pointer shadow-lg"
          >
            <Layers className="w-3.5 h-3.5 text-[#00E5FF]" />
            <span>Restore XERO Studio</span>
          </button>
        </div>
      )}
    </div>
  );
};
