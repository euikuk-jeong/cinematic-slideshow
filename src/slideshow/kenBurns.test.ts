import { computeKenBurnsTransform, generateKenBurnsSpec, KEN_BURNS_DIRECTIONS } from './kenBurns';

describe('generateKenBurnsSpec', () => {
  test('random()을 8방향 중 하나로 매핑한다', () => {
    expect(generateKenBurnsSpec(() => 0).direction).toBe('tl');
    expect(generateKenBurnsSpec(() => 0.99).direction).toBe('r');
  });

  test('random()이 1을 반환해도(경계) 범위를 벗어나지 않는다', () => {
    expect(KEN_BURNS_DIRECTIONS).toContain(generateKenBurnsSpec(() => 1).direction);
  });
});

describe('computeKenBurnsTransform', () => {
  const containerSize = { width: 1000, height: 2000 };

  test('항상 확대(1.08 → 1.15)만 한다 — 줌아웃 없음', () => {
    for (const direction of KEN_BURNS_DIRECTIONS) {
      const t = computeKenBurnsTransform({ direction }, containerSize);
      expect(t.startScale).toBe(1.08);
      expect(t.endScale).toBe(1.15);
    }
  });

  test('대각선 방향(tl)은 화면 크기의 3%만큼 반대 방향으로 이동한다', () => {
    const t = computeKenBurnsTransform({ direction: 'tl' }, containerSize);
    expect(t.startTranslateX).toBeCloseTo(30);
    expect(t.startTranslateY).toBeCloseTo(60);
    expect(t.endTranslateX).toBeCloseTo(-30);
    expect(t.endTranslateY).toBeCloseTo(-60);
  });

  test('수직 방향(t)은 X축 이동이 없다', () => {
    const t = computeKenBurnsTransform({ direction: 't' }, containerSize);
    expect(t.startTranslateX).toBe(0);
    expect(t.endTranslateX).toBe(0);
    expect(t.startTranslateY).toBeCloseTo(60);
    expect(t.endTranslateY).toBeCloseTo(-60);
  });

  test('수평 방향(r)은 Y축 이동이 없다', () => {
    const t = computeKenBurnsTransform({ direction: 'r' }, containerSize);
    expect(t.startTranslateY).toBe(0);
    expect(t.endTranslateY).toBe(0);
    expect(t.startTranslateX).toBeCloseTo(-30);
    expect(t.endTranslateX).toBeCloseTo(30);
  });
});
