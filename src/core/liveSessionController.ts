import type {
  LiveLatencyMetrics,
  LiveSessionPhase,
} from './types';
import type { OfflineAction } from './offlineEngine';

export interface LiveToolConfirmationEvent {
  kind: 'destructive' | 'preference';
  summary: string;
  action: OfflineAction;
}

export interface LiveStartConfig {
  model: 'gemini-3.8-live' | 'gemini-3.8-live-extended-thinking';
  voiceName: 'Kore' | 'Zephyr';
  systemInstruction: string;
  micDeviceId?: string;
  noiseSuppression?: boolean;
}

export interface LiveControllerCallbacks {
  onPhaseChange: (phase: LiveSessionPhase, statusText?: string | null) => void;
  onTranscriptBatch: (inputDraft: string, outputDraft: string) => void;
  onTurnCommitted: (userText: string, assistantText: string, appliedLabels: string[]) => void;
  onToolActions: (actions: OfflineAction[], labels: string[]) => void;
  onToolConfirmation: (confirmation: LiveToolConfirmationEvent) => void;
  onMetricsUpdate: (metrics: LiveLatencyMetrics) => void;
  onError: (code: string, message: string) => void;
}

/**
 * Tracks active Live turns so late audio chunks from an interrupted turn are discarded cleanly.
 */
export class LiveTurnTracker {
  private activeTurnId: string | null = null;
  private readonly interruptedTurns = new Set<string>();
  private turnSeq = 0;

  beginTurn(explicitId?: string): string {
    const id = explicitId || `turn-${++this.turnSeq}`;
    this.activeTurnId = id;
    return id;
  }

  getActiveTurnId(): string | null {
    return this.activeTurnId;
  }

  interruptCurrentTurn(explicitTurnId?: string): string | null {
    const target = explicitTurnId || this.activeTurnId;
    if (target) {
      this.interruptedTurns.add(target);
      if (this.interruptedTurns.size > 16) {
        const oldest = this.interruptedTurns.values().next().value;
        if (oldest) this.interruptedTurns.delete(oldest);
      }
    }
    if (!explicitTurnId || explicitTurnId === this.activeTurnId) {
      this.activeTurnId = null;
    }
    return target;
  }

  shouldAcceptAudioChunk(turnId?: string): boolean {
    if (!turnId) return true;
    return !this.interruptedTurns.has(turnId);
  }

  reset(): void {
    this.activeTurnId = null;
    this.interruptedTurns.clear();
  }
}

export function computeBackoffDelayMs(attempt: number, baseMs = 700, maxMs = 4000): number {
  const safeAttempt = Math.max(0, attempt);
  return Math.min(maxMs, Math.round(baseMs * Math.pow(2, safeAttempt)));
}

export function pcm16ToBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64ToPcm16(b64: string): Int16Array {
  const binary = atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Int16Array(bytes.buffer);
}

export function downsampleFloat32ToInt16(
  input: Float32Array,
  sourceRate: number,
  targetRate = 16000
): { pcm16: Int16Array; rms: number } {
  if (sourceRate === targetRate) {
    const out = new Int16Array(input.length);
    let sumSq = 0;
    for (let i = 0; i < input.length; i += 1) {
      const s = Math.max(-1, Math.min(1, input[i]));
      sumSq += s * s;
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return { pcm16: out, rms: Math.sqrt(sumSq / Math.max(1, input.length)) };
  }

  const ratio = sourceRate / targetRate;
  const outLen = Math.max(1, Math.floor(input.length / ratio));
  const out = new Int16Array(outLen);
  let sumSq = 0;
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * ratio;
    const idx0 = Math.floor(pos);
    const idx1 = Math.min(input.length - 1, idx0 + 1);
    const frac = pos - idx0;
    const s = Math.max(-1, Math.min(1, input[idx0] * (1 - frac) + input[idx1] * frac));
    sumSq += s * s;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return { pcm16: out, rms: Math.sqrt(sumSq / outLen) };
}

const MAX_RECONNECT_ATTEMPTS = 2;
const MAX_PLAYBACK_NODES = 24;
const TRANSCRIPT_BATCH_MS = 80;

/**
 * Single full-duplex Gemini Live voice session controller.
 * Manages capture AudioWorklet (with ScriptProcessor fallback), 24kHz gapless playback,
 * immediate barge-in flush, bounded reconnects, batched transcripts, and full teardown.
 */
export class LiveSessionController {
  private callbacks: LiveControllerCallbacks | null = null;
  private phase: LiveSessionPhase = 'idle';
  private sessionGen = 0;
  private ws: WebSocket | null = null;
  private mediaStream: MediaStream | null = null;
  private captureCtx: AudioContext | null = null;
  private playbackCtx: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private legacyProcessor: ScriptProcessorNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private activeSources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private muted = false;
  private activeConfig: LiveStartConfig | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private userStopped = true;
  private turnTracker = new LiveTurnTracker();

  private pendingInputDraft = '';
  private pendingOutputDraft = '';
  private committedInputText = '';
  private committedOutputText = '';
  private appliedLabelsThisTurn: string[] = [];
  private batchTimer: number | null = null;

  private sessionStartedAt = 0;
  private firstAudioFrameAt = 0;
  private highRmsStreak = 0;

  private metrics: LiveLatencyMetrics = {
    micActivationMs: null,
    firstResponseMs: null,
    interruptToSilenceMs: null,
    reconnectCount: 0,
  };

  setCallbacks(callbacks: LiveControllerCallbacks): void {
    this.callbacks = callbacks;
  }

  getPhase(): LiveSessionPhase {
    return this.phase;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.mediaStream) {
      for (const track of this.mediaStream.getAudioTracks()) {
        track.enabled = !muted;
      }
    }
    if (this.phase === 'listening' || this.phase === 'connected') {
      this.setPhase(muted ? 'connected' : 'listening', muted ? 'Microphone muted' : 'Live · Listening');
    }
  }

  async resumePlaybackIfBlocked(): Promise<boolean> {
    if (!this.playbackCtx) return true;
    if (this.playbackCtx.state === 'suspended') {
      try {
        await this.playbackCtx.resume();
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }

  async start(config: LiveStartConfig): Promise<void> {
    if (this.phase !== 'idle' && this.phase !== 'error') {
      this.stop('Toggled off');
      return;
    }

    const gen = ++this.sessionGen;
    this.userStopped = false;
    this.activeConfig = config;
    this.reconnectAttempts = 0;
    this.turnTracker.reset();
    this.committedInputText = '';
    this.committedOutputText = '';
    this.pendingInputDraft = '';
    this.pendingOutputDraft = '';
    this.appliedLabelsThisTurn = [];
    this.sessionStartedAt = performance.now();
    this.firstAudioFrameAt = 0;
    this.metrics = {
      micActivationMs: null,
      firstResponseMs: null,
      interruptToSilenceMs: null,
      reconnectCount: 0,
    };

    this.setPhase('connecting', 'Requesting session…');

    try {
      const tokenRes = await this.mintSessionToken(config);
      if (gen !== this.sessionGen || this.userStopped) return;

      await this.initAudioHardware(config, gen);
      if (gen !== this.sessionGen || this.userStopped) {
        this.teardownAudio();
        return;
      }

      this.metrics = {
        ...this.metrics,
        micActivationMs: Math.round(performance.now() - this.sessionStartedAt),
      };
      this.callbacks?.onMetricsUpdate(this.metrics);

      await this.openWebSocket(tokenRes.token, config, gen);
    } catch (err: unknown) {
      if (gen !== this.sessionGen) return;
      const errObj = err as { code?: string; message?: string };
      const code = errObj?.code || 'LIVE_START_FAILED';
      const message = errObj?.message || (err instanceof Error ? err.message : 'Unable to start Gemini Live session');
      this.cleanupAll();
      this.setPhase('error', message);
      this.callbacks?.onError(code, message);
    }
  }

  stop(reason?: string): void {
    this.sessionGen += 1;
    this.userStopped = true;
    this.flushTranscriptBatch();
    this.cleanupAll();
    this.setPhase('idle', reason ?? null);
  }

  interruptSpeaking(): void {
    const start = performance.now();
    const interruptedId = this.turnTracker.interruptCurrentTurn();
    this.flushPlayback();
    this.metrics = {
      ...this.metrics,
      interruptToSilenceMs: Math.max(1, Math.round((performance.now() - start) * 10) / 10),
    };
    this.callbacks?.onMetricsUpdate(this.metrics);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: 'interrupt', turnId: interruptedId }));
      } catch {
        // Ignore send errors on closing socket
      }
    }

    if (this.phase === 'speaking') {
      this.setPhase(this.muted ? 'connected' : 'listening', 'Interrupted · Listening');
    }
  }

  private setPhase(phase: LiveSessionPhase, statusText?: string | null): void {
    this.phase = phase;
    this.callbacks?.onPhaseChange(phase, statusText);
  }

  private async mintSessionToken(config: LiveStartConfig): Promise<{ token: string; expiresAt: number }> {
    const res = await fetch('/api/live/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        voiceName: config.voiceName,
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      token?: string;
      expiresAt?: number;
      error?: string;
      message?: string;
    };
    if (!res.ok || !body.token) {
      const err = new Error(body.message || `Live token request failed (${res.status})`) as Error & { code?: string };
      err.code = body.error || `HTTP_${res.status}`;
      throw err;
    }
    return { token: body.token, expiresAt: body.expiresAt ?? Date.now() + 60_000 };
  }

  private async initAudioHardware(config: LiveStartConfig, gen: number): Promise<void> {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      const err = new Error('Microphone API is unavailable in this browser.') as Error & { code?: string };
      err.code = 'MIC_UNAVAILABLE';
      throw err;
    }

    let stream: MediaStream;
    try {
      const audioConstraint: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: config.noiseSuppression ?? true,
        autoGainControl: true,
      };
      if (config.micDeviceId && config.micDeviceId !== 'default') {
        audioConstraint.deviceId = { ideal: config.micDeviceId };
      }
      stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint, video: false });
    } catch (e: unknown) {
      const domName = (e as { name?: string })?.name;
      const err = new Error(
        domName === 'NotAllowedError' || domName === 'PermissionDeniedError'
          ? 'Microphone permission denied. Allow mic access or type below.'
          : 'No active microphone device found. Type in Command chat below.'
      ) as Error & { code?: string };
      err.code = domName === 'NotAllowedError' ? 'MIC_PERMISSION_DENIED' : 'MIC_UNAVAILABLE';
      throw err;
    }

    if (gen !== this.sessionGen || this.userStopped) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    this.mediaStream = stream;
    for (const track of this.mediaStream.getAudioTracks()) {
      track.enabled = !this.muted;
    }

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

    this.captureCtx = new AudioCtx({ sampleRate: 16000 });
    this.playbackCtx = new AudioCtx({ sampleRate: 24000 });

    if (this.captureCtx.state === 'suspended') {
      await this.captureCtx.resume().catch(() => {});
    }
    if (this.playbackCtx.state === 'suspended') {
      await this.playbackCtx.resume().catch(() => {
        this.callbacks?.onPhaseChange(
          'connecting',
          'Browser blocked autoplay — tap to allow audio playback'
        );
      });
    }

    this.sourceNode = this.captureCtx.createMediaStreamSource(this.mediaStream);

    const handlePcmFrame = (pcm16: Int16Array, rms: number) => {
      if (gen !== this.sessionGen || this.userStopped) return;
      if (this.muted) return;

      // Client-side barge-in energy gate: if user speaks firmly over assistant output, flush immediately
      if (this.phase === 'speaking' && rms > 0.045) {
        this.highRmsStreak += 1;
        if (this.highRmsStreak >= 2) {
          this.highRmsStreak = 0;
          this.interruptSpeaking();
        }
      } else {
        this.highRmsStreak = 0;
      }

      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(
            JSON.stringify({
              type: 'audio',
              data: pcm16ToBase64(pcm16),
            })
          );
        } catch {
          // Ignore dropped socket frames while closing
        }
      }
    };

    try {
      await this.captureCtx.audioWorklet.addModule('/audio/pcm-capture-worklet.js');
      if (gen !== this.sessionGen || this.userStopped) return;
      this.workletNode = new AudioWorkletNode(this.captureCtx, 'xero-pcm-capture');
      this.workletNode.port.onmessage = (event) => {
        const data = event.data as { pcm16?: ArrayBuffer; rms?: number } | undefined;
        if (!data?.pcm16) return;
        handlePcmFrame(new Int16Array(data.pcm16), data.rms ?? 0);
      };
      this.sourceNode.connect(this.workletNode);
    } catch {
      // Fallback for environments where AudioWorklet script loading fails
      const proc = this.captureCtx.createScriptProcessor(4096, 1, 1);
      const srcRate = this.captureCtx.sampleRate || 48000;
      proc.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        const { pcm16, rms } = downsampleFloat32ToInt16(input, srcRate, 16000);
        handlePcmFrame(pcm16, rms);
      };
      this.sourceNode.connect(proc);
      proc.connect(this.captureCtx.destination);
      this.legacyProcessor = proc;
    }
  }

  private async openWebSocket(token: string, config: LiveStartConfig, gen: number): Promise<void> {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${proto}//${window.location.host}/api/live/ws?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    this.ws = ws;

    ws.onopen = () => {
      if (gen !== this.sessionGen || this.userStopped) {
        ws.close(1000, 'Session cancelled');
        return;
      }
      ws.send(
        JSON.stringify({
          type: 'setup',
          systemInstruction: config.systemInstruction,
        })
      );
    };

    ws.onmessage = (event) => {
      if (gen !== this.sessionGen || this.userStopped) return;
      this.handleServerMessage(String(event.data || ''), gen);
    };

    ws.onerror = () => {
      // Handled gracefully by onclose
    };

    ws.onclose = (ev) => {
      if (gen !== this.sessionGen || this.userStopped) return;
      this.ws = null;
      if (ev.code === 1000) {
        this.cleanupAll();
        this.setPhase('idle', null);
        return;
      }
      if (ev.code === 4001 || ev.code === 4003) {
        this.cleanupAll();
        this.setPhase('error', ev.reason || 'Live session unauthorized');
        this.callbacks?.onError('LIVE_AUTH_ERROR', ev.reason || 'Live session unauthorized');
        return;
      }
      this.attemptBoundedReconnect(gen, ev.reason || 'Connection interrupted');
    };
  }

  private handleServerMessage(raw: string, gen: number): void {
    let msg: {
      type?: string;
      turnId?: string;
      data?: string;
      text?: string;
      code?: string;
      message?: string;
      actions?: OfflineAction[];
      labels?: string[];
      confirmation?: LiveToolConfirmationEvent;
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    switch (msg.type) {
      case 'ready': {
        this.reconnectAttempts = 0;
        this.setPhase(this.muted ? 'connected' : 'listening', this.muted ? 'Connected (Muted)' : 'Live · Listening');
        break;
      }
      case 'audio': {
        const turnId = msg.turnId || this.turnTracker.getActiveTurnId() || this.turnTracker.beginTurn();
        if (!this.turnTracker.shouldAcceptAudioChunk(turnId)) {
          return;
        }
        if (this.firstAudioFrameAt === 0 && this.sessionStartedAt > 0) {
          this.firstAudioFrameAt = performance.now();
          this.metrics = {
            ...this.metrics,
            firstResponseMs: Math.round(this.firstAudioFrameAt - this.sessionStartedAt),
          };
          this.callbacks?.onMetricsUpdate(this.metrics);
        }
        if (this.phase !== 'speaking') {
          this.setPhase('speaking', 'Speaking · Interrupt anytime');
        }
        if (msg.data) {
          this.enqueuePcm24k(msg.data);
        }
        break;
      }
      case 'inputTranscript': {
        if (msg.text) {
          this.pendingInputDraft = `${this.pendingInputDraft} ${msg.text}`.trim();
          this.scheduleTranscriptBatch(gen);
        }
        break;
      }
      case 'outputTranscript': {
        if (msg.text) {
          if (!this.turnTracker.getActiveTurnId()) {
            this.turnTracker.beginTurn(msg.turnId);
          }
          this.pendingOutputDraft = `${this.pendingOutputDraft}${msg.text}`;
          this.scheduleTranscriptBatch(gen);
        }
        break;
      }
      case 'interrupted': {
        const interruptAt = performance.now();
        this.turnTracker.interruptCurrentTurn(msg.turnId);
        this.flushPlayback();
        this.metrics = {
          ...this.metrics,
          interruptToSilenceMs: Math.max(1, Math.round((performance.now() - interruptAt) * 10) / 10),
        };
        this.callbacks?.onMetricsUpdate(this.metrics);
        this.setPhase(this.muted ? 'connected' : 'listening', 'Interrupted · Listening');
        break;
      }
      case 'turnComplete': {
        this.flushTranscriptBatch();
        const userFinal = this.committedInputText.trim();
        const assistantFinal = this.committedOutputText.trim();
        const labels = [...this.appliedLabelsThisTurn];
        this.committedInputText = '';
        this.committedOutputText = '';
        this.appliedLabelsThisTurn = [];
        this.turnTracker.beginTurn();
        if (userFinal || assistantFinal) {
          this.callbacks?.onTurnCommitted(userFinal, assistantFinal, labels);
        }
        this.callbacks?.onTranscriptBatch('', '');
        if (!this.userStopped) {
          this.setPhase(this.muted ? 'connected' : 'listening', this.muted ? 'Connected (Muted)' : 'Live · Listening');
        }
        break;
      }
      case 'toolActions': {
        if (Array.isArray(msg.actions) && msg.actions.length > 0) {
          const labels = Array.isArray(msg.labels) ? msg.labels : [];
          this.appliedLabelsThisTurn.push(...labels);
          this.callbacks?.onToolActions(msg.actions, labels);
        }
        break;
      }
      case 'toolConfirmation': {
        if (msg.confirmation) {
          this.callbacks?.onToolConfirmation(msg.confirmation);
        }
        break;
      }
      case 'error': {
        const code = msg.code || 'LIVE_SESSION_ERROR';
        const message = msg.message || 'Gemini Live encountered a connection error.';
        this.cleanupAll();
        this.setPhase('error', message);
        this.callbacks?.onError(code, message);
        break;
      }
      default:
        break;
    }
  }

  private scheduleTranscriptBatch(gen: number): void {
    if (this.batchTimer !== null) return;
    this.batchTimer = window.setTimeout(() => {
      this.batchTimer = null;
      if (gen !== this.sessionGen) return;
      this.flushTranscriptBatch();
    }, TRANSCRIPT_BATCH_MS);
  }

  private flushTranscriptBatch(): void {
    if (this.batchTimer !== null) {
      window.clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    if (!this.pendingInputDraft && !this.pendingOutputDraft) return;
    if (this.pendingInputDraft) {
      this.committedInputText = this.pendingInputDraft;
    }
    if (this.pendingOutputDraft) {
      this.committedOutputText = this.pendingOutputDraft;
    }
    this.callbacks?.onTranscriptBatch(this.committedInputText, this.committedOutputText);
  }

  private enqueuePcm24k(base64Audio: string): void {
    if (!this.playbackCtx) return;
    if (this.playbackCtx.state === 'suspended') {
      void this.playbackCtx.resume().catch(() => {});
    }

    const pcm = base64ToPcm16(base64Audio);
    if (pcm.length === 0) return;

    const float32 = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i += 1) {
      float32[i] = pcm[i] / 32768;
    }

    const buffer = this.playbackCtx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    // Enforce bounded active source queue so stalled playback never leaks memory
    if (this.activeSources.size >= MAX_PLAYBACK_NODES) {
      const oldest = this.activeSources.values().next().value;
      if (oldest) {
        try {
          oldest.stop();
        } catch {
          // Ignore already stopped
        }
        this.activeSources.delete(oldest);
      }
    }

    const src = this.playbackCtx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.playbackCtx.destination);
    src.onended = () => {
      this.activeSources.delete(src);
    };

    const now = this.playbackCtx.currentTime;
    const startAt = Math.max(now + 0.012, this.nextStartTime);
    this.nextStartTime = startAt + buffer.duration;
    this.activeSources.add(src);
    try {
      src.start(startAt);
    } catch {
      this.activeSources.delete(src);
    }
  }

  private flushPlayback(): void {
    for (const src of this.activeSources) {
      try {
        src.stop();
      } catch {
        // Ignore already stopped sources
      }
    }
    this.activeSources.clear();
    if (this.playbackCtx) {
      this.nextStartTime = this.playbackCtx.currentTime;
    } else {
      this.nextStartTime = 0;
    }
  }

  private attemptBoundedReconnect(gen: number, reason: string): void {
    if (this.userStopped || !this.activeConfig || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      this.cleanupAll();
      const msg = `${reason} — switched back to typed chat.`;
      this.setPhase('error', msg);
      this.callbacks?.onError('LIVE_DISCONNECTED', msg);
      return;
    }

    const delayMs = computeBackoffDelayMs(this.reconnectAttempts);
    this.reconnectAttempts += 1;
    this.metrics = { ...this.metrics, reconnectCount: this.reconnectAttempts };
    this.callbacks?.onMetricsUpdate(this.metrics);
    this.setPhase('reconnecting', `Reconnecting (${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})…`);

    this.reconnectTimer = window.setTimeout(async () => {
      this.reconnectTimer = null;
      if (gen !== this.sessionGen || this.userStopped || !this.activeConfig) return;
      try {
        const fresh = await this.mintSessionToken(this.activeConfig);
        if (gen !== this.sessionGen || this.userStopped || !this.activeConfig) return;
        await this.openWebSocket(fresh.token, this.activeConfig, gen);
      } catch {
        this.attemptBoundedReconnect(gen, 'Reconnect failed');
      }
    }, delayMs);
  }

  private teardownAudio(): void {
    this.flushPlayback();
    try {
      this.workletNode?.port.postMessage({ type: 'stop' });
      this.workletNode?.disconnect();
    } catch {
      // Ignore cleanup error
    }
    this.workletNode = null;

    try {
      this.legacyProcessor?.disconnect();
    } catch {
      // Ignore cleanup error
    }
    this.legacyProcessor = null;

    try {
      this.sourceNode?.disconnect();
    } catch {
      // Ignore cleanup error
    }
    this.sourceNode = null;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {
          // Ignore track stop error
        }
      });
      this.mediaStream = null;
    }

    if (this.captureCtx) {
      void this.captureCtx.close().catch(() => {});
      this.captureCtx = null;
    }
    if (this.playbackCtx) {
      void this.playbackCtx.close().catch(() => {});
      this.playbackCtx = null;
    }
  }

  private cleanupAll(): void {
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.batchTimer !== null) {
      window.clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    if (this.ws) {
      const sock = this.ws;
      this.ws = null;
      sock.onopen = null;
      sock.onmessage = null;
      sock.onerror = null;
      sock.onclose = null;
      try {
        if (sock.readyState === WebSocket.OPEN) {
          sock.send(JSON.stringify({ type: 'close' }));
          sock.close(1000, 'User closed Live session');
        } else if (sock.readyState === WebSocket.CONNECTING) {
          sock.close(1000, 'Cancelled connecting');
        }
      } catch {
        // Ignore close error
      }
    }
    this.teardownAudio();
    this.turnTracker.reset();
  }
}

export const liveSessionController = new LiveSessionController();

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    liveSessionController.stop();
  });
}
