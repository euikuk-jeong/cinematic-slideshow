// LumisShow(frontend/assets/css/slideshow.css)의 전환 keyframe(ss-out-*/ss-in-*)과
// 동일한 값으로 이식. 'dissolve'는 웹에서도 fade와 완전히 동일한 애니메이션을 쓰는
// 별칭이라 그대로 유지(무작위 풀에서 fade가 뽑힐 확률만 살짝 높이는 효과).
// 'blur'는 CSS filter blur를 그대로 옮길 수 없어(RN 스타일 속성 아님, expo-blur의
// intensity도 애니메이션 불가 — reanimated 필요) fade와 동일한 opacity 크로스페이드에
// 별도의 블러 오버레이(0→1→0 opacity, usesBlurOverlay)를 겹쳐 블러-디졸브 느낌만 근사한다.
export const TRANSITION_EFFECTS = [
  'fade',
  'dissolve',
  'slide-left',
  'slide-right',
  'slide-up',
  'zoom-in',
  'zoom-out',
  'flip-h',
  'blur',
] as const;
export type TransitionEffect = (typeof TRANSITION_EFFECTS)[number];

export const TRANSITION_DURATION_MS = 700;
export const FLIP_HALF_DURATION_MS = TRANSITION_DURATION_MS / 2;

export interface SlotTransitionStyle {
  opacity: [number, number];
  translateXPercent: [number, number];
  translateYPercent: [number, number];
  scale: [number, number];
  rotateYDeg: [number, number];
}

export interface TransitionSpec {
  effect: TransitionEffect;
  out: SlotTransitionStyle;
  in: SlotTransitionStyle;
  isFlip: boolean;
  usesBlurOverlay: boolean;
}

const IDENTITY: SlotTransitionStyle = {
  opacity: [1, 1],
  translateXPercent: [0, 0],
  translateYPercent: [0, 0],
  scale: [1, 1],
  rotateYDeg: [0, 0],
};

function style(overrides: Partial<SlotTransitionStyle>): SlotTransitionStyle {
  return { ...IDENTITY, ...overrides };
}

const SPECS: Record<TransitionEffect, { out: Partial<SlotTransitionStyle>; in: Partial<SlotTransitionStyle> }> = {
  fade: { out: { opacity: [1, 0] }, in: { opacity: [0, 1] } },
  dissolve: { out: { opacity: [1, 0] }, in: { opacity: [0, 1] } },
  'slide-left': { out: { translateXPercent: [0, -1] }, in: { translateXPercent: [1, 0] } },
  'slide-right': { out: { translateXPercent: [0, 1] }, in: { translateXPercent: [-1, 0] } },
  'slide-up': { out: { translateYPercent: [0, -1] }, in: { translateYPercent: [1, 0] } },
  'zoom-in': { out: { opacity: [1, 0] }, in: { opacity: [0, 1], scale: [0.85, 1] } },
  'zoom-out': { out: { opacity: [1, 0], scale: [1, 1.15] }, in: { opacity: [0, 1] } },
  'flip-h': { out: { rotateYDeg: [0, 90] }, in: { rotateYDeg: [-90, 0] } },
  blur: { out: { opacity: [1, 0] }, in: { opacity: [0, 1] } },
};

export function pickTransitionEffect(random: () => number = Math.random): TransitionEffect {
  const index = Math.min(TRANSITION_EFFECTS.length - 1, Math.floor(random() * TRANSITION_EFFECTS.length));
  return TRANSITION_EFFECTS[index];
}

export function getTransitionSpec(effect: TransitionEffect): TransitionSpec {
  const raw = SPECS[effect];
  return {
    effect,
    out: style(raw.out),
    in: style(raw.in),
    isFlip: effect === 'flip-h',
    usesBlurOverlay: effect === 'blur',
  };
}
