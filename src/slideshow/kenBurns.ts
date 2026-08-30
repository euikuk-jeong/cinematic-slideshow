// LumisShow(frontend/assets/css/slideshow.css)의 kb-tl/tr/bl/br/t/b/l/r 8방향 keyframe과
// 동일한 수치로 이식 — 항상 확대(줌아웃 없음), 시작부터 살짝 확대(1.08)돼 있어 애니메이션
// 시작 순간이 밋밋해 보이지 않는다. 팬 이동량(±3%)은 화면 크기 기준.
const START_SCALE = 1.08;
const END_SCALE = 1.15;
const PAN_PERCENT = 0.03;

export const KEN_BURNS_DIRECTIONS = ['tl', 'tr', 'bl', 'br', 't', 'b', 'l', 'r'] as const;
export type KenBurnsDirection = (typeof KEN_BURNS_DIRECTIONS)[number];

export interface KenBurnsSpec {
  direction: KenBurnsDirection;
}

/**
 * 사진마다 팬 방향(8방향)을 무작위로 골라 매번 다른 움직임을 만든다(컴포넌트가 아닌
 * 여기서 랜덤을 주입 가능하게 분리해 node 테스트로 검증 — playback.ts의 defaultShuffle과
 * 동일 패턴).
 */
export function generateKenBurnsSpec(random: () => number = Math.random): KenBurnsSpec {
  const index = Math.min(KEN_BURNS_DIRECTIONS.length - 1, Math.floor(random() * KEN_BURNS_DIRECTIONS.length));
  return { direction: KEN_BURNS_DIRECTIONS[index] };
}

export interface KenBurnsTransform {
  startScale: number;
  endScale: number;
  startTranslateX: number;
  endTranslateX: number;
  startTranslateY: number;
  endTranslateY: number;
}

// CSS keyframe의 from/to translate 부호를 그대로 옮긴 것(단위: PAN_PERCENT 배수).
const DIRECTION_VECTORS: Record<KenBurnsDirection, { fromX: number; fromY: number; toX: number; toY: number }> = {
  tl: { fromX: 1, fromY: 1, toX: -1, toY: -1 },
  tr: { fromX: -1, fromY: 1, toX: 1, toY: -1 },
  bl: { fromX: 1, fromY: -1, toX: -1, toY: 1 },
  br: { fromX: -1, fromY: -1, toX: 1, toY: 1 },
  t: { fromX: 0, fromY: 1, toX: 0, toY: -1 },
  b: { fromX: 0, fromY: -1, toX: 0, toY: 1 },
  l: { fromX: 1, fromY: 0, toX: -1, toY: 0 },
  r: { fromX: -1, fromY: 0, toX: 1, toY: 0 },
};

export function computeKenBurnsTransform(
  spec: KenBurnsSpec,
  containerSize: { width: number; height: number }
): KenBurnsTransform {
  const vector = DIRECTION_VECTORS[spec.direction];
  return {
    startScale: START_SCALE,
    endScale: END_SCALE,
    startTranslateX: vector.fromX * PAN_PERCENT * containerSize.width,
    endTranslateX: vector.toX * PAN_PERCENT * containerSize.width,
    startTranslateY: vector.fromY * PAN_PERCENT * containerSize.height,
    endTranslateY: vector.toY * PAN_PERCENT * containerSize.height,
  };
}
