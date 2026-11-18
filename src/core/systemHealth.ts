import type { LlmInferenceMetric } from './types';

export interface CpuSnapshotTotals {
  idle: number;
  total: number;
}

export interface SystemHealthSample {
  timestamp: number;
  cpuPct: number;
  memoryPct: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  processRssMb: number;
  load1m: number;
}

export interface SystemHealthApiPayload {
  ok: boolean;
  timestamp: number;
  cpu: {
    percent: number;
    cores: number;
    model: string;
    load1m: number;
  };
  memory: {
    percent: number;
    usedMb: number;
    totalMb: number;
    freeMb: number;
    processRssMb: number;
  };
  localLlm?: {
    reachable: boolean;
    runningModels: Array<{ name: string; sizeVramMb?: number }>;
  };
  uptimeSec: number;
}

export interface SystemHealthSummary {
  avgCpuPct: number;
  peakCpuPct: number;
  avgMemoryPct: number;
  peakMemoryPct: number;
  avgLatencyMs: number;
  avgTokensPerSec: number;
  loadStatus: 'Optimal' | 'Elevated' | 'Heavy';
}

export function computeCpuUsagePercent(
  prev: CpuSnapshotTotals,
  next: CpuSnapshotTotals
): number {
  const totalDelta = next.total - prev.total;
  const idleDelta = next.idle - prev.idle;
  if (!Number.isFinite(totalDelta) || totalDelta <= 0) {
    return 0;
  }
  const busy = Math.max(0, totalDelta - Math.max(0, idleDelta));
  return Math.round(Math.min(100, Math.max(0, (busy / totalDelta) * 100)) * 10) / 10;
}

export function appendHealthSample(
  history: SystemHealthSample[],
  sample: SystemHealthSample,
  maxSamples = 40
): SystemHealthSample[] {
  const next = [...history, sample];
  return next.length > maxSamples ? next.slice(next.length - maxSamples) : next;
}

export function summarizeHealthHistory(
  history: SystemHealthSample[],
  metrics: LlmInferenceMetric[]
): SystemHealthSummary {
  if (history.length === 0) {
    return {
      avgCpuPct: 0,
      peakCpuPct: 0,
      avgMemoryPct: 0,
      peakMemoryPct: 0,
      avgLatencyMs: 0,
      avgTokensPerSec: 0,
      loadStatus: 'Optimal',
    };
  }

  let sumCpu = 0;
  let peakCpu = 0;
  let sumMem = 0;
  let peakMem = 0;
  for (const s of history) {
    sumCpu += s.cpuPct;
    if (s.cpuPct > peakCpu) peakCpu = s.cpuPct;
    sumMem += s.memoryPct;
    if (s.memoryPct > peakMem) peakMem = s.memoryPct;
  }

  const latest = history[history.length - 1];
  const avgCpuPct = Math.round((sumCpu / history.length) * 10) / 10;
  const avgMemoryPct = Math.round((sumMem / history.length) * 10) / 10;
  const loadStatus: SystemHealthSummary['loadStatus'] =
    latest.cpuPct >= 80 || latest.memoryPct >= 88
      ? 'Heavy'
      : latest.cpuPct >= 50 || latest.memoryPct >= 72
        ? 'Elevated'
        : 'Optimal';

  const llmOnly = metrics.filter((m) => m.provider === 'local-llm');
  const activeMetrics = llmOnly.length > 0 ? llmOnly : metrics;
  const avgLatencyMs =
    activeMetrics.length > 0
      ? Math.round(activeMetrics.reduce((acc, m) => acc + m.latencyMs, 0) / activeMetrics.length)
      : 0;
  const avgTokensPerSec =
    activeMetrics.length > 0
      ? Math.round(
          (activeMetrics.reduce((acc, m) => acc + m.tokensPerSec, 0) / activeMetrics.length) * 10
        ) / 10
      : 0;

  return {
    avgCpuPct,
    peakCpuPct: Math.round(peakCpu * 10) / 10,
    avgMemoryPct,
    peakMemoryPct: Math.round(peakMem * 10) / 10,
    avgLatencyMs,
    avgTokensPerSec,
    loadStatus,
  };
}
