import type { EmotionState } from './types';

export interface SnapshotRenderInput {
  assistantName: string;
  emotion: EmotionState;
  emotionLabel: string;
  accentColor: string;
  faceColor: string;
  volume: number;
  muted: boolean;
  isOnline: boolean;
  timersCount: number;
  filesCount: number;
}

/**
 * Renders a crisp 2D workspace snapshot card as a PNG data URL + byte size estimate.
 * Works deterministically offline & online without fragile OS capture permission blocks.
 */
export function renderWorkspaceSnapshot(input: SnapshotRenderInput): {
  fileName: string;
  dataUrl: string;
  sizeBytes: number;
} {
  const now = new Date();
  const stamp = [
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');
  const fileName = `xero-snap-${stamp}.png`;

  if (typeof document === 'undefined') {
    return { fileName, dataUrl: '', sizeBytes: 1024 };
  }

  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { fileName, dataUrl: '', sizeBytes: 1024 };
  }

  // Flat 2D obsidian backdrop
  ctx.fillStyle = '#050507';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Subtle 2D grid lines
  ctx.strokeStyle = 'rgba(237, 245, 255, 0.04)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Top Dynamic Island 2D capsule
  const pillX = 160;
  const pillY = 34;
  const pillW = 320;
  const pillH = 66;
  ctx.fillStyle = '#07080C';
  ctx.beginPath();
  ctx.roundRect(pillX, pillY, pillW, pillH, 33);
  ctx.fill();
  ctx.strokeStyle = input.accentColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Flat 2D cute white pill eyes inside capsule
  ctx.fillStyle = input.faceColor;
  ctx.beginPath();
  ctx.roundRect(pillX + 34, pillY + 21, 9, 20, 4.5);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(pillX + 54, pillY + 21, 9, 20, 4.5);
  ctx.fill();

  // Soft 2D cheek blush
  ctx.fillStyle = 'rgba(255, 92, 161, 0.45)';
  ctx.beginPath();
  ctx.ellipse(pillX + 31, pillY + 46, 5, 2.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(pillX + 66, pillY + 46, 5, 2.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Island title
  ctx.fillStyle = '#EDF5FF';
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillText(`${input.assistantName} · ${input.emotionLabel}`, pillX + 88, pillY + 34);
  ctx.fillStyle = '#8490A3';
  ctx.font = '500 12px system-ui, sans-serif';
  ctx.fillText(`Capture ${now.toLocaleTimeString()}`, pillX + 88, pillY + 52);

  // Center snapshot badge
  ctx.fillStyle = '#0D1017';
  ctx.beginPath();
  ctx.roundRect(96, 146, 448, 152, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = input.accentColor;
  ctx.font = '600 13px ui-monospace, monospace';
  ctx.fillText('2D WORKSPACE SNAPSHOT', 124, 182);

  ctx.fillStyle = '#EDF5FF';
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillText(`${input.assistantName} Desktop Capture`, 124, 214);

  ctx.fillStyle = '#8490A3';
  ctx.font = '500 13px ui-monospace, monospace';
  const volText = input.muted ? 'Muted' : `${input.volume}%`;
  ctx.fillText(
    `Volume: ${volText}  |  Timers: ${input.timersCount}  |  Shelf: ${input.filesCount}  |  ${input.isOnline ? 'Online' : 'Offline'}`,
    124,
    248
  );
  ctx.fillText(`Captured at ${now.toLocaleString()}`, 124, 274);

  const dataUrl = canvas.toDataURL('image/png');
  const approxBytes = Math.max(1024, Math.round((dataUrl.length * 3) / 4));
  return { fileName, dataUrl, sizeBytes: approxBytes };
}
