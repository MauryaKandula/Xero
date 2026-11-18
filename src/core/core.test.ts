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
  smoothGazeStep,
} from './emotions';
import {
  extractWakeWordCommand,
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
import {
  buildJarvisBriefing,
  evaluatePercentageExpression,
  evaluateUnitConversion,
  generateSecureSecret,
  lookupWorldTimeQuery,
  matchThemePresetFromCommand,
  parseSettingCommand,
  splitCompoundCommands,
} from './jarvisEngine';
import {
  appendHealthSample,
  computeCpuUsagePercent,
  summarizeHealthHistory,
} from './systemHealth';
import {
  ASSISTANT_PROMPT_VERSION,
  buildCaptureNoteFromMessages,
  buildRuntimeSystemPrompt,
  formatNotesAsMarkdown,
  summarizeSessionCatchUp,
} from './assistantPrompt';
import { ToolWriteDeduplicator, validateAndMapToolCall } from './toolValidation';
import {
  LiveTurnTracker,
  base64ToPcm16,
  computeBackoffDelayMs,
  downsampleFloat32ToInt16,
  pcm16ToBase64,
} from './liveSessionController';
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
    liveModel: 'gemini-3.8-live',
    liveVoiceName: 'Kore',
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
    persistChatHistory: false,
    retainAudioRecordings: false,
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
  assert.equal(stripWakeWordPrefix('Hey Zero, play music'), 'play music');
  assert.deepEqual(extractWakeWordCommand('Ok Xero, hide notch'), {
    matched: true,
    command: 'hide notch',
  });
  assert.deepEqual(extractWakeWordCommand('Hey Xero'), {
    matched: true,
    command: '',
  });
  assert.deepEqual(extractWakeWordCommand('set timer 5m').matched, false);

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

  const noteCmd = runOfflineEngine('take note Drink water & review sprint', TEST_SETTINGS, [], ctx);
  assert.equal(noteCmd.action.type, 'add-note');
  assert.equal(noteCmd.action.payload?.text, 'Drink water & review sprint');

  const waterCmd = runOfflineEngine('log water', TEST_SETTINGS, [], ctx);
  assert.equal(waterCmd.action.type, 'log-water');

  const shelfCmd = runOfflineEngine('open shelf', TEST_SETTINGS, [], ctx);
  assert.equal(shelfCmd.action.type, 'open-tab');
  assert.equal(shelfCmd.action.payload?.tab, 'files');

  const winLock = runOfflineEngine('lock computer', TEST_SETTINGS, [], ctx);
  assert.equal(winLock.action.type, 'handled-locally');
  assert.ok(winLock.text.includes('Windows native'));
});

test('jarvis engine evaluates percentages, unit conversions, world time, secrets, and compound splitting safely', () => {
  assert.equal(evaluatePercentageExpression('18% of 2450'), '18% of 2450 = 441');
  assert.equal(evaluatePercentageExpression('240 + 15%'), '240 + 15% = 276');

  assert.equal(evaluateUnitConversion('100 km to miles'), '100 km = 62.14 miles');
  assert.equal(evaluateUnitConversion('72 f to c'), '72°F = 22.22°C');
  assert.equal(evaluateUnitConversion('2048 mb to gb'), '2048 MB = 2 GB');

  const tokyo = lookupWorldTimeQuery('what is the time in tokyo?');
  assert.ok(tokyo && tokyo.includes('Tokyo'));

  const uuid = generateSecureSecret('uuid');
  assert.match(uuid, /^[0-9a-f-]{36}$/i);
  const pw = generateSecureSecret('password');
  assert.equal(pw.length, 16);

  assert.equal(matchThemePresetFromCommand('switch theme to sakura'), 'Sakura');
  assert.equal(matchThemePresetFromCommand('hello world'), null);

  assert.deepEqual(
    splitCompoundCommands('start pomodoro and play music and hide'),
    ['start pomodoro', 'play music', 'hide']
  );
  assert.deepEqual(
    splitCompoundCommands('add milk, eggs, and coffee to my shopping list'),
    ['add milk, eggs, and coffee to my shopping list']
  );
  assert.deepEqual(
    splitCompoundCommands('take note buy coffee and review roadmap'),
    ['take note buy coffee and review roadmap']
  );

  const brief = buildJarvisBriefing(TEST_SETTINGS, [{ id: 'm1', fact: 'Prefers TypeScript', createdAt: 1 }], {
    timersCount: 2,
    runningTimersCount: 1,
    pendingTodosCount: 3,
    notesCount: 1,
    waterMl: 500,
    clipboardCount: 4,
    filesCount: 2,
    isOnline: true,
    musicPlaying: true,
    activeTrackTitle: 'Cyberpunk Drift',
    volume: 70,
    brightness: 95,
  });
  assert.ok(brief.includes('Tactical Briefing'));
  assert.ok(brief.includes('Cyberpunk Drift'));
  assert.ok(brief.includes('500 ml'));
});

test('offline engine orchestrates Jarvis protocols, theme presets, and compound commands', () => {
  const ctx = {
    timersCount: 1,
    runningTimersCount: 1,
    pendingTodosCount: 2,
    notesCount: 1,
    waterMl: 250,
    clipboardCount: 3,
    filesCount: 1,
    isOnline: true,
    musicPlaying: false,
    volume: 72,
    brightness: 100,
  };

  const focus = runOfflineEngine('focus protocol', TEST_SETTINGS, [], ctx);
  assert.equal(focus.actions?.length, 3);
  assert.deepEqual(
    focus.actions?.map((a) => a.type),
    ['start-pomodoro', 'music-play', 'open-tab']
  );

  const stealth = runOfflineEngine('stealth mode', TEST_SETTINGS, [], ctx);
  assert.equal(stealth.actions?.length, 3);
  assert.deepEqual(
    stealth.actions?.map((a) => a.type),
    ['music-pause', 'set-brightness', 'minimize-island']
  );

  const brief = runOfflineEngine('daily briefing', TEST_SETTINGS, [], ctx);
  assert.equal(brief.action.type, 'show-system-hud');
  assert.ok(brief.text.includes('Tactical Briefing'));

  const compound = runOfflineEngine('start pomodoro and play music and switch theme to sakura', TEST_SETTINGS, [], ctx);
  assert.equal(compound.actions?.length, 3);
  assert.deepEqual(
    compound.actions?.map((a) => a.type),
    ['start-pomodoro', 'music-play', 'set-appearance-preset']
  );
  assert.equal(compound.actions?.[2].payload?.preset, 'Sakura');

  const uuidReply = runOfflineEngine('generate a uuid', TEST_SETTINGS, [], ctx);
  assert.equal(uuidReply.action.type, 'copy-generated');
  assert.equal(uuidReply.action.payload?.kind, 'UUID');
});

test('jarvis parses basic settings changes and sound increase/decrease with emotion feedback', () => {
  const gaming = parseSettingCommand('enable gaming mode');
  assert.deepEqual(gaming, { key: 'gamingMode', value: true, summary: 'Gaming Mode enabled' });

  const hideDelay = parseSettingCommand('set auto-hide to 12s');
  assert.deepEqual(hideDelay, { key: 'autoHideDelayMs', value: 12000, summary: 'Auto-Hide set to 12s' });

  const shape = parseSettingCommand('notch shape pill');
  assert.deepEqual(shape, { key: 'notchShape', value: 'pill', summary: 'Notch shape set to pill' });

  const ctx = { timersCount: 0, clipboardCount: 0, filesCount: 0, isOnline: true, volume: 60, brightness: 100 };
  const louder = runOfflineEngine('increase sound', TEST_SETTINGS, [], ctx);
  assert.equal(louder.action.type, 'adjust-volume');
  assert.equal(louder.action.payload?.delta, 15);
  assert.equal(louder.emotion, 'excited');

  const softer = runOfflineEngine('decrease sound', TEST_SETTINGS, [], ctx);
  assert.equal(softer.action.type, 'adjust-volume');
  assert.equal(softer.action.payload?.delta, -15);
  assert.equal(softer.emotion, 'curious');

  const compoundSettings = runOfflineEngine(
    'increase sound and dim screen to 75% and turn on gaming mode',
    TEST_SETTINGS,
    [],
    ctx
  );
  assert.equal(compoundSettings.actions?.length, 3);
  assert.deepEqual(
    compoundSettings.actions?.map((a) => a.type),
    ['adjust-volume', 'set-brightness', 'update-setting']
  );
});

test('systemHealth computes CPU tick delta, bounds ring-buffer history, and summarizes LLM latency', () => {
  const cpuPct = computeCpuUsagePercent(
    { idle: 1000, total: 2000 },
    { idle: 1150, total: 2500 }
  );
  // Busy delta = 500 - 150 = 350 out of 500 -> 70.0%
  assert.equal(cpuPct, 70);
  assert.equal(computeCpuUsagePercent({ idle: 100, total: 200 }, { idle: 100, total: 200 }), 0);

  let history: ReturnType<typeof appendHealthSample> = [];
  for (let i = 0; i < 45; i += 1) {
    history = appendHealthSample(
      history,
      {
        timestamp: 1000 + i * 1500,
        cpuPct: i === 44 ? 85 : 25,
        memoryPct: 60,
        memoryUsedMb: 4096,
        memoryTotalMb: 8192,
        processRssMb: 120,
        load1m: 1.2,
      },
      40
    );
  }
  assert.equal(history.length, 40);
  const summary = summarizeHealthHistory(history, [
    {
      id: 'm1',
      timestamp: 1000,
      provider: 'local-llm',
      model: 'llama3.2',
      latencyMs: 400,
      outputChars: 240,
      tokensPerSec: 32.5,
    },
    {
      id: 'm2',
      timestamp: 2000,
      provider: 'local-llm',
      model: 'llama3.2',
      latencyMs: 600,
      outputChars: 320,
      tokensPerSec: 27.5,
    },
  ]);
  assert.equal(summary.peakCpuPct, 85);
  assert.equal(summary.avgLatencyMs, 500);
  assert.equal(summary.avgTokensPerSec, 30);
  assert.equal(summary.loadStatus, 'Heavy');
});

test('smoothGazeStep lags fluidly toward target cursor and settles cleanly to zero-CPU rest', () => {
  const step1 = smoothGazeStep({ x: 0, y: 0 }, { x: 4, y: 0 }, 0.15);
  assert.equal(step1.settled, false);
  assert.ok(step1.x > 0 && step1.x < 1, 'Expected damped partial step instead of instant jump');

  let cur = { x: 0, y: 0 };
  let settled = false;
  for (let i = 0; i < 60; i += 1) {
    const next = smoothGazeStep(cur, { x: 4, y: -2 }, 0.16);
    cur = { x: next.x, y: next.y };
    if (next.settled) {
      settled = true;
      break;
    }
  }
  assert.equal(settled, true);
  assert.equal(cur.x, 4);
  assert.equal(cur.y, -2);
});

test('custom wake-word detection supports custom phrases, punctuation, and ignores normal speech', () => {
  assert.deepEqual(extractWakeWordCommand('Computer, turn on gaming mode', 'Computer'), {
    matched: true,
    command: 'turn on gaming mode',
  });
  assert.deepEqual(extractWakeWordCommand('Hey, Nova! play music', 'Hey Nova'), {
    matched: true,
    command: 'play music',
  });
  assert.equal(extractWakeWordCommand('just talking normally here', 'Hey Nova').matched, false);
});

test('versioned runtime prompt, catch-up summary, and capture markdown work deterministically', () => {
  assert.equal(ASSISTANT_PROMPT_VERSION, '2.0.0');
  const prompt = buildRuntimeSystemPrompt({
    settings: TEST_SETTINGS,
    memories: [{ id: 'm1', fact: 'Prefer short answers', createdAt: 1 }],
    responseDepth: 'concise',
    forLiveAudio: true,
  });
  assert.ok(prompt.includes('v2.0.0'));
  assert.ok(prompt.includes('CONCISE'));
  assert.ok(prompt.includes('Prefer short answers'));
  assert.ok(prompt.includes('female-voiced JARVIS'));

  const catchUp = summarizeSessionCatchUp({
    messages: [
      { id: 'u1', role: 'user', text: 'Should we ship Friday?', timestamp: 1 },
      { id: 'a1', role: 'assistant', text: 'Started 25m timer.', timestamp: 2, actionsApplied: ['Timer 25m'] },
    ],
    timers: [{ id: 't1', label: 'Focus', durationSec: 1500, remainingSec: 1200, endAt: Date.now() + 1200_000, running: true, createdAt: 1 }],
    todos: [{ id: 'td1', text: 'Review release checklist', listType: 'todo', done: false, createdAt: 1 }],
    notes: [{ id: 'n1', text: 'Verify mic permissions', updatedAt: 1 }],
  });
  assert.ok(catchUp.formattedText.includes('Decisions:'));
  assert.ok(catchUp.formattedText.includes('Should we ship Friday?'));
  assert.ok(catchUp.formattedText.includes('Focus'));

  const captured = buildCaptureNoteFromMessages(
    [{ id: 'u1', role: 'user', text: 'Finalize audio worklet queue', timestamp: 1 }],
    undefined,
    true
  );
  assert.ok(captured.noteText.includes('- [ ] Topic: Finalize audio worklet queue'));
  assert.ok(captured.markdown.includes('# XERO Captured Note'));

  const md = formatNotesAsMarkdown(
    [{ id: 'n1', text: 'Microphone checked', updatedAt: Date.now() }],
    [{ id: 'td1', text: 'Tag v1 release', listType: 'todo', done: true, createdAt: Date.now() }]
  );
  assert.ok(md.includes('## Notes'));
  assert.ok(md.includes('- [x] Tag v1 release'));
});

test('everyday voice workflow commands, confirmations, and clarifying questions resolve cleanly', () => {
  const ctx = { timersCount: 1, runningTimersCount: 1, clipboardCount: 0, filesCount: 0, isOnline: true };

  const focus25 = runOfflineEngine('Focus for 25 minutes.', TEST_SETTINGS, [], ctx);
  assert.equal(focus25.action.type, 'start-timer');
  assert.equal(focus25.action.payload?.seconds, 1500);

  assert.equal(runOfflineEngine('time left', TEST_SETTINGS, [], ctx).action.type, 'timer-status');
  assert.equal(runOfflineEngine('pause timer', TEST_SETTINGS, [], ctx).action.type, 'pause-timer');
  assert.equal(runOfflineEngine('resume timer', TEST_SETTINGS, [], ctx).action.type, 'resume-timer');
  assert.equal(runOfflineEngine('cancel timer', TEST_SETTINGS, [], ctx).action.type, 'request-confirmation');

  const shortCmd = runOfflineEngine('Keep it short', TEST_SETTINGS, [], ctx);
  assert.equal(shortCmd.action.type, 'set-response-depth');
  assert.equal(shortCmd.action.payload?.depth, 'concise');

  const deepCmd = runOfflineEngine('Go deeper', TEST_SETTINGS, [], ctx);
  assert.equal(deepCmd.action.type, 'set-response-depth');
  assert.equal(deepCmd.action.payload?.depth, 'detailed');

  const prefCmd = runOfflineEngine('Remember I prefer short answers.', TEST_SETTINGS, [], ctx);
  assert.equal(prefCmd.action.type, 'request-confirmation');
  assert.equal(prefCmd.action.payload?.targetActionType, 'remember-fact');
  assert.equal(prefCmd.action.payload?.alsoDepth, 'concise');

  assert.equal(runOfflineEngine('Catch me up.', TEST_SETTINGS, [], ctx).action.type, 'catch-me-up');
  assert.equal(runOfflineEngine('Capture that.', TEST_SETTINGS, [], ctx).action.type, 'capture-that');

  const bareNote = runOfflineEngine('take a note', TEST_SETTINGS, [], ctx);
  assert.equal(bareNote.action.type, 'handled-locally');
  assert.ok(bareNote.text.includes('?'));
});

test('toolValidation validates payloads, gates destructive calls, and deduplicates retries', () => {
  const badTimer = validateAndMapToolCall('manage_timer', { command: 'start', seconds: 2 });
  assert.equal(badTimer.valid, false);

  const clearTimer = validateAndMapToolCall('manage_timer', { command: 'cancel' });
  assert.equal(clearTimer.valid, true);
  assert.equal(clearTimer.requiresConfirmation?.kind, 'destructive');
  assert.equal(clearTimer.requiresConfirmation?.action.type, 'clear-timers');

  const depth = validateAndMapToolCall('set_response_depth', { depth: 'concise' });
  assert.equal(depth.valid, true);
  assert.equal(depth.actions[0].type, 'set-response-depth');

  const dedup = new ToolWriteDeduplicator(8, 5000);
  assert.equal(dedup.isDuplicate('add-note', { text: 'hello' }, 'c1', 1000), false);
  assert.equal(dedup.isDuplicate('add-note', { text: 'hello' }, 'c1', 2000), true);
  assert.equal(dedup.isDuplicate('add-note', { text: 'hello' }, 'c1', 8000), false);
});

test('liveSessionController helpers enforce turn interruption fencing, PCM encoding, and bounded backoff', () => {
  const tracker = new LiveTurnTracker();
  const t1 = tracker.beginTurn('turn-1');
  assert.equal(tracker.shouldAcceptAudioChunk(t1), true);
  tracker.interruptCurrentTurn(t1);
  assert.equal(tracker.shouldAcceptAudioChunk(t1), false);
  const t2 = tracker.beginTurn('turn-2');
  assert.equal(tracker.shouldAcceptAudioChunk(t2), true);

  assert.equal(computeBackoffDelayMs(0), 700);
  assert.equal(computeBackoffDelayMs(1), 1400);
  assert.equal(computeBackoffDelayMs(5), 4000);

  const sample = new Int16Array([0, 12000, -16384, 32767]);
  const b64 = pcm16ToBase64(sample);
  const decoded = base64ToPcm16(b64);
  assert.deepEqual(Array.from(decoded), Array.from(sample));

  const floatAudio = new Float32Array(480).fill(0.5);
  const down = downsampleFloat32ToInt16(floatAudio, 48000, 16000);
  assert.equal(down.pcm16.length, 160);
  assert.ok(down.rms > 0.45 && down.rms < 0.55);
});



