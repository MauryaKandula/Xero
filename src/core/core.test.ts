import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALL_EMOTIONS,
  EMOTION_NUANCES,
  EMOTION_SPECS,
  clampGazeOffset,
  getTimeOfDayGreeting,
  inferEmotionFromText,
  nextBlinkIntervalMs,
  pickSpontaneousBehavior,
} from './emotions';
import {
  parseDurationSeconds,
  runOfflineEngine,
  safeEvaluateMath,
  stripWakeWordPrefix,
} from './offlineEngine';
import {
  applyCustomVocabulary,
  processDictationTranscript,
  runOfflineWriteTransform,
} from './dictationEngine';
import {
  APPEARANCE_PRESETS,
  computeRemainingSeconds,
  getActiveLyricIndex,
  looksSensitiveCredential,
  parseMultiListItems,
} from './productivity';
import { summarizeShelfDocument } from './shelfTools';
import type { XeroSettings } from './types';

const TEST_SETTINGS: XeroSettings = {
  general: {
    launchMinimized: false,
    gamingMode: false,
    alwaysOnTopSim: true,
    autoCollapseMs: 0,
    hotkeyLabel: 'R-Ctrl / R-Alt / F9',
    soundEffects: true,
    spontaneousBehavior: true,
    autoExpandOnTrackChange: false,
  },
  appearance: {
    presetName: 'Cyan',
    accentColor: '#00E5FF',
    faceColor: '#EDF5FF',
    notchShape: 'bezel',
    islandScale: 1,
    islandOpacity: 0.98,
    glowIntensity: 0.7,
    borderIllumination: 0.45,
    showMediaProgress: true,
    reducedMotion: false,
  },
  ai: {
    providerMode: 'auto',
    geminiModel: 'gemini-4-hydrogen',
    localFormat: 'ollama',
    localEndpoint: 'http://127.0.0.1:11434',
    localModel: 'llama3.2',
    systemPrompt: 'Be concise and friendly.',
    memoryEnabled: true,
  },
  voice: {
    responseMode: 'chimes',
    ttsEnabled: false,
    ttsRate: 1,
    ttsPitch: 1,
    wakeWordEnabled: false,
    wakeWord: 'Hey Xero',
    dictationLang: 'en-US',
    micDeviceId: 'default',
    noiseSuppression: true,
    silenceTimeoutMs: 4500,
    followUpWindowMs: 6500,
    dictationStyle: 'clean',
    customVocabulary: ['XERO', 'TypeScript', 'Ollama'],
  },
  privacy: {
    captureClipboardHistory: true,
  },
  personalization: {
    assistantName: 'XERO',
    userName: 'Alex',
    personalityTone: 'Friendly Cyberpunk',
  },
};

test('all 16 emotional expressions are protected with valid specs', () => {
  assert.equal(ALL_EMOTIONS.length, 16);
  for (const emotion of ALL_EMOTIONS) {
    const spec = EMOTION_SPECS[emotion];
    assert.ok(spec, `Missing spec for ${emotion}`);
    assert.equal(spec.id, emotion);
    assert.ok(spec.label.length > 0);
  }
  assert.ok(EMOTION_NUANCES.waking);
  assert.ok(EMOTION_NUANCES['gentle-breathing']);
});

test('gaze offset clamps smoothly within max eye radius', () => {
  const zero = clampGazeOffset(0, 0, 4.5);
  assert.deepEqual(zero, { x: 0, y: 0 });
  const clamped = clampGazeOffset(30, 40, 5);
  assert.equal(Math.round(Math.hypot(clamped.x, clamped.y) * 1000) / 1000, 5);
});

test('blink intervals stay within natural bounds across states', () => {
  const sleepyMin = nextBlinkIntervalMs('sleepy', 0);
  const excitedMax = nextBlinkIntervalMs('excited', 1);
  assert.ok(sleepyMin >= 1800);
  assert.ok(excitedMax <= 6000);
});

test('sentiment inference, greetings, and spontaneous pet behaviors work cleanly', () => {
  assert.equal(inferEmotionFromText('How does this work?', 'user'), 'curious');
  assert.equal(inferEmotionFromText('Thank you so much!', 'assistant'), 'affectionate');
  assert.equal(inferEmotionFromText('Haha that joke is great', 'user'), 'playful');
  assert.equal(inferEmotionFromText('System error occurred', 'assistant'), 'sad');
  assert.equal(getTimeOfDayGreeting(9, 'Alex').emotion, 'happy');
  assert.equal(getTimeOfDayGreeting(23, 'Alex').emotion, 'sleepy');
  assert.ok(pickSpontaneousBehavior(0.4).emotion);
});

test('offline math evaluator computes safely and rejects invalid code', () => {
  assert.equal(safeEvaluateMath('24 * 17'), 408);
  assert.equal(safeEvaluateMath('sqrt(144) + 8'), 20);
  assert.equal(safeEvaluateMath('process.exit(1)'), null);
  assert.equal(safeEvaluateMath('hello world'), null);
});

test('offline duration parser handles seconds, minutes, and hours', () => {
  assert.equal(parseDurationSeconds('set timer 45s'), 45);
  assert.equal(parseDurationSeconds('timer for 5 minutes'), 300);
  assert.equal(parseDurationSeconds('remind me in 2 hours'), 7200);
});

test('dictation engine handles spoken punctuation, corrections, custom vocabulary, and write transforms', () => {
  const cleaned = processDictationTranscript(
    'wrong start scratch that hello xero comma um today works great exclamation mark',
    { style: 'ai-polished', customVocabulary: ['XERO', 'TypeScript'] }
  );
  assert.equal(cleaned, 'Hello XERO, today works great!');

  const verbatim = processDictationTranscript('test typescript raw comma note', {
    style: 'verbatim',
    customVocabulary: ['TypeScript'],
  });
  assert.equal(verbatim, 'test TypeScript raw comma note');

  assert.equal(applyCustomVocabulary('running ollama with typescript', ['Ollama', 'TypeScript']), 'running Ollama with TypeScript');
  assert.ok(runOfflineWriteTransform('email', 'follow up on deploy').includes('Subject:'));
  assert.ok(runOfflineWriteTransform('note', 'first point. second point').includes('• First point'));
});

test('productivity helpers handle timestamp timers, multi-item lists, sensitive clipboard guard, and synced lyrics', () => {
  assert.equal(APPEARANCE_PRESETS.length, 9);
  const now = 1_000_000;
  const rem = computeRemainingSeconds(
    {
      id: 't1',
      label: 'Focus',
      durationSec: 60,
      remainingSec: 60,
      endAt: now + 42_500,
      running: true,
      createdAt: now,
    },
    now
  );
  assert.equal(rem, 43);

  assert.deepEqual(parseMultiListItems('add milk, eggs, and coffee to my shopping list'), ['milk', 'eggs', 'coffee']);
  assert.equal(looksSensitiveCredential('sk-1234567890abcdef123456'), true);
  assert.equal(looksSensitiveCredential('ollama run llama3.2'), false);

  const lyrics = [
    { timeSec: 0, text: 'line one' },
    { timeSec: 10, text: 'line two' },
    { timeSec: 20, text: 'line three' },
  ];
  assert.equal(getActiveLyricIndex(lyrics, 14), 1);
  assert.equal(getActiveLyricIndex(lyrics, 25), 2);
});

test('shelf document summarizer handles text items deterministically', () => {
  const summary = summarizeShelfDocument({
    id: 'f1',
    name: 'notes.md',
    sizeBytes: 2048,
    mimeType: 'text/markdown',
    previewText: '# Architecture\nKeep XERO and Studio independent.',
    addedAt: 1,
  });
  assert.ok(summary.includes('notes.md'));
  assert.ok(summary.includes('Keep XERO and Studio independent'));
});

test('offline engine handles wake words, modes, lists, shelf tools, and honest Windows limits', () => {
  const ctx = { timersCount: 0, clipboardCount: 0, filesCount: 0, isOnline: false };

  assert.equal(stripWakeWordPrefix('Hey Xero, set timer 2m'), 'set timer 2m');

  const timerReply = runOfflineEngine('Hey Xero, set timer 2m for tea', TEST_SETTINGS, [], ctx);
  assert.equal(timerReply.action.type, 'start-timer');
  assert.equal(timerReply.action.payload?.seconds, 120);

  const shopping = runOfflineEngine('add milk, eggs, and coffee to my shopping list', TEST_SETTINGS, [], ctx);
  assert.equal(shopping.action.type, 'add-shopping');
  assert.deepEqual(shopping.action.payload?.items, ['milk', 'eggs', 'coffee']);

  const resize = runOfflineEngine('resize this image', TEST_SETTINGS, [], ctx);
  assert.equal(resize.action.type, 'shelf-image-op');
  assert.equal(resize.action.payload?.op, 'resize-half');

  const writeMode = runOfflineEngine('switch to write mode', TEST_SETTINGS, [], ctx);
  assert.equal(writeMode.action.type, 'set-mode');
  assert.equal(writeMode.action.payload?.mode, 'write');

  const winLock = runOfflineEngine('lock computer', TEST_SETTINGS, [], ctx);
  assert.equal(winLock.action.type, 'handled-locally');
  assert.ok(winLock.text.includes('Windows native'));
});
