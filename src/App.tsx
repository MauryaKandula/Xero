import { lazy, Suspense, useEffect, useRef } from 'react';
import { AnimatePresence } from 'motion/react';
import { xeroStore, useXeroStore } from './core/store';
import { fetchServerHealth } from './core/aiClient';
import { liveSessionController } from './core/liveSessionController';
import { DynamicIsland } from './components/xero/DynamicIsland';
import { DesktopBackdrop } from './components/xero/DesktopBackdrop';

const XeroStudioWindow = lazy(() =>
  import('./components/studio/XeroStudioWindow').then((m) => ({
    default: m.XeroStudioWindow,
  }))
);

const TeleprompterWindow = lazy(() =>
  import('./components/xero/TeleprompterWindow').then((m) => ({
    default: m.TeleprompterWindow,
  }))
);

export default function App() {
  const { studio, teleprompter } = useXeroStore();
  const soloModifierRef = useRef<{ code: string; dirty: boolean } | null>(null);

  const isStandaloneStudio =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('window') === 'studio';

  useEffect(() => {
    void fetchServerHealth().then((status) => {
      xeroStore.setServerCapabilities(status.geminiConfigured, status.liveSupported);
    });
  }, []);

  // Global keyboard shortcuts with Alt+Tab & typing isolation
  useEffect(() => {
    if (isStandaloneStudio) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ControlRight' || e.code === 'AltRight') {
        if (!e.repeat) {
          soloModifierRef.current = { code: e.code, dirty: false };
        }
      } else if (soloModifierRef.current) {
        // Any combo key (like Alt+Tab or Ctrl+C) invalidates solo tap trigger
        soloModifierRef.current.dirty = true;
      }

      if ((e.ctrlKey && e.code === 'Space') || (e.altKey && e.key.toLowerCase() === 'x')) {
        e.preventDefault();
        const current = xeroStore.getSnapshot();
        xeroStore.setIslandExpanded(!current.islandExpanded, 'chat');
      } else if (e.altKey && e.key.toLowerCase() === 'h') {
        e.preventDefault();
        const current = xeroStore.getSnapshot();
        if (current.islandMode === 'minimized') {
          xeroStore.setIslandExpanded(false);
        } else {
          liveSessionController.stop('Hidden');
          xeroStore.setIslandMode('minimized');
        }
      } else if (e.key === 'F9') {
        e.preventDefault();
        const current = xeroStore.getSnapshot();
        if (current.islandExpanded && current.interactionMode === 'command') {
          xeroStore.setIslandExpanded(false);
        } else {
          xeroStore.setInteractionMode('command');
        }
      } else if (e.key === 'Escape') {
        const current = xeroStore.getSnapshot();
        if (liveSessionController.getPhase() !== 'idle') {
          liveSessionController.stop('Escape pressed');
        }
        if (current.isListening) xeroStore.setListening(false);
        if (current.menuOpen) xeroStore.setMenuOpen(false);
        if (current.islandExpanded) xeroStore.setIslandExpanded(false);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        xeroStore.triggerScreenshot();
      } else if (e.altKey && e.key === 'ArrowUp') {
        e.preventDefault();
        xeroStore.adjustVolume(10);
      } else if (e.altKey && e.key === 'ArrowDown') {
        e.preventDefault();
        xeroStore.adjustVolume(-10);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const pending = soloModifierRef.current;
      soloModifierRef.current = null;
      if (!pending || pending.dirty || pending.code !== e.code) return;

      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

      if (e.code === 'ControlRight') {
        xeroStore.setInteractionMode('command');
      } else if (e.code === 'AltRight') {
        xeroStore.setInteractionMode('dictate');
      }
    };

    const handleBlur = () => {
      // Guard Alt+Tab window switches from accidentally triggering Right Alt dictate
      soloModifierRef.current = null;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isStandaloneStudio]);

  if (isStandaloneStudio) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-[#0B0D12]" />}>
        <XeroStudioWindow standalone />
      </Suspense>
    );
  }

  return (
    <div className="relative min-h-screen w-full">
      <DesktopBackdrop />
      {/* Primary independent floating companion */}
      <DynamicIsland />
      {/* Independent Teleprompter window — mounted only when opened */}
      <AnimatePresence>
        {teleprompter.isOpen && (
          <Suspense fallback={null} key="teleprompter-suspense">
            <TeleprompterWindow />
          </Suspense>
        )}
      </AnimatePresence>
      {/* Independent XERO Studio window — lazy-loaded & mounted ONLY when open */}
      <AnimatePresence>
        {studio.isOpen && !studio.minimized && (
          <Suspense fallback={null} key="studio-suspense">
            <XeroStudioWindow />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}
