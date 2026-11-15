import type { ShelfFileItem } from './types';

export type ImageTransformKind = 'resize-half' | 'rotate-90' | 'compress' | 'convert-png';

/**
 * Summarizes a text/markdown shelf document deterministically offline.
 */
export function summarizeShelfDocument(item: ShelfFileItem): string {
  const content = (item.previewText || '').trim();
  if (!content) {
    return `${item.name} (${Math.max(1, Math.round(item.sizeBytes / 1024))} KB, ${item.mimeType}) — no plain-text preview cached.`;
  }
  const lines = content
    .split(/\r?\n/)
    .map((l) => l.replace(/^#+\s*/, '').trim())
    .filter(Boolean);
  const head = lines.slice(0, 3).join(' · ');
  return `${item.name}: ${head.slice(0, 180)}${head.length > 180 ? '…' : ''}`;
}

function suffixFileName(name: string, suffix: string, nextExt?: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = nextExt ?? (dot > 0 ? name.slice(dot + 1) : 'png');
  return `${base}-${suffix}.${ext}`;
}

function approxBytesFromDataUrl(dataUrl: string): number {
  const comma = dataUrl.indexOf(',');
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  return Math.max(256, Math.round((b64.length * 3) / 4));
}

/**
 * Performs genuine browser Canvas transformations on image shelf items and returns
 * a NEW ShelfFileItem copy so the original file is never overwritten.
 */
export async function transformShelfImageCopy(
  item: ShelfFileItem,
  kind: ImageTransformKind
): Promise<ShelfFileItem> {
  if (!item.previewDataUrl || !item.mimeType.startsWith('image/')) {
    throw new Error('Selected shelf item is not a transformable image.');
  }

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Failed to decode image data.'));
    el.src = item.previewDataUrl!;
  });

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable.');
  }

  let targetW = img.naturalWidth || 320;
  let targetH = img.naturalHeight || 200;
  let targetMime = item.mimeType === 'image/jpeg' ? 'image/jpeg' : 'image/png';
  let quality = 0.92;
  let suffix = 'copy';
  let nextExt: string | undefined;

  if (kind === 'resize-half') {
    targetW = Math.max(16, Math.round(targetW * 0.5));
    targetH = Math.max(16, Math.round(targetH * 0.5));
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    suffix = 'resized';
  } else if (kind === 'rotate-90') {
    canvas.width = targetH;
    canvas.height = targetW;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -targetW / 2, -targetH / 2, targetW, targetH);
    suffix = 'rotated';
  } else if (kind === 'compress') {
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    targetMime = 'image/jpeg';
    quality = 0.62;
    suffix = 'compressed';
    nextExt = 'jpg';
  } else if (kind === 'convert-png') {
    canvas.width = targetW;
    canvas.height = targetH;
    ctx.drawImage(img, 0, 0, targetW, targetH);
    targetMime = 'image/png';
    suffix = 'converted';
    nextExt = 'png';
  }

  const outUrl = canvas.toDataURL(targetMime, quality);
  return {
    id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: suffixFileName(item.name, suffix, nextExt),
    sizeBytes: approxBytesFromDataUrl(outUrl),
    mimeType: targetMime,
    previewDataUrl: outUrl,
    previewText: `Derived copy (${kind}) from ${item.name}`,
    addedAt: Date.now(),
  };
}
