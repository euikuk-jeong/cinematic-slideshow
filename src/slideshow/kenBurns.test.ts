import { computeKenBurnsTransform, generateKenBurnsSpec } from './kenBurns';

describe('generateKenBurnsSpec', () => {
  test('random() < 0.5면 줌인, 아니면 줌아웃', () => {
    expect(generateKenBurnsSpec(() => 0.1).zoomIn).toBe(true);
    expect(generateKenBurnsSpec(() => 0.9).zoomIn).toBe(false);
  });

  test('panAngleRad는 random() * 2PI', () => {
    expect(generateKenBurnsSpec(() => 0.25).panAngleRad).toBeCloseTo(Math.PI / 2);
  });
});

describe('computeKenBurnsTransform', () => {
  const containerSize = { width: 1000, height: 2000 };

  test('줌인이면 1에서 확대율까지, 줌아웃이면 그 반대', () => {
    const zoomIn = computeKenBurnsTransform({ zoomIn: true, panAngleRad: 0 }, containerSize);
    expect(zoomIn.startScale).toBe(1);
    expect(zoomIn.endScale).toBeGreaterThan(1);

    const zoomOut = computeKenBurnsTransform({ zoomIn: false, panAngleRad: 0 }, containerSize);
    expect(zoomOut.startScale).toBeGreaterThan(1);
    expect(zoomOut.endScale).toBe(1);
  });

  test('팬 이동량은 확대율이 만드는 여유 공간보다 작다(가장자리 노출 방지)', () => {
    // 가장 큰 팬이 나오는 각도(0, 수평 방향)에서도 편도 이동량이 확대 여유(scale-1)/2의
    // 절반보다 훨씬 작아야 한다.
    const t = computeKenBurnsTransform({ zoomIn: true, panAngleRad: 0 }, containerSize);
    const maxSafeOffset = ((t.endScale - 1) / 2) * containerSize.width;
    expect(Math.abs(t.endTranslateX)).toBeLessThan(maxSafeOffset);
    expect(t.startTranslateY).toBeCloseTo(0);
    expect(t.endTranslateY).toBeCloseTo(0);
  });

  test('start/end translate는 대칭(중심 기준 반대 방향)이다', () => {
    const t = computeKenBurnsTransform({ zoomIn: true, panAngleRad: Math.PI / 4 }, containerSize);
    expect(t.startTranslateX).toBeCloseTo(-t.endTranslateX);
    expect(t.startTranslateY).toBeCloseTo(-t.endTranslateY);
  });
});
