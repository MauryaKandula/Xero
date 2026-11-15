import React, { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Upload, X } from 'lucide-react';
import { xeroStore, useXeroStore } from '../../core/store';

export const TeleprompterWindow: React.FC = () => {
  const { teleprompter, settings } = useXeroStore();
  const accent = settings.appearance.accentColor;

  const [editing, setEditing] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; origW: number; origH: number } | null>(null);

  const lines = teleprompter.script.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const progressPct =
    lines.length > 1
      ? Math.round((Math.min(lines.length - 1, teleprompter.activeLine) / (lines.length - 1)) * 100)
      : 0;

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (dragRef.current) {
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const origX = dragRef.current.origX;
        const origY = dragRef.current.origY;
        xeroStore.updateTeleprompter((p) => ({
          ...p,
          x: Math.max(12, Math.min(window.innerWidth - 220, origX + dx)),
          y: Math.max(56, Math.min(window.innerHeight - 140, origY + dy)),
        }));
      } else if (resizeRef.current) {
        const dx = e.clientX - resizeRef.current.startX;
        const dy = e.clientY - resizeRef.current.startY;
        const origW = resizeRef.current.origW;
        const origH = resizeRef.current.origH;
        xeroStore.updateTeleprompter((p) => ({
          ...p,
          width: Math.max(300, Math.min(720, origW + dx)),
          height: Math.max(200, Math.min(540, origH + dy)),
        }));
      }
    };
    const onUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // Steady auto-scroll loop when playing
  useEffect(() => {
    if (!teleprompter.playing || editing) return;
    let rafId = 0;
    let last = performance.now();

    const step = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const el = scrollRef.current;
      if (el) {
        el.scrollTop += teleprompter.scrollSpeed * dt;
        const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
        const ratio = Math.min(1, el.scrollTop / maxScroll);
        const estimatedLine = Math.min(lines.length - 1, Math.floor(ratio * lines.length));
        if (estimatedLine !== teleprompter.activeLine) {
          xeroStore.updateTeleprompter((p) => ({ ...p, activeLine: estimatedLine }));
        }
        if (el.scrollTop >= maxScroll - 1) {
          xeroStore.updateTeleprompter((p) => ({ ...p, playing: false }));
          return;
        }
      }
      rafId = window.requestAnimationFrame(step);
    };
    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [teleprompter.playing, teleprompter.scrollSpeed, editing, lines.length, teleprompter.activeLine]);

  if (!teleprompter.isOpen) return null;

  const handleFileImport = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        xeroStore.updateTeleprompter((p) => ({
          ...p,
          script: reader.result as string,
          activeLine: 0,
          playing: false,
        }));
      }
    };
    reader.readAsText(file);
  };

  return (
    <section
      aria-label="XERO Independent Teleprompter"
      data-testid="xero-teleprompter"
      className="fixed z-35 rounded-2xl bg-[#0B0E12]/96 backdrop-blur-2xl border border-white/12 shadow-[0_20px_64px_rgba(0,0,0,0.82)] flex flex-col overflow-hidden"
      style={{
        left: `${Math.min(teleprompter.x, Math.max(12, (typeof window !== 'undefined' ? window.innerWidth : 1280) - teleprompter.width - 12))}px`,
        top: `${teleprompter.y}px`,
        width: `${teleprompter.width}px`,
        height: `${teleprompter.height}px`,
      }}
    >
      {/* Drag Header */}
      <header
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('button')) return;
          dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origX: teleprompter.x,
            origY: teleprompter.y,
          };
        }}
        className="flex items-center justify-between gap-2 px-3.5 py-2.5 bg-[#050608]/90 border-b border-white/8 select-none cursor-grab active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
          <span className="text-xs font-semibold text-[#EDF5FF]">Teleprompter</span>
          <span className="font-mono-tabular text-[10px] text-[#8793A3]">{progressPct}%</span>
        </div>

        <div className="flex items-center gap-1">
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.md,text/plain,text/markdown"
            className="hidden"
            onChange={(e) => handleFileImport(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Import script file"
            className="p-1 rounded-lg text-[#8793A3] hover:text-[#EDF5FF] hover:bg-white/8 cursor-pointer"
            title="Import .txt / .md script"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="px-2 py-0.5 rounded-lg bg-white/6 hover:bg-white/10 text-[11px] text-[#EDF5FF] cursor-pointer"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
          <button
            type="button"
            onClick={() => xeroStore.updateTeleprompter((p) => ({ ...p, isOpen: false, playing: false }))}
            aria-label="Close Teleprompter"
            className="p-1 rounded-lg text-[#8793A3] hover:text-[#FF4567] cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Progress Line */}
      <div className="h-0.5 w-full bg-white/8">
        <div className="h-full transition-all duration-150" style={{ width: `${progressPct}%`, backgroundColor: accent }} />
      </div>

      {/* Controls Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-white/8 bg-[#0B0E12]">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => xeroStore.updateTeleprompter((p) => ({ ...p, playing: !p.playing }))}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#050608] cursor-pointer"
            style={{ backgroundColor: accent }}
          >
            {teleprompter.playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{teleprompter.playing ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (scrollRef.current) scrollRef.current.scrollTop = 0;
              xeroStore.updateTeleprompter((p) => ({ ...p, playing: false, activeLine: 0 }));
            }}
            aria-label="Reset teleprompter to start"
            className="p-1.5 rounded-lg bg-[#12161B] text-[#8793A3] hover:text-[#EDF5FF] cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-[#8793A3]">
          <label className="flex items-center gap-1">
            <span>Size</span>
            <input
              type="range"
              aria-label="Teleprompter font size"
              min={14}
              max={30}
              value={teleprompter.fontSize}
              onChange={(e) =>
                xeroStore.updateTeleprompter((p) => ({ ...p, fontSize: Number(e.target.value) }))
              }
              className="w-14 accent-[#00E5FF]"
            />
          </label>
          <label className="flex items-center gap-1">
            <span>Speed</span>
            <input
              type="range"
              aria-label="Teleprompter scroll speed"
              min={10}
              max={64}
              value={teleprompter.scrollSpeed}
              onChange={(e) =>
                xeroStore.updateTeleprompter((p) => ({ ...p, scrollSpeed: Number(e.target.value) }))
              }
              className="w-14 accent-[#00E5FF]"
            />
          </label>
        </div>
      </div>

      {/* Script Body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3.5 space-y-2">
        {editing ? (
          <textarea
            value={teleprompter.script}
            onChange={(e) =>
              xeroStore.updateTeleprompter((p) => ({ ...p, script: e.target.value }))
            }
            aria-label="Teleprompter script editor"
            className="w-full h-full min-h-[120px] bg-[#050608] border border-white/12 rounded-xl p-2.5 text-xs text-[#EDF5FF] focus:outline-none focus:border-[#00E5FF]"
          />
        ) : (
          lines.map((line, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => xeroStore.updateTeleprompter((p) => ({ ...p, activeLine: idx }))}
              style={{ fontSize: `${teleprompter.fontSize}px`, lineHeight: 1.45 }}
              className={`block w-full text-left px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                idx === teleprompter.activeLine
                  ? 'text-[#EDF5FF] bg-white/[0.06] font-medium'
                  : idx < teleprompter.activeLine
                    ? 'text-[#8793A3]/60'
                    : 'text-[#8793A3] hover:text-[#EDF5FF]'
              }`}
            >
              {line}
            </button>
          ))
        )}
      </div>

      {/* Bottom-right resize grip */}
      <div
        role="presentation"
        onPointerDown={(e) => {
          e.preventDefault();
          resizeRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            origW: teleprompter.width,
            origH: teleprompter.height,
          };
        }}
        title="Drag to resize teleprompter"
        className="absolute bottom-1 right-1 w-3.5 h-3.5 cursor-nwse-resize opacity-45 hover:opacity-100"
        style={{
          borderRight: `2px solid ${accent}`,
          borderBottom: `2px solid ${accent}`,
          borderBottomRightRadius: 4,
        }}
      />
    </section>
  );
};
