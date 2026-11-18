import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { EmotionNuance, EmotionState } from '../../core/types';
import {
  EMOTION_NUANCES,
  EMOTION_SPECS,
  clampGazeOffset,
  nextBlinkIntervalMs,
  smoothGazeStep,
} from '../../core/emotions';

interface XeroFaceProps {
  emotion: EmotionState;
  nuance?: EmotionNuance;
  isSpeaking?: boolean;
  isListening?: boolean;
  musicPlaying?: boolean;
  peeking?: boolean;
  pokeTick?: number;
  rapidPokeStreak?: number;
  faceColor?: string;
  accentColor?: string;
  reducedMotion?: boolean;
  size?: 'mini' | 'compact' | 'expanded' | 'preview';
  interactiveGaze?: boolean;
}

const EYE_SPRING = {
  type: 'spring' as const,
  stiffness: 380,
  damping: 28,
  mass: 0.56,
};

const HEAD_SPRING = {
  type: 'spring' as const,
  stiffness: 320,
  damping: 22,
  mass: 0.65,
};

const GAZE_EYE_SPRING = {
  type: 'spring' as const,
  stiffness: 155,
  damping: 20,
  mass: 0.9,
};

const GAZE_HEAD_SPRING = {
  type: 'spring' as const,
  stiffness: 110,
  damping: 18,
  mass: 1.05,
};

/**
 * PROTECTED COMPONENT — XERO's living flat-2D animated companion face.
 * Pure 2D glowing white capsule-pill eyes (HeyNixi notch aesthetic — zero 3D eyeballs,
 * zero heavy eyelashes or eyebrows), silky spring morphs across all 16 emotions,
 * autonomous idle curious glances, heart-eyes & flustered > < boop streaks,
 * RAF-throttled 2D gaze glide, natural squash blinks, and tactile headpat hearts.
 */
export const XeroFace: React.FC<XeroFaceProps> = React.memo(
  ({
    emotion,
    nuance = 'none',
    isSpeaking = false,
    isListening = false,
    musicPlaying = false,
    peeking = false,
    pokeTick = 0,
    rapidPokeStreak = 0,
    faceColor = '#FFFFFF',
    accentColor = '#00E5FF',
    reducedMotion = false,
    size = 'compact',
    interactiveGaze = true,
  }) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const gazeRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const targetGazeRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
    const lastPointerAtRef = useRef<number>(0);
    const [isBlinking, setIsBlinking] = useState(false);
    const [gaze, setGaze] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const [speechPulse, setSpeechPulse] = useState(0);
    const [heartBurstKey, setHeartBurstKey] = useState(0);
    const [showHearts, setShowHearts] = useState(false);
    const [flusteredSquint, setFlusteredSquint] = useState(false);
    const [heartEyesFlash, setHeartEyesFlash] = useState(false);

    const spec = EMOTION_SPECS[emotion] ?? EMOTION_SPECS.neutral;
    const nuanceSpec = EMOTION_NUANCES[nuance] ?? EMOTION_NUANCES.none;

    // Tactile 2D heart burst + cute boop streak eyes when petted/booped
    useEffect(() => {
      if (!pokeTick || reducedMotion) return;
      setHeartBurstKey((k) => k + 1);
      setShowHearts(true);
      if (rapidPokeStreak >= 5) {
        setFlusteredSquint(true);
        setHeartEyesFlash(false);
      } else if (rapidPokeStreak === 3 || emotion === 'affectionate') {
        setHeartEyesFlash(true);
      }
      const t = window.setTimeout(() => setShowHearts(false), 900);
      const t2 = window.setTimeout(() => {
        setFlusteredSquint(false);
        setHeartEyesFlash(false);
      }, 1150);
      return () => {
        window.clearTimeout(t);
        window.clearTimeout(t2);
      };
    }, [pokeTick, rapidPokeStreak, emotion, reducedMotion]);

    // Visibility-aware natural irregular blinking (occasional cute double-blink!)
    useEffect(() => {
      if (reducedMotion) {
        setIsBlinking(false);
        return;
      }
      let blinkTimeout: number | null = null;
      let reopenTimeout: number | null = null;
      let secondBlinkTimeout: number | null = null;

      const scheduleBlink = () => {
        const delay = nextBlinkIntervalMs(emotion, Math.random());
        blinkTimeout = window.setTimeout(() => {
          if (document.visibilityState === 'visible') {
            setIsBlinking(true);
            const doDouble = Math.random() < 0.24;
            reopenTimeout = window.setTimeout(() => {
              setIsBlinking(false);
              if (doDouble) {
                secondBlinkTimeout = window.setTimeout(() => {
                  setIsBlinking(true);
                  reopenTimeout = window.setTimeout(() => {
                    setIsBlinking(false);
                    scheduleBlink();
                  }, 95);
                }, 110);
              } else {
                scheduleBlink();
              }
            }, 110);
          } else {
            scheduleBlink();
          }
        }, delay);
      };

      scheduleBlink();
      return () => {
        if (blinkTimeout !== null) window.clearTimeout(blinkTimeout);
        if (reopenTimeout !== null) window.clearTimeout(reopenTimeout);
        if (secondBlinkTimeout !== null) window.clearTimeout(secondBlinkTimeout);
      };
    }, [emotion, reducedMotion]);

    // Lightweight damped lag gaze glide across ALL 16 emotions (zero CPU when settled)
    useEffect(() => {
      if (reducedMotion || !interactiveGaze) {
        gazeRef.current = { x: 0, y: 0 };
        targetGazeRef.current = { x: 0, y: 0 };
        setGaze({ x: 0, y: 0 });
        return;
      }

      let glideRafId = 0;
      let pointerComputeRafId = 0;
      let lastStepTime = 0;
      let pendingX = 0;
      let pendingY = 0;

      const stepGlide = (now: number) => {
        glideRafId = 0;
        if (lastStepTime !== 0 && now - lastStepTime < 20) {
          glideRafId = window.requestAnimationFrame(stepGlide);
          return;
        }
        lastStepTime = now;
        const next = smoothGazeStep(gazeRef.current, targetGazeRef.current, 0.16);
        const changed =
          Math.abs(next.x - gazeRef.current.x) >= 0.03 ||
          Math.abs(next.y - gazeRef.current.y) >= 0.03 ||
          next.settled;
        gazeRef.current = { x: next.x, y: next.y };
        if (changed) {
          setGaze({ x: next.x, y: next.y });
        }
        if (!next.settled) {
          glideRafId = window.requestAnimationFrame(stepGlide);
        }
      };

      const startGlideLoop = () => {
        if (glideRafId === 0) {
          lastStepTime = 0;
          glideRafId = window.requestAnimationFrame(stepGlide);
        }
      };

      // Autonomous curious glance if mouse has been stationary (>2.0s when thinking, >3.5s otherwise)
      const idleGlanceTimer = window.setInterval(() => {
        if (document.visibilityState !== 'visible' || emotion === 'sleepy') return;
        const idleThreshold = emotion === 'thinking' ? 2000 : 3500;
        if (Date.now() - lastPointerAtRef.current < idleThreshold) return;
        const dirs =
          emotion === 'thinking'
            ? [
                { x: -3.4, y: -2.0 },
                { x: 3.4, y: -2.0 },
              ]
            : [
                { x: -3.0, y: -0.6 },
                { x: 3.0, y: -0.6 },
                { x: 0, y: 0 },
                { x: 1.8, y: 1.4 },
              ];
        targetGazeRef.current = dirs[Math.floor(Math.random() * dirs.length)];
        startGlideLoop();
      }, emotion === 'thinking' ? 1200 : 4200);

      const handlePointerMove = (e: PointerEvent) => {
        if (document.visibilityState !== 'visible') return;
        lastPointerAtRef.current = Date.now();
        pendingX = e.clientX;
        pendingY = e.clientY;
        if (pointerComputeRafId !== 0) return;

        pointerComputeRafId = window.requestAnimationFrame(() => {
          pointerComputeRafId = 0;
          const el = svgRef.current;
          if (!el) return;
          const rect = el.getBoundingClientRect();
          const cx = rect.left + rect.width / 2;
          const cy = rect.top + rect.height / 2;
          targetGazeRef.current = clampGazeOffset((pendingX - cx) / 72, (pendingY - cy) / 72, 4.2);
          startGlideLoop();
        });
      };

      window.addEventListener('pointermove', handlePointerMove, { passive: true });
      return () => {
        window.removeEventListener('pointermove', handlePointerMove);
        window.clearInterval(idleGlanceTimer);
        if (glideRafId !== 0) window.cancelAnimationFrame(glideRafId);
        if (pointerComputeRafId !== 0) window.cancelAnimationFrame(pointerComputeRafId);
      };
    }, [emotion, interactiveGaze, reducedMotion]);

    // Smooth 2D speech mouth cadence when speaking
    useEffect(() => {
      if (!isSpeaking || reducedMotion) {
        setSpeechPulse(0);
        return;
      }
      let frame = 0;
      const timer = window.setInterval(() => {
        frame += 1;
        setSpeechPulse(0.32 + Math.abs(Math.sin(frame * 0.9)) * 0.58);
      }, 105);
      return () => window.clearInterval(timer);
    }, [isSpeaking, reducedMotion]);

    const dims =
      size === 'mini'
        ? { width: 42, height: 24 }
        : size === 'compact'
          ? { width: 58, height: 34 }
          : size === 'expanded'
            ? { width: 74, height: 42 }
            : { width: 102, height: 58 };

    const activeMouthOpen = isSpeaking
      ? Math.max(spec.mouthOpen, speechPulse)
      : spec.mouthOpen;

    // Pure 2D flat capsule pill eye renderer (no 3D spheres, no pupils, no irises)
    const renderPure2DEye = (
      cx: number,
      cy: number,
      eyeSpec: typeof spec.leftEye,
      isLeft: boolean
    ) => {
      // Cute > < flustered squint on rapid boops (tracks mouse cleanly!)
      if (flusteredSquint && !reducedMotion) {
        const d = isLeft
          ? `M ${cx - 6} ${cy - 4.5} L ${cx + 5} ${cy} L ${cx - 6} ${cy + 4.5}`
          : `M ${cx + 6} ${cy - 4.5} L ${cx - 5} ${cy} L ${cx + 6} ${cy + 4.5}`;
        return (
          <motion.g
            key={`${isLeft ? 'L' : 'R'}-flustered-gaze`}
            initial={false}
            animate={{ x: gaze.x * 0.95, y: gaze.y * 0.75 }}
            transition={GAZE_EYE_SPRING}
          >
            <motion.path
              key={`${isLeft ? 'L' : 'R'}-flustered`}
              d={d}
              fill="none"
              stroke={faceColor}
              strokeWidth={3.1}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ scale: 0.7 }}
              animate={{ scale: 1 }}
              transition={EYE_SPRING}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            />
          </motion.g>
        );
      }

      // Cute 2D pastel heart eyes on loving pet streak (tracks mouse cleanly!)
      if (heartEyesFlash && !reducedMotion) {
        return (
          <motion.g
            key={`${isLeft ? 'L' : 'R'}-heart-gaze`}
            initial={false}
            animate={{ x: gaze.x * 0.95, y: gaze.y * 0.75 }}
            transition={GAZE_EYE_SPRING}
          >
            <motion.path
              key={`${isLeft ? 'L' : 'R'}-heart`}
              d={`M ${cx} ${cy + 6.5} C ${cx - 8.5} ${cy + 1.5} ${cx - 8.5} ${cy - 6} ${cx - 3.5} ${cy - 6} C ${cx - 1.2} ${cy - 6} ${cx} ${cy - 4} ${cx} ${cy - 4} C ${cx} ${cy - 4} ${cx + 1.2} ${cy - 6} ${cx + 3.5} ${cy - 6} C ${cx + 8.5} ${cy - 6} ${cx + 8.5} ${cy + 1.5} ${cx} ${cy + 6.5} Z`}
              fill="#FF5CA1"
              initial={{ scale: 0.55 }}
              animate={{ scale: 1 }}
              transition={EYE_SPRING}
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            />
          </motion.g>
        );
      }

      // Happy / Affectionate / Wink arc in pure 2D — tracks mouse smoothly too!
      if (eyeSpec.happyArc && !isBlinking && !peeking) {
        return (
          <motion.g
            key={`${isLeft ? 'L' : 'R'}-arc-gaze`}
            initial={false}
            animate={{
              x: gaze.x * 0.95,
              y: gaze.y * 0.75,
            }}
            transition={GAZE_EYE_SPRING}
          >
            <motion.path
              key={`${isLeft ? 'L' : 'R'}-arc`}
              d={`M ${cx - 7.2} ${cy + 2.5} Q ${cx} ${cy - 7.4} ${cx + 7.2} ${cy + 2.5}`}
              fill="none"
              stroke={faceColor}
              strokeWidth={3.3}
              strokeLinecap="round"
              initial={false}
              animate={{
                opacity: 1,
                scaleY: isSpeaking && !reducedMotion ? [1, 0.92, 1] : 1,
              }}
              transition={
                isSpeaking && !reducedMotion
                  ? {
                      scaleY: { repeat: Infinity, duration: 0.34, ease: 'easeInOut' },
                      default: EYE_SPRING,
                    }
                  : EYE_SPRING
              }
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            />
          </motion.g>
        );
      }

      const effectiveUpperLid = peeking ? 0 : eyeSpec.upperLid;
      const baseW =
        emotion === 'surprised' || peeking
          ? 11.2
          : emotion === 'focused'
            ? 11.0
            : 8.6;
      const baseH = peeking ? 18.5 : 17.5;
      const pillW = baseW * eyeSpec.scaleX;
      const lidFactor = 1 - (isBlinking ? 0.92 : effectiveUpperLid * 0.8);
      const pillH = Math.max(2.6, baseH * (peeking ? 1.05 : eyeSpec.scaleY) * lidFactor);
      const pillRx = Math.min(pillW / 2, pillH / 2);

      const tilt =
        peeking
          ? 0
          : emotion === 'annoyed'
            ? isLeft
              ? 14
              : -14
            : emotion === 'sad'
              ? isLeft
                ? -12
                : 12
              : eyeSpec.tiltDeg * 0.7;

      return (
        <motion.g
          key={`${isLeft ? 'L' : 'R'}-pill`}
          initial={false}
          animate={{
            x: gaze.x * 0.95,
            y: isBlinking ? gaze.y * 0.75 + 0.8 : peeking ? 1.5 : gaze.y * 0.75 + eyeSpec.lowerLid * 1.6,
            rotate: tilt,
            scaleY: isBlinking ? 0.16 : isListening && !reducedMotion ? [1, 1.07, 1] : 1,
          }}
          transition={
            !isBlinking && isListening && !reducedMotion
              ? {
                  scaleY: { repeat: Infinity, duration: 1.35, ease: 'easeInOut' },
                  x: GAZE_EYE_SPRING,
                  y: GAZE_EYE_SPRING,
                  default: EYE_SPRING,
                }
              : {
                  x: GAZE_EYE_SPRING,
                  y: GAZE_EYE_SPRING,
                  default: EYE_SPRING,
                }
          }
          style={{ transformOrigin: `${cx}px ${cy}px` }}
        >
          {/* Soft uniform 2D glow halo matching HeyNixi's luminous OLED pill eyes */}
          <rect
            x={cx - pillW / 2 - 2}
            y={cy - pillH / 2 - 2}
            width={pillW + 4}
            height={pillH + 4}
            rx={pillRx + 2}
            fill={faceColor}
            opacity={emotion === 'sleepy' || emotion === 'bored' ? 0.08 : 0.18}
          />
          <motion.rect
            initial={false}
            animate={{
              x: cx - pillW / 2,
              y: cy - pillH / 2,
              width: pillW,
              height: pillH,
              rx: pillRx,
            }}
            transition={EYE_SPRING}
            fill={faceColor}
          />
        </motion.g>
      );
    };

    const mouthCenterX = 60;
    const mouthCenterY = 51;
    const halfMouthW = 7.2 * spec.mouthWidth;
    const curveOffset = spec.mouthCurve * 6.2;
    const isCuteCatSmile = (emotion === 'affectionate' || emotion === 'playful' || flusteredSquint) && !isSpeaking;
    const isOpenHappy = activeMouthOpen > 0.28;

    const mouthPath = isCuteCatSmile
      ? `M ${mouthCenterX - 6.8} ${mouthCenterY - 0.5} Q ${mouthCenterX - 3.2} ${mouthCenterY + 4.1} ${mouthCenterX} ${mouthCenterY + 0.3} Q ${mouthCenterX + 3.2} ${mouthCenterY + 4.1} ${mouthCenterX + 6.8} ${mouthCenterY - 0.5}`
      : isOpenHappy
        ? `M ${mouthCenterX - halfMouthW * 0.62} ${mouthCenterY - 0.5} Q ${mouthCenterX} ${mouthCenterY - 1.2 + curveOffset * 0.25} ${mouthCenterX + halfMouthW * 0.62} ${mouthCenterY - 0.5} Q ${mouthCenterX} ${mouthCenterY + 4.2 + activeMouthOpen * 7.2} ${mouthCenterX - halfMouthW * 0.62} ${mouthCenterY - 0.5} Z`
        : `M ${mouthCenterX - halfMouthW * 0.8} ${mouthCenterY} Q ${mouthCenterX} ${mouthCenterY + curveOffset} ${mouthCenterX + halfMouthW * 0.8} ${mouthCenterY}`;

    const blushOpacity = Math.min(
      0.78,
      spec.cheekOpacity * 0.6 + nuanceSpec.blushBoost + (showHearts || flusteredSquint ? 0.3 : 0.14)
    );
    const targetHeadTilt = spec.headTiltDeg + nuanceSpec.headTiltOffset + (reducedMotion ? 0 : gaze.x * 0.42);

    return (
      <svg
        ref={svgRef}
        width={dims.width}
        height={dims.height}
        viewBox="0 0 120 68"
        aria-label={`XERO face showing ${spec.label} expression`}
        role="img"
        data-testid="xero-face"
        data-emotion={emotion}
        data-nuance={nuance}
        className="select-none overflow-visible shrink-0"
      >
        <motion.g
          initial={false}
          animate={
            reducedMotion
              ? { x: 0, y: spec.headOffsetY, rotate: targetHeadTilt }
              : {
                  x: gaze.x * 0.46,
                  y: musicPlaying
                    ? [spec.headOffsetY + gaze.y * 0.35 - 1.5, spec.headOffsetY + gaze.y * 0.35 + 1.5, spec.headOffsetY + gaze.y * 0.35 - 1.5]
                    : [spec.headOffsetY + gaze.y * 0.35 - 0.85, spec.headOffsetY + gaze.y * 0.35 + 0.85, spec.headOffsetY + gaze.y * 0.35 - 0.85],
                  rotate: musicPlaying
                    ? [targetHeadTilt - 2.2, targetHeadTilt + 2.2, targetHeadTilt - 2.2]
                    : peeking
                      ? -4
                      : nuance === 'waking'
                        ? [targetHeadTilt - 3, targetHeadTilt + 3, targetHeadTilt]
                        : targetHeadTilt,
                }
          }
          transition={
            reducedMotion
              ? HEAD_SPRING
              : {
                  y: { repeat: Infinity, duration: musicPlaying ? 0.72 : 3.2, ease: 'easeInOut' },
                  rotate: musicPlaying
                    ? { repeat: Infinity, duration: 1.44, ease: 'easeInOut' }
                    : !peeking && nuance === 'waking'
                      ? { duration: 0.55, ease: 'easeInOut' }
                      : GAZE_HEAD_SPRING,
                  x: GAZE_HEAD_SPRING,
                }
          }
          style={{ transformOrigin: '60px 34px' }}
        >
          <motion.g
            key={`pet-bounce-${heartBurstKey}`}
            initial={heartBurstKey > 0 && !reducedMotion ? { scaleX: 1.15, scaleY: 0.84 } : false}
            animate={{ scaleX: 1, scaleY: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 14 }}
            style={{ transformOrigin: '60px 36px' }}
          >
            {/* Soft flat 2D cheek blush */}
            <motion.ellipse
              cx={23}
              cy={44}
              rx={6.6}
              ry={3.0}
              fill="#FF5CA1"
              animate={{ opacity: blushOpacity }}
              transition={{ duration: 0.25 }}
            />
            <motion.ellipse
              cx={97}
              cy={44}
              rx={6.6}
              ry={3.0}
              fill="#FF5CA1"
              animate={{ opacity: blushOpacity }}
              transition={{ duration: 0.25 }}
            />

            {/* Pure flat 2D HeyNixi white pill eyes */}
            {renderPure2DEye(41, 30, spec.leftEye, true)}
            {renderPure2DEye(79, 30, spec.rightEye, false)}

            {/* Flat 2D cute mouth */}
            <motion.g
              initial={false}
              animate={
                reducedMotion
                  ? { scaleY: 1, scaleX: 1 }
                  : {
                      scaleY: isSpeaking ? 0.92 + speechPulse * 0.2 : 1,
                      scaleX: isSpeaking ? 1.04 - speechPulse * 0.06 : 1,
                    }
              }
              transition={{ type: 'spring', stiffness: 420, damping: 24, mass: 0.45 }}
              style={{ transformOrigin: `${mouthCenterX}px ${mouthCenterY}px` }}
            >
              <path
                d={mouthPath}
                fill={isOpenHappy && !isCuteCatSmile ? '#6A1F42' : 'none'}
                stroke={faceColor}
                strokeWidth={isOpenHappy && !isCuteCatSmile ? 1.5 : 2.1}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-colors duration-150"
              />
              {isOpenHappy && !isCuteCatSmile && (
                <motion.ellipse
                  initial={false}
                  animate={{ opacity: 1, scaleY: 1 }}
                  cx={mouthCenterX}
                  cy={mouthCenterY + 2.8 + activeMouthOpen * 1.8}
                  rx={3.2}
                  ry={1.7}
                  fill="#FF6B9E"
                />
              )}
            </motion.g>

            {/* Excited 2D sparkles */}
            <AnimatePresence>
              {emotion === 'excited' && !reducedMotion && (
                <motion.g
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: [0.65, 1, 0.65], scale: [0.9, 1.12, 0.9] }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                  style={{ transformOrigin: '60px 24px' }}
                >
                  <path
                    d="M 18 14 L 19.3 17.2 L 22.5 18.5 L 19.3 19.8 L 18 23 L 16.7 19.8 L 13.5 18.5 L 16.7 17.2 Z"
                    fill={accentColor}
                  />
                  <path
                    d="M 102 14 L 103.3 17.2 L 106.5 18.5 L 103.3 19.8 L 102 23 L 100.7 19.8 L 97.5 18.5 L 100.7 17.2 Z"
                    fill={accentColor}
                  />
                </motion.g>
              )}
            </AnimatePresence>

            {/* Sleepy floating 2D 'z' */}
            <AnimatePresence>
              {emotion === 'sleepy' && !reducedMotion && (
                <motion.text
                  x={101}
                  y={18}
                  fill={faceColor}
                  fontSize={10}
                  fontWeight={700}
                  initial={{ opacity: 0, y: 2 }}
                  animate={{ opacity: [0.25, 0.85, 0.25], y: [-1, -5, -1] }}
                  exit={{ opacity: 0, transition: { duration: 0.15 } }}
                  transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                >
                  z
                </motion.text>
              )}
            </AnimatePresence>

            {/* Thinking 2D dots */}
            <AnimatePresence>
              {emotion === 'thinking' && !reducedMotion && (
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  {[0, 1, 2].map((idx) => (
                    <motion.circle
                      key={idx}
                      cx={53 + idx * 7}
                      cy={10}
                      r={1.6}
                      fill={accentColor}
                      animate={{ opacity: [0.25, 1, 0.25], y: [0, -1.8, 0] }}
                      transition={{
                        repeat: Infinity,
                        duration: 0.9,
                        delay: idx * 0.16,
                        ease: 'easeInOut',
                      }}
                    />
                  ))}
                </motion.g>
              )}
            </AnimatePresence>

            {/* Satisfied / Anticipating subtle 2D mini-glint */}
            <AnimatePresence>
              {(emotion === 'surprised' || nuance === 'satisfied' || nuance === 'anticipating') &&
                emotion !== 'excited' &&
                !reducedMotion && (
                  <motion.g
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: [0.35, 0.9, 0.35], scale: [0.85, 1.08, 0.85] }}
                    exit={{ opacity: 0, scale: 0.5 }}
                    transition={{ repeat: Infinity, duration: 1.9, ease: 'easeInOut' }}
                    style={{ transformOrigin: '103px 16px' }}
                  >
                    <path
                      d="M 103 12 L 104 14.5 L 106.5 15.5 L 104 16.5 L 103 19 L 102 16.5 L 99.5 15.5 L 102 14.5 Z"
                      fill={accentColor}
                    />
                  </motion.g>
                )}
            </AnimatePresence>

            {/* Rhythmic 2D music note float while vibing */}
            <AnimatePresence>
              {musicPlaying && emotion !== 'sleepy' && !reducedMotion && (
                <motion.path
                  d="M 15 19 L 15 11.5 L 20.5 10.2 L 20.5 17 M 13.5 19 A 1.7 1.3 0 1 1 16.2 19 A 1.7 1.3 0 1 1 13.5 19 M 19 17.3 A 1.7 1.3 0 1 1 21.7 17.3 A 1.7 1.3 0 1 1 19 17.3"
                  fill="none"
                  stroke={accentColor}
                  strokeWidth={1.35}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: [0.35, 0.9, 0.35], y: [1.5, -2.5, 1.5] }}
                  exit={{ opacity: 0 }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: 'easeInOut' }}
                />
              )}
            </AnimatePresence>
          </motion.g>
        </motion.g>

        {/* Tactile 2D heart burst */}
        <AnimatePresence>
          {showHearts && !reducedMotion && (
            <motion.g
              key={`hearts-${heartBurstKey}`}
              initial={{ opacity: 0, y: 4, scale: 0.6 }}
              animate={{ opacity: [0, 1, 0], y: -12, scale: [0.7, 1.15, 0.9] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.85, ease: 'easeOut' }}
              className="pointer-events-none"
            >
              <path
                d="M 103 16 C 103 13.8 106 13.2 106.8 15.2 C 107.6 13.2 110.6 13.8 110.6 16 C 110.6 18.6 106.8 20.8 106.8 20.8 C 106.8 20.8 103 18.6 103 16 Z"
                fill="#FF5CA1"
              />
              <path
                d="M 11 19 C 11 17.5 13 17.1 13.6 18.4 C 14.2 17.1 16.2 17.5 16.2 19 C 16.2 20.8 13.6 22.3 13.6 22.3 C 13.6 22.3 11 20.8 11 19 Z"
                fill="#FF8CC6"
              />
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
    );
  }
);

XeroFace.displayName = 'XeroFace';
