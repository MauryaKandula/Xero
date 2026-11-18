import type { EmotionState } from './types';

export interface EyeGeometry {
  scaleX: number;
  scaleY: number;
  tiltDeg: number;
  upperLid: number; // 0 = wide open, 1 = closed
  lowerLid: number; // 0 = neutral, 0.55 = happy squint
  pupilScale: number;
  sparkle: boolean;
  happyArc: boolean;
}

export interface FaceExpressionSpec {
  id: EmotionState;
  label: string;
  description: string;
  leftEye: EyeGeometry;
  rightEye: EyeGeometry;
  leftBrowDeg: number;
  rightBrowDeg: number;
  browOffsetY: number;
  mouthCurve: number; // -1 sad, 0 flat, +1 big smile
  mouthWidth: number; // 0.5..1.4
  mouthOpen: number; // 0..1
  cheekOpacity: number;
  headTiltDeg: number;
  headOffsetY: number;
  auraTone: 'cyan' | 'violet' | 'pink' | 'green' | 'amber' | 'red' | 'dim';
}

export const ALL_EMOTIONS: EmotionState[] = [
  'neutral',
  'happy',
  'sad',
  'curious',
  'surprised',
  'excited',
  'confused',
  'annoyed',
  'sleepy',
  'bored',
  'affectionate',
  'focused',
  'playful',
  'listening',
  'thinking',
  'speaking',
];

export const EMOTION_SPECS: Record<EmotionState, FaceExpressionSpec> = {
  neutral: {
    id: 'neutral',
    label: 'Neutral',
    description: 'Calm, attentive baseline presence',
    leftEye: { scaleX: 1, scaleY: 1, tiltDeg: 0, upperLid: 0.05, lowerLid: 0, pupilScale: 1, sparkle: false, happyArc: false },
    rightEye: { scaleX: 1, scaleY: 1, tiltDeg: 0, upperLid: 0.05, lowerLid: 0, pupilScale: 1, sparkle: false, happyArc: false },
    leftBrowDeg: 0,
    rightBrowDeg: 0,
    browOffsetY: 0,
    mouthCurve: 0.25,
    mouthWidth: 0.9,
    mouthOpen: 0,
    cheekOpacity: 0,
    headTiltDeg: 0,
    headOffsetY: 0,
    auraTone: 'cyan',
  },
  happy: {
    id: 'happy',
    label: 'Happy',
    description: 'Warm, cheerful upturned eyes and smile',
    leftEye: { scaleX: 1.06, scaleY: 0.95, tiltDeg: 0, upperLid: 0.04, lowerLid: 0.45, pupilScale: 1.1, sparkle: true, happyArc: true },
    rightEye: { scaleX: 1.06, scaleY: 0.95, tiltDeg: 0, upperLid: 0.04, lowerLid: 0.45, pupilScale: 1.1, sparkle: true, happyArc: true },
    leftBrowDeg: -6,
    rightBrowDeg: 6,
    browOffsetY: -2,
    mouthCurve: 0.85,
    mouthWidth: 1.15,
    mouthOpen: 0.15,
    cheekOpacity: 0.45,
    headTiltDeg: -2,
    headOffsetY: -1,
    auraTone: 'green',
  },
  sad: {
    id: 'sad',
    label: 'Sad',
    description: 'Downcast gaze with empathetic brow slope',
    leftEye: { scaleX: 0.94, scaleY: 0.88, tiltDeg: -10, upperLid: 0.28, lowerLid: 0.1, pupilScale: 0.92, sparkle: false, happyArc: false },
    rightEye: { scaleX: 0.94, scaleY: 0.88, tiltDeg: 10, upperLid: 0.28, lowerLid: 0.1, pupilScale: 0.92, sparkle: false, happyArc: false },
    leftBrowDeg: -16,
    rightBrowDeg: 16,
    browOffsetY: 2,
    mouthCurve: -0.65,
    mouthWidth: 0.8,
    mouthOpen: 0.05,
    cheekOpacity: 0,
    headTiltDeg: 3,
    headOffsetY: 2,
    auraTone: 'dim',
  },
  curious: {
    id: 'curious',
    label: 'Curious',
    description: 'Asymmetric inquisitive brow and tilted head',
    leftEye: { scaleX: 1.08, scaleY: 1.12, tiltDeg: 0, upperLid: 0, lowerLid: 0, pupilScale: 1.12, sparkle: true, happyArc: false },
    rightEye: { scaleX: 0.95, scaleY: 0.92, tiltDeg: 0, upperLid: 0.16, lowerLid: 0.08, pupilScale: 1.05, sparkle: false, happyArc: false },
    leftBrowDeg: -10,
    rightBrowDeg: 4,
    browOffsetY: -3,
    mouthCurve: 0.15,
    mouthWidth: 0.72,
    mouthOpen: 0.08,
    cheekOpacity: 0,
    headTiltDeg: 6,
    headOffsetY: -1,
    auraTone: 'cyan',
  },
  surprised: {
    id: 'surprised',
    label: 'Surprised',
    description: 'Wide-eyed alert reaction with open mouth',
    leftEye: { scaleX: 1.18, scaleY: 1.24, tiltDeg: 0, upperLid: 0, lowerLid: 0, pupilScale: 0.78, sparkle: true, happyArc: false },
    rightEye: { scaleX: 1.18, scaleY: 1.24, tiltDeg: 0, upperLid: 0, lowerLid: 0, pupilScale: 0.78, sparkle: true, happyArc: false },
    leftBrowDeg: -8,
    rightBrowDeg: 8,
    browOffsetY: -5,
    mouthCurve: 0,
    mouthWidth: 0.52,
    mouthOpen: 0.78,
    cheekOpacity: 0.15,
    headTiltDeg: 0,
    headOffsetY: -2,
    auraTone: 'amber',
  },
  excited: {
    id: 'excited',
    label: 'Excited',
    description: 'Sparkling high-energy expression',
    leftEye: { scaleX: 1.14, scaleY: 1.16, tiltDeg: 0, upperLid: 0, lowerLid: 0.25, pupilScale: 1.22, sparkle: true, happyArc: false },
    rightEye: { scaleX: 1.14, scaleY: 1.16, tiltDeg: 0, upperLid: 0, lowerLid: 0.25, pupilScale: 1.22, sparkle: true, happyArc: false },
    leftBrowDeg: -10,
    rightBrowDeg: 10,
    browOffsetY: -4,
    mouthCurve: 0.95,
    mouthWidth: 1.24,
    mouthOpen: 0.45,
    cheekOpacity: 0.5,
    headTiltDeg: -3,
    headOffsetY: -2,
    auraTone: 'cyan',
  },
  confused: {
    id: 'confused',
    label: 'Confused',
    description: 'Offset eyes and questioning squint',
    leftEye: { scaleX: 1.05, scaleY: 1.05, tiltDeg: 4, upperLid: 0.08, lowerLid: 0, pupilScale: 0.95, sparkle: false, happyArc: false },
    rightEye: { scaleX: 0.92, scaleY: 0.76, tiltDeg: -6, upperLid: 0.34, lowerLid: 0.15, pupilScale: 0.9, sparkle: false, happyArc: false },
    leftBrowDeg: -14,
    rightBrowDeg: -6,
    browOffsetY: -1,
    mouthCurve: -0.25,
    mouthWidth: 0.78,
    mouthOpen: 0.1,
    cheekOpacity: 0,
    headTiltDeg: -7,
    headOffsetY: 0,
    auraTone: 'amber',
  },
  annoyed: {
    id: 'annoyed',
    label: 'Annoyed',
    description: 'Half-lidded sharp brow glare',
    leftEye: { scaleX: 1, scaleY: 0.72, tiltDeg: 10, upperLid: 0.42, lowerLid: 0.18, pupilScale: 0.88, sparkle: false, happyArc: false },
    rightEye: { scaleX: 1, scaleY: 0.72, tiltDeg: -10, upperLid: 0.42, lowerLid: 0.18, pupilScale: 0.88, sparkle: false, happyArc: false },
    leftBrowDeg: 18,
    rightBrowDeg: -18,
    browOffsetY: 3,
    mouthCurve: -0.45,
    mouthWidth: 0.85,
    mouthOpen: 0,
    cheekOpacity: 0,
    headTiltDeg: 0,
    headOffsetY: 1,
    auraTone: 'red',
  },
  sleepy: {
    id: 'sleepy',
    label: 'Sleepy',
    description: 'Drowsy low eyelids and dimmed aura',
    leftEye: { scaleX: 1.02, scaleY: 0.48, tiltDeg: -4, upperLid: 0.72, lowerLid: 0.12, pupilScale: 0.85, sparkle: false, happyArc: false },
    rightEye: { scaleX: 1.02, scaleY: 0.48, tiltDeg: 4, upperLid: 0.72, lowerLid: 0.12, pupilScale: 0.85, sparkle: false, happyArc: false },
    leftBrowDeg: -5,
    rightBrowDeg: 5,
    browOffsetY: 3,
    mouthCurve: 0,
    mouthWidth: 0.55,
    mouthOpen: 0.22,
    cheekOpacity: 0.15,
    headTiltDeg: 4,
    headOffsetY: 2,
    auraTone: 'dim',
  },
  bored: {
    id: 'bored',
    label: 'Bored',
    description: 'Flat unimpressed gaze and neutral line mouth',
    leftEye: { scaleX: 1, scaleY: 0.68, tiltDeg: 0, upperLid: 0.48, lowerLid: 0, pupilScale: 0.9, sparkle: false, happyArc: false },
    rightEye: { scaleX: 1, scaleY: 0.68, tiltDeg: 0, upperLid: 0.48, lowerLid: 0, pupilScale: 0.9, sparkle: false, happyArc: false },
    leftBrowDeg: 2,
    rightBrowDeg: -2,
    browOffsetY: 2,
    mouthCurve: -0.05,
    mouthWidth: 0.88,
    mouthOpen: 0,
    cheekOpacity: 0,
    headTiltDeg: -3,
    headOffsetY: 1,
    auraTone: 'dim',
  },
  affectionate: {
    id: 'affectionate',
    label: 'Affectionate',
    description: 'Soft warm arcs and gentle rosy glow',
    leftEye: { scaleX: 1.05, scaleY: 0.9, tiltDeg: -4, upperLid: 0.08, lowerLid: 0.5, pupilScale: 1.24, sparkle: true, happyArc: true },
    rightEye: { scaleX: 1.05, scaleY: 0.9, tiltDeg: 4, upperLid: 0.08, lowerLid: 0.5, pupilScale: 1.24, sparkle: true, happyArc: true },
    leftBrowDeg: -8,
    rightBrowDeg: 8,
    browOffsetY: -2,
    mouthCurve: 0.75,
    mouthWidth: 0.95,
    mouthOpen: 0.08,
    cheekOpacity: 0.72,
    headTiltDeg: 5,
    headOffsetY: 0,
    auraTone: 'pink',
  },
  focused: {
    id: 'focused',
    label: 'Focused',
    description: 'Precision narrow gaze for reasoning and tasks',
    leftEye: { scaleX: 1.02, scaleY: 0.84, tiltDeg: 5, upperLid: 0.22, lowerLid: 0.22, pupilScale: 0.92, sparkle: false, happyArc: false },
    rightEye: { scaleX: 1.02, scaleY: 0.84, tiltDeg: -5, upperLid: 0.22, lowerLid: 0.22, pupilScale: 0.92, sparkle: false, happyArc: false },
    leftBrowDeg: 10,
    rightBrowDeg: -10,
    browOffsetY: 1,
    mouthCurve: 0.05,
    mouthWidth: 0.76,
    mouthOpen: 0,
    cheekOpacity: 0,
    headTiltDeg: 0,
    headOffsetY: 0,
    auraTone: 'cyan',
  },
  playful: {
    id: 'playful',
    label: 'Playful',
    description: 'Cheeky wink and mischievous grin',
    leftEye: { scaleX: 1.08, scaleY: 1.06, tiltDeg: 0, upperLid: 0, lowerLid: 0.2, pupilScale: 1.15, sparkle: true, happyArc: false },
    rightEye: { scaleX: 1.06, scaleY: 0.35, tiltDeg: -6, upperLid: 0.82, lowerLid: 0.3, pupilScale: 1, sparkle: false, happyArc: true },
    leftBrowDeg: -8,
    rightBrowDeg: 6,
    browOffsetY: -2,
    mouthCurve: 0.88,
    mouthWidth: 1.1,
    mouthOpen: 0.22,
    cheekOpacity: 0.4,
    headTiltDeg: -6,
    headOffsetY: -1,
    auraTone: 'violet',
  },
  listening: {
    id: 'listening',
    label: 'Listening',
    description: 'Attentive dilated pupils awaiting input',
    leftEye: { scaleX: 1.08, scaleY: 1.1, tiltDeg: 0, upperLid: 0, lowerLid: 0.05, pupilScale: 1.16, sparkle: true, happyArc: false },
    rightEye: { scaleX: 1.08, scaleY: 1.1, tiltDeg: 0, upperLid: 0, lowerLid: 0.05, pupilScale: 1.16, sparkle: true, happyArc: false },
    leftBrowDeg: -6,
    rightBrowDeg: 6,
    browOffsetY: -2,
    mouthCurve: 0.18,
    mouthWidth: 0.72,
    mouthOpen: 0.05,
    cheekOpacity: 0.12,
    headTiltDeg: 2,
    headOffsetY: -1,
    auraTone: 'cyan',
  },
  thinking: {
    id: 'thinking',
    label: 'Thinking',
    description: 'Upward scanning gaze while processing',
    leftEye: { scaleX: 0.98, scaleY: 0.92, tiltDeg: 0, upperLid: 0.18, lowerLid: 0.12, pupilScale: 0.94, sparkle: false, happyArc: false },
    rightEye: { scaleX: 0.98, scaleY: 0.92, tiltDeg: 0, upperLid: 0.18, lowerLid: 0.12, pupilScale: 0.94, sparkle: false, happyArc: false },
    leftBrowDeg: -8,
    rightBrowDeg: 10,
    browOffsetY: -2,
    mouthCurve: 0.02,
    mouthWidth: 0.65,
    mouthOpen: 0,
    cheekOpacity: 0,
    headTiltDeg: -4,
    headOffsetY: 0,
    auraTone: 'violet',
  },
  speaking: {
    id: 'speaking',
    label: 'Speaking',
    description: 'Animated voice-reactive cadence',
    leftEye: { scaleX: 1.05, scaleY: 1.04, tiltDeg: 0, upperLid: 0.04, lowerLid: 0.22, pupilScale: 1.08, sparkle: true, happyArc: false },
    rightEye: { scaleX: 1.05, scaleY: 1.04, tiltDeg: 0, upperLid: 0.04, lowerLid: 0.22, pupilScale: 1.08, sparkle: true, happyArc: false },
    leftBrowDeg: -5,
    rightBrowDeg: 5,
    browOffsetY: -1,
    mouthCurve: 0.55,
    mouthWidth: 1.0,
    mouthOpen: 0.52,
    cheekOpacity: 0.2,
    headTiltDeg: 0,
    headOffsetY: 0,
    auraTone: 'cyan',
  },
};

export function inferEmotionFromText(text: string, role: 'user' | 'assistant'): EmotionState {
  const lower = text.toLowerCase();

  if (/\b(love|thank|thanks|awesome|cute|appreciate|sweet)\b/.test(lower)) {
    return role === 'assistant' ? 'affectionate' : 'happy';
  }
  if (/\b(haha|lol|joke|funny|hehe|wink|play)\b/.test(lower)) {
    return 'playful';
  }
  if (/\b(wow|whoa|omg|amazing|incredible|unbelievable)\b/.test(lower) || /!{2,}/.test(text)) {
    return 'excited';
  }
  if (/\b(what|wait|huh|surprised|shock)\b/.test(lower)) {
    return 'surprised';
  }
  if (/\b(sleep|tired|nap|goodnight|yawn|exhausted)\b/.test(lower)) {
    return 'sleepy';
  }
  if (/\b(bored|boring|meh|whatever)\b/.test(lower)) {
    return 'bored';
  }
  if (/\b(error|failed|broken|crash|sorry|sad|unfortunately)\b/.test(lower)) {
    return 'sad';
  }
  if (/\b(annoyed|ugh|stop|wrong|bad)\b/.test(lower)) {
    return 'annoyed';
  }
  if (/\b(confused|unclear|weird|ambiguous)\b/.test(lower)) {
    return 'confused';
  }
  if (/\b(code|debug|calculate|analyze|algorithm|compute|timer|system)\b/.test(lower)) {
    return 'focused';
  }
  if (text.trim().endsWith('?')) {
    return 'curious';
  }
  if (role === 'assistant') {
    return 'happy';
  }
  return 'curious';
}

export function clampGazeOffset(dx: number, dy: number, maxRadius = 4.5): { x: number; y: number } {
  const dist = Math.hypot(dx, dy);
  if (dist === 0) return { x: 0, y: 0 };
  if (dist <= maxRadius) return { x: dx, y: dy };
  const scale = maxRadius / dist;
  return { x: dx * scale, y: dy * scale };
}

export function smoothGazeStep(
  current: { x: number; y: number },
  target: { x: number; y: number },
  alpha = 0.15
): { x: number; y: number; settled: boolean } {
  const dx = target.x - current.x;
  const dy = target.y - current.y;
  if (Math.hypot(dx, dy) < 0.04) {
    return { x: target.x, y: target.y, settled: true };
  }
  const factor = Math.min(1, Math.max(0.02, alpha));
  return {
    x: current.x + dx * factor,
    y: current.y + dy * factor,
    settled: false,
  };
}

export function nextBlinkIntervalMs(emotion: EmotionState, rand01: number): number {
  const clamped = Math.min(1, Math.max(0, rand01));
  if (emotion === 'sleepy' || emotion === 'bored') {
    return 1800 + Math.round(clamped * 1600);
  }
  if (emotion === 'surprised' || emotion === 'excited') {
    return 3600 + Math.round(clamped * 2400);
  }
  return 2400 + Math.round(clamped * 2800);
}

export interface ComplementaryNuanceSpec {
  label: string;
  baseEmotion: EmotionState;
  headTiltOffset: number;
  blushBoost: number;
  breatheScale: boolean;
}

export const EMOTION_NUANCES: Record<import('./types').EmotionNuance, ComplementaryNuanceSpec> = {
  none: { label: 'None', baseEmotion: 'neutral', headTiltOffset: 0, blushBoost: 0, breatheScale: false },
  anticipating: { label: 'Anticipation', baseEmotion: 'curious', headTiltOffset: -3, blushBoost: 0.1, breatheScale: true },
  concentrating: { label: 'Concentration', baseEmotion: 'focused', headTiltOffset: 2, blushBoost: 0, breatheScale: false },
  satisfied: { label: 'Satisfaction', baseEmotion: 'happy', headTiltOffset: 0, blushBoost: 0.18, breatheScale: true },
  frustrated: { label: 'Frustration', baseEmotion: 'annoyed', headTiltOffset: -2, blushBoost: 0, breatheScale: false },
  relaxed: { label: 'Relaxation', baseEmotion: 'neutral', headTiltOffset: 2, blushBoost: 0.12, breatheScale: true },
  embarrassed: { label: 'Embarrassment', baseEmotion: 'playful', headTiltOffset: 4, blushBoost: 0.38, breatheScale: false },
  waking: { label: 'Waking Up', baseEmotion: 'surprised', headTiltOffset: -3, blushBoost: 0.1, breatheScale: true },
  'gentle-breathing': { label: 'Gentle Breathing', baseEmotion: 'affectionate', headTiltOffset: 0, blushBoost: 0.16, breatheScale: true },
};

export function getTimeOfDayGreeting(hour: number, userName?: string): {
  greeting: string;
  emotion: EmotionState;
  whisper: string;
} {
  const name = userName?.trim() ? `, ${userName.trim()}` : '';
  if (hour >= 5 && hour < 12) {
    return {
      greeting: `Good morning${name}. XERO is awake and ready in local mode.`,
      emotion: 'happy',
      whisper: `Good morning${name}!`,
    };
  }
  if (hour >= 12 && hour < 17) {
    return {
      greeting: `Good afternoon${name}. Ready whenever you are.`,
      emotion: 'neutral',
      whisper: `Hey${name}~`,
    };
  }
  if (hour >= 17 && hour < 22) {
    return {
      greeting: `Good evening${name}. Subtle neon atmosphere active.`,
      emotion: 'affectionate',
      whisper: `Good evening${name}~`,
    };
  }
  return {
    greeting: `Quiet night mode${name}. Ready for late-night tasks.`,
    emotion: 'sleepy',
    whisper: 'Quiet night~',
  };
}

export function pickSpontaneousBehavior(seed01: number): {
  emotion: EmotionState;
  nuance: import('./types').EmotionNuance;
  whisper: string | null;
} {
  const s = Math.min(0.999, Math.max(0, seed01));
  if (s < 0.25) return { emotion: 'curious', nuance: 'anticipating', whisper: null };
  if (s < 0.5) return { emotion: 'neutral', nuance: 'relaxed', whisper: null };
  if (s < 0.72) return { emotion: 'happy', nuance: 'satisfied', whisper: null };
  if (s < 0.88) return { emotion: 'bored', nuance: 'none', whisper: null };
  return { emotion: 'playful', nuance: 'gentle-breathing', whisper: null };
}

