import type { MusicTrack, VoiceResponseMode } from './types';

export const BUILTIN_TRACKS: MusicTrack[] = [
  {
    id: 'track-obsidian-pulse',
    title: 'Obsidian Pulse',
    artist: 'XERO Ambient Synth',
    durationSec: 168,
    bpm: 92,
    accent: '#00E5FF',
    notes: [220, 261.63, 329.63, 392, 329.63, 293.66],
    lyrics: [
      { timeSec: 0, text: 'Soft obsidian quiet above the screen' },
      { timeSec: 8, text: 'Signal drifting steady, clear and serene' },
      { timeSec: 16, text: 'Cyan pulse echoing through the midnight frame' },
      { timeSec: 26, text: 'Every quiet thought answering by name' },
      { timeSec: 36, text: 'Hold the rhythm gently while you create' },
      { timeSec: 48, text: 'Breathing in the stillness, calm and awake' },
    ],
  },
  {
    id: 'track-neon-rain',
    title: 'Neon Rain',
    artist: 'Night City Lo-Fi',
    durationSec: 194,
    bpm: 84,
    accent: '#9C6BFF',
    notes: [196, 246.94, 293.66, 369.99, 329.63, 246.94],
    lyrics: [
      { timeSec: 0, text: 'Raindrops tracing lines down the window pane' },
      { timeSec: 9, text: 'Violet reflections in the quiet lane' },
      { timeSec: 19, text: 'Low-lit amber glow on an open desk' },
      { timeSec: 30, text: 'Let the static fade into gentle rest' },
      { timeSec: 42, text: 'Soft chords carrying through the late-night air' },
    ],
  },
  {
    id: 'track-neural-drift',
    title: 'Neural Drift',
    artist: 'Subzero Telemetry',
    durationSec: 152,
    bpm: 100,
    accent: '#FF2D75',
    notes: [261.63, 311.13, 392, 466.16, 392, 311.13],
    lyrics: [
      { timeSec: 0, text: 'Synchronized horizon coming into view' },
      { timeSec: 8, text: 'Warm static clearing into crisp focus blue' },
      { timeSec: 17, text: 'Step by step forward, steady at the wheel' },
      { timeSec: 28, text: 'Quiet momentum only motion can reveal' },
    ],
  },
];

export const SITUATION_VOICE_LINES = {
  morning: ['Good morning! Ready to keep things smooth today.', 'Morning! Let me know what we are tackling first.'],
  afternoon: ['Good afternoon! Here whenever you need a hand.', 'Afternoon check-in — steady and attentive.'],
  evening: ['Good evening! Winding down or finishing strong?', 'Evening mode active. Keep it calm and focused.'],
  night: ['Late night session? Remember to rest your eyes too.', 'Quiet night mode ready whenever you are.'],
  taskDone: ['Done!', 'All set.', 'Handled cleanly.'],
  wake: ['I am awake!', 'Oh—hey! Ready when you are.'],
  error: ['That ran into an issue.', 'Hmm, that did not work as expected.'],
} as const;

class XeroAudioService {
  private ctx: AudioContext | null = null;
  private stepTimer: number | null = null;
  private stepIndex = 0;
  private masterVolume = 0.72;
  private muted = false;
  private ducked = false;

  setMasterVolume(percent: number, muted = false): void {
    this.masterVolume = Math.min(1, Math.max(0, percent / 100));
    this.muted = muted;
  }

  /** Temporarily attenuates music/chimes during voice listening without altering stored user volume */
  setDucked(ducked: boolean): void {
    this.ducked = ducked;
  }

  isDucked(): boolean {
    return this.ducked;
  }

  getEffectiveGainScale(): number {
    if (this.muted) return 0;
    return this.ducked ? this.masterVolume * 0.25 : this.masterVolume;
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return null;
      this.ctx = new Ctx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  playTone(freq: number, durationMs = 120, gainLevel = 0.04, type: OscillatorType = 'sine'): void {
    const scale = this.getEffectiveGainScale();
    if (scale <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const scaledGain = Math.max(0.0005, gainLevel * scale);
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(scaledGain, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + durationMs / 1000 + 0.02);
    } catch {
      // Ignore audio policy block before user gesture
    }
  }

  playSuccessChime(enabled: boolean): void {
    if (!enabled) return;
    this.playTone(523.25, 110, 0.035, 'triangle');
    setTimeout(() => this.playTone(659.25, 160, 0.035, 'triangle'), 90);
  }

  playAlertChime(enabled: boolean): void {
    if (!enabled) return;
    this.playTone(587.33, 140, 0.04, 'sine');
    setTimeout(() => this.playTone(880, 220, 0.04, 'sine'), 130);
  }

  playPurrChirp(enabled: boolean): void {
    if (!enabled) return;
    this.playTone(587.33, 75, 0.03, 'sine');
    setTimeout(() => this.playTone(783.99, 95, 0.035, 'sine'), 70);
    setTimeout(() => this.playTone(1046.5, 110, 0.025, 'triangle'), 140);
  }

  playSnackChime(enabled: boolean): void {
    if (!enabled) return;
    this.playTone(440, 80, 0.03, 'triangle');
    setTimeout(() => this.playTone(554.37, 80, 0.03, 'triangle'), 75);
    setTimeout(() => this.playTone(659.25, 140, 0.035, 'triangle'), 150);
  }

  playPopChime(enabled: boolean): void {
    if (!enabled) return;
    this.playTone(493.88, 55, 0.02, 'sine');
  }

  playVolumeTick(enabled: boolean, volumePercent: number): void {
    if (!enabled) return;
    const freq = 340 + (Math.min(100, Math.max(0, volumePercent)) / 100) * 420;
    this.playTone(freq, 48, 0.025, 'sine');
  }

  playShutterChime(enabled: boolean): void {
    if (!enabled) return;
    this.playTone(980, 38, 0.032, 'triangle');
    setTimeout(() => this.playTone(1320, 52, 0.028, 'sine'), 55);
  }

  startAmbientTrack(track: MusicTrack): void {
    this.stopAmbientTrack();
    const intervalMs = Math.round((60 / track.bpm) * 1000);
    const playStep = () => {
      const freq = track.notes[this.stepIndex % track.notes.length];
      this.stepIndex += 1;
      this.playTone(freq, Math.min(intervalMs * 0.85, 550), 0.022, 'sine');
    };
    playStep();
    this.stepTimer = window.setInterval(playStep, intervalMs);
  }

  stopAmbientTrack(): void {
    if (this.stepTimer !== null) {
      window.clearInterval(this.stepTimer);
      this.stepTimer = null;
    }
  }

  speakText(
    text: string,
    opts: {
      enabled: boolean;
      responseMode?: VoiceResponseMode;
      rate: number;
      pitch: number;
      lang: string;
    }
  ): void {
    const mode = opts.responseMode ?? (opts.enabled ? 'system-voice' : 'silent');
    if (mode === 'silent' || mode === 'chimes') {
      if (mode === 'chimes') {
        this.playPopChime(true);
      }
      return;
    }
    if (!opts.enabled && opts.responseMode === undefined) {
      return;
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = opts.rate;
      utter.pitch = opts.pitch;
      utter.lang = opts.lang;
      window.speechSynthesis.speak(utter);
    } catch {
      // Ignore synthesis unavailability
    }
  }

  stopSpeaking(): void {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore
      }
    }
  }
}

export const audioService = new XeroAudioService();
