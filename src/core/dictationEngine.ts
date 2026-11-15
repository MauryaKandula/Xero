import type { DictationStyle, WriteTaskKind } from './types';

/**
 * Pure dictation transformation engine:
 * Handles spoken punctuation, spoken corrections ("scratch that"),
 * bullet/numbered lists, custom technical terminology replacements,
 * and verbatim vs clean formatting without altering intended text.
 */
export function processDictationTranscript(
  rawTranscript: string,
  options: {
    style: DictationStyle;
    customVocabulary?: string[];
  }
): string {
  let text = rawTranscript.trim();
  if (!text) return '';

  // Apply spoken correction commands ("scratch that" removes prior clause/sentence)
  text = text.replace(/[^.!?,\n]*\bscratch that\b[.,!?]?\s*/gi, '');
  text = text.replace(/\S+\s+\bundo last word\b[.,!?]?\s*/gi, '');

  if (options.style === 'verbatim') {
    return applyCustomVocabulary(text.trim(), options.customVocabulary);
  }

  // Spoken punctuation & formatting phrases
  const replacements: Array<[RegExp, string]> = [
    [/\bnew paragraph\b/gi, '\n\n'],
    [/\bnext paragraph\b/gi, '\n\n'],
    [/\bnew line\b/gi, '\n'],
    [/\bbullet point\b/gi, '\n• '],
    [/\bbullet list\b/gi, '\n• '],
    [/\bnumbered item\b/gi, '\n1. '],
    [/\bquestion mark\b/gi, '?'],
    [/\bexclamation mark\b/gi, '!'],
    [/\bexclamation point\b/gi, '!'],
    [/\bsemicolon\b/gi, ';'],
    [/\bcolon\b/gi, ':'],
    [/\bcomma\b/gi, ','],
    [/\bperiod\b/gi, '.'],
    [/\bfull stop\b/gi, '.'],
  ];

  for (const [pattern, replacement] of replacements) {
    text = text.replace(pattern, replacement);
  }

  // Clean spacing before punctuation
  text = text.replace(/\s+([.,!?;:])/g, '$1');
  text = text.replace(/([.,!?;:])(?=[A-Za-z0-9])/g, '$1 ');
  text = text.replace(/[ \t]{2,}/g, ' ').trim();

  if (options.style === 'ai-polished') {
    // Strip common filler words cleanly while preserving meaning
    text = text.replace(/\b(um+|uh+|like,\s|you know,\s)\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    // Ensure initial capitalization and sentence endings
    text = text.replace(/(^|[.!?]\s+|\n)([a-z])/g, (_, prefix: string, ch: string) => `${prefix}${ch.toUpperCase()}`);
    if (text && !/[.!?]$/.test(text) && !text.includes('\n• ')) {
      text += '.';
    }
  }

  return applyCustomVocabulary(text, options.customVocabulary);
}

export function applyCustomVocabulary(text: string, vocabulary: string[] = []): string {
  if (!text || vocabulary.length === 0) return text;
  let result = text;
  for (const term of vocabulary) {
    const clean = term.trim();
    if (!clean) continue;
    const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), clean);
  }
  return result;
}

export function buildWritePrompt(task: WriteTaskKind, input: string, tone: string, targetLang = 'Spanish'): string {
  const cleaned = input.trim();
  switch (task) {
    case 'email':
      return `Draft a clear, well-structured email (${tone} tone) about: ${cleaned}`;
    case 'message':
      return `Write a concise chat message (${tone} tone) saying: ${cleaned}`;
    case 'note':
      return `Format clean structured bullet notes from: ${cleaned}`;
    case 'summary':
      return `Summarize the key points concisely:\n\n${cleaned}`;
    case 'grammar':
      return `Fix grammar, spelling, and clarity without changing meaning:\n\n${cleaned}`;
    case 'rewrite':
      return `Rewrite cleanly with improved flow (${tone} tone):\n\n${cleaned}`;
    case 'translate':
      return `Translate cleanly into ${targetLang}:\n\n${cleaned}`;
    case 'explain-code':
      return `Explain what this code or technical snippet does concisely:\n\n${cleaned}`;
    case 'documentation':
      return `Write concise technical documentation for:\n\n${cleaned}`;
    case 'tone':
      return `Adjust the tone to be ${tone}:\n\n${cleaned}`;
    case 'shorten':
      return `Make this much shorter and sharper while preserving key facts:\n\n${cleaned}`;
    case 'expand':
      return `Expand this with helpful context and clear structure:\n\n${cleaned}`;
  }
}

export function runOfflineWriteTransform(task: WriteTaskKind, input: string): string {
  const cleaned = input.trim();
  if (!cleaned) return '';

  switch (task) {
    case 'email':
      return `Subject: ${cleaned.slice(0, 48)}\n\nHi,\n\n${cleaned.charAt(0).toUpperCase() + cleaned.slice(1)}${/[.!?]$/.test(cleaned) ? '' : '.'}\n\nBest regards,`;
    case 'message':
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    case 'note': {
      const parts = cleaned.split(/[.;\n]+/).map((s) => s.trim()).filter(Boolean);
      return parts.map((p) => `• ${p.charAt(0).toUpperCase() + p.slice(1)}`).join('\n');
    }
    case 'summary': {
      const sentences = cleaned.split(/(?<=[.!?])\s+/).filter(Boolean);
      return sentences.length <= 2 ? cleaned : `${sentences[0]} ${sentences[sentences.length - 1]}`;
    }
    case 'grammar': {
      const fixed = cleaned.replace(/\s+/g, ' ').replace(/\bi\b/g, 'I');
      return fixed.charAt(0).toUpperCase() + fixed.slice(1) + (/[.!?]$/.test(fixed) ? '' : '.');
    }
    case 'shorten': {
      const words = cleaned.split(/\s+/);
      return words.length > 18 ? `${words.slice(0, 18).join(' ')}…` : cleaned;
    }
    case 'expand':
      return `${cleaned}\n\nKey takeaway: ${cleaned.slice(0, 72)}${cleaned.length > 72 ? '…' : ''}`;
    default:
      return `${cleaned} (Connect Local LLM or Gemini in Studio for deeper ${task} generation.)`;
  }
}
