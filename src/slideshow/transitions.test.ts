import {
  FLIP_HALF_DURATION_MS,
  getTransitionSpec,
  pickTransitionEffect,
  TRANSITION_DURATION_MS,
  TRANSITION_EFFECTS,
} from './transitions';

describe('pickTransitionEffect', () => {
  test('random()을 9개 효과 중 하나로 매핑한다', () => {
    expect(pickTransitionEffect(() => 0)).toBe('fade');
    expect(pickTransitionEffect(() => 0.99)).toBe('blur');
  });

  test('random()이 1을 반환해도(경계) 범위를 벗어나지 않는다', () => {
    expect(TRANSITION_EFFECTS).toContain(pickTransitionEffect(() => 1));
  });
});

describe('getTransitionSpec', () => {
  test('dissolve는 fade와 동일한 애니메이션이다(LumisShow slideshow.css와 동일)', () => {
    expect(getTransitionSpec('dissolve')).toEqual({ ...getTransitionSpec('fade'), effect: 'dissolve' });
  });

  test('fade — out은 1→0, in은 0→1로 opacity만 바뀐다', () => {
    const spec = getTransitionSpec('fade');
    expect(spec.out.opacity).toEqual([1, 0]);
    expect(spec.in.opacity).toEqual([0, 1]);
    expect(spec.out.translateXPercent).toEqual([0, 0]);
    expect(spec.isFlip).toBe(false);
    expect(spec.usesBlurOverlay).toBe(false);
  });

  test('slide-left — out은 왼쪽 밖으로, in은 오른쪽 밖에서 들어온다', () => {
    const spec = getTransitionSpec('slide-left');
    expect(spec.out.translateXPercent).toEqual([0, -1]);
    expect(spec.in.translateXPercent).toEqual([1, 0]);
  });

  test('zoom-in — in은 0.85배에서 1배로 확대되며 나타난다', () => {
    const spec = getTransitionSpec('zoom-in');
    expect(spec.in.scale).toEqual([0.85, 1]);
    expect(spec.out.opacity).toEqual([1, 0]);
  });

  test('zoom-out — out은 1.15배로 확대되며 사라진다', () => {
    const spec = getTransitionSpec('zoom-out');
    expect(spec.out.scale).toEqual([1, 1.15]);
    expect(spec.in.opacity).toEqual([0, 1]);
  });

  test('flip-h — rotateY만 바뀌고 isFlip이 true다', () => {
    const spec = getTransitionSpec('flip-h');
    expect(spec.out.rotateYDeg).toEqual([0, 90]);
    expect(spec.in.rotateYDeg).toEqual([-90, 0]);
    expect(spec.isFlip).toBe(true);
  });

  test('blur — opacity 크로스페이드 + usesBlurOverlay', () => {
    const spec = getTransitionSpec('blur');
    expect(spec.out.opacity).toEqual([1, 0]);
    expect(spec.in.opacity).toEqual([0, 1]);
    expect(spec.usesBlurOverlay).toBe(true);
  });

  test('모든 효과는 언급되지 않은 속성에서 identity(변화 없음)를 유지한다', () => {
    for (const effect of TRANSITION_EFFECTS) {
      const spec = getTransitionSpec(effect);
      if (!spec.isFlip) {
        expect(spec.out.rotateYDeg).toEqual([0, 0]);
        expect(spec.in.rotateYDeg).toEqual([0, 0]);
      }
    }
  });
});

test('flip 절반 시간은 전체 전환 시간의 절반이다(웹: 0.35s + 0.35s = 0.7s)', () => {
  expect(FLIP_HALF_DURATION_MS * 2).toBe(TRANSITION_DURATION_MS);
  expect(TRANSITION_DURATION_MS).toBe(700);
});
