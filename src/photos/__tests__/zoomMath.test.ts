import {
  canPage,
  clampPan,
  clampPanFree,
  clampScale,
  doubleTapTargetScale,
  FALLBACK_DOUBLE_TAP_SCALE,
  fitSize,
  MAX_SCALE,
  needsPinchRebase,
  nextDoubleTapScale,
  type PinchAnchor,
  pinchStep,
  pinchTransform,
  translateForFocalZoom,
  translateForPinch,
} from '../zoomMath';

const screen = { width: 1080, height: 1920 };

describe('clampScale', () => {
  it('floors at 1', () => expect(clampScale(0.5)).toBe(1));
  it('caps at MAX_SCALE', () => expect(clampScale(15)).toBe(MAX_SCALE));
  it('keeps values in range', () => expect(clampScale(2.5)).toBe(2.5));
  it('MAX_SCALE is 10', () => expect(MAX_SCALE).toBe(10));
});

describe('fitSize', () => {
  it('fits a landscape image by width', () => {
    expect(fitSize(screen, { width: 4000, height: 3000 })).toEqual({ width: 1080, height: 810 });
  });
});

describe('doubleTapTargetScale', () => {
  it('fills the screen height for a landscape photo on a portrait screen', () => {
    expect(doubleTapTargetScale(screen, { width: 4000, height: 3000 })).toBeCloseTo(1920 / 810, 5);
  });

  it('fills the screen height for a 3:4 portrait photo (width already fits)', () => {
    expect(doubleTapTargetScale(screen, { width: 3000, height: 4000 })).toBeCloseTo(1920 / 1440, 5);
  });

  it('falls back to 2 when the image ratio equals the screen ratio', () => {
    expect(doubleTapTargetScale(screen, { width: 1080, height: 1920 })).toBe(FALLBACK_DOUBLE_TAP_SCALE);
  });

  it('falls back to 2 when the image size is unknown', () => {
    expect(doubleTapTargetScale(screen, null)).toBe(FALLBACK_DOUBLE_TAP_SCALE);
  });

  it('clamps an extreme panorama to MAX_SCALE', () => {
    expect(doubleTapTargetScale(screen, { width: 20000, height: 500 })).toBe(MAX_SCALE);
  });
});

describe('nextDoubleTapScale', () => {
  it('zooms to the target from 1x', () => expect(nextDoubleTapScale(1, 2.37)).toBe(2.37));
  it('returns to 1x when already zoomed', () => expect(nextDoubleTapScale(2.37, 2.37)).toBe(1));
});

describe('clampPan', () => {
  it('forbids panning at 1x for a screen-filling image', () => {
    expect(clampPan({ x: 50, y: -50 }, 1, screen, screen)).toEqual({ x: 0, y: 0 });
  });

  it('limits to half of the overflow when the image fills the screen', () => {
    const container = { width: 1000, height: 2000 };
    expect(clampPan({ x: 5000, y: -5000 }, 3, container, container)).toEqual({ x: 1000, y: -2000 });
  });

  it('keeps an axis centered when the zoomed render is smaller than the screen', () => {
    const rendered = { width: 1080, height: 810 };
    const result = clampPan({ x: 999, y: 999 }, 1.5, screen, rendered);
    expect(result.y).toBe(0);
    expect(result.x).toBe(270);
  });

  it('does not move values already inside the limits', () => {
    expect(clampPan({ x: 10, y: 20 }, 3, screen, screen)).toEqual({ x: 10, y: 20 });
  });
});

describe('translateForFocalZoom', () => {
  it('keeps the focal point at the same screen position', () => {
    const focal = { x: 200, y: -100 };
    const t0 = { x: 30, y: 10 };
    const s0 = 2;
    const s1 = 4;
    const t1 = translateForFocalZoom(focal, t0, s0, s1);
    // 이미지 좌표 p (중심 기준): screen = p * s + t. focal이 가리키는 p는 줌 전후 동일해야 한다.
    const p = { x: (focal.x - t0.x) / s0, y: (focal.y - t0.y) / s0 };
    expect(p.x * s1 + t1.x).toBeCloseTo(focal.x, 5);
    expect(p.y * s1 + t1.y).toBeCloseTo(focal.y, 5);
  });

  it('leaves the translate unchanged when the scale does not change', () => {
    expect(translateForFocalZoom({ x: 5, y: 5 }, { x: 1, y: 2 }, 2, 2)).toEqual({ x: 1, y: 2 });
  });
});

describe('canPage', () => {
  it('allows paging at 1x', () => expect(canPage(1)).toBe(true));
  it('blocks paging when zoomed', () => expect(canPage(1.5)).toBe(false));
  it('does not lock paging because of float noise just above 1', () => expect(canPage(1.0001)).toBe(true));
});

describe('translateForPinch', () => {
  it('moves the image point under the start focal to the current focal', () => {
    const f0 = { x: 100, y: 50 };
    const f1 = { x: 160, y: 20 };
    const t0 = { x: 10, y: -5 };
    const t1 = translateForPinch(f0, f1, t0, 2, 3);
    const p = { x: (f0.x - t0.x) / 2, y: (f0.y - t0.y) / 2 };
    expect(p.x * 3 + t1.x).toBeCloseTo(f1.x, 5);
    expect(p.y * 3 + t1.y).toBeCloseTo(f1.y, 5);
  });

  it('follows the fingers when they move together without scaling', () => {
    expect(translateForPinch({ x: 0, y: 0 }, { x: 30, y: -10 }, { x: 5, y: 5 }, 2, 2)).toEqual({ x: 35, y: -5 });
  });

  it('equals translateForFocalZoom when the focal does not move', () => {
    const f = { x: 200, y: -100 };
    expect(translateForPinch(f, f, { x: 30, y: 10 }, 2, 4)).toEqual(translateForFocalZoom(f, { x: 30, y: 10 }, 2, 4));
  });
});

describe('needsPinchRebase', () => {
  const anchor: PinchAnchor = { scale: 2, translate: { x: 0, y: 0 }, focal: { x: 0, y: 0 }, gestureScale: 1, pointers: 2 };
  it('rebases on the first two-finger event', () => expect(needsPinchRebase(null, 2)).toBe(true));
  it('keeps the anchor while the finger count is unchanged', () => expect(needsPinchRebase(anchor, 2)).toBe(false));
  it('rebases when a third finger joins', () => expect(needsPinchRebase(anchor, 3)).toBe(true));
  it('rebases when one finger lifts (the remaining finger pans)', () => {
    expect(needsPinchRebase(anchor, 1)).toBe(true);
    expect(needsPinchRebase(null, 1)).toBe(true);
  });
  it('never anchors with no fingers', () => expect(needsPinchRebase(null, 0)).toBe(false));
});

describe('pinchTransform', () => {
  const big = { width: 100000, height: 100000 };

  it('scales relative to the gesture scale captured at the anchor', () => {
    const anchor: PinchAnchor = { scale: 2, translate: { x: 0, y: 0 }, focal: { x: 0, y: 0 }, gestureScale: 1.5, pointers: 2 };
    expect(pinchTransform(anchor, { x: 0, y: 0 }, 3, screen, big).scale).toBeCloseTo(4, 5);
  });

  it('does not move the image on the anchoring event itself', () => {
    const anchor: PinchAnchor = { scale: 3, translate: { x: 120, y: -40 }, focal: { x: -100, y: 0 }, gestureScale: 2.7, pointers: 2 };
    expect(pinchTransform(anchor, anchor.focal, anchor.gestureScale, screen, big)).toEqual({
      scale: 3,
      translate: { x: 120, y: -40 },
    });
  });

  it('clamps scale and keeps part of the photo on screen', () => {
    const anchor: PinchAnchor = { scale: 1, translate: { x: 0, y: 0 }, focal: { x: 0, y: 0 }, gestureScale: 1, pointers: 2 };
    const r = pinchTransform(anchor, { x: 50000, y: 0 }, 50, screen, screen);
    expect(r.scale).toBe(10);
    // 화면 절반 + 사진 절반 − 화면의 1/4
    expect(r.translate.x).toBe(540 + 5400 - 270);
  });

  it('does not lock the smaller axis to the center (landscape photo follows the fingers vertically)', () => {
    const landscape = { width: 1080, height: 810 };
    const anchor: PinchAnchor = { scale: 1, translate: { x: 0, y: 0 }, focal: { x: 0, y: -300 }, gestureScale: 1, pointers: 2 };
    // 1.5배: 확대된 높이 1215 < 화면 1920 — 예전 clampPan이면 y가 0으로 고정됐다.
    const r = pinchTransform(anchor, { x: 0, y: -300 }, 1.5, screen, landscape);
    expect(r.translate.y).toBeCloseTo(-300 - (-300 - 0) * 1.5, 5);
  });
});

describe('clampPanFree', () => {
  const landscape = { width: 1080, height: 810 };

  it('lets the smaller axis move freely inside the screen', () => {
    expect(clampPanFree({ x: 0, y: 400 }, 1.5, screen, landscape)).toEqual({ x: 0, y: 400 });
  });

  it('keeps at least a quarter of the smaller of photo/screen visible', () => {
    // y: 확대 높이 1215, 화면 1920 → 960 + 607.5 − 1215×0.25 = 1263.75
    expect(clampPanFree({ x: 0, y: 99999 }, 1.5, screen, landscape).y).toBeCloseTo(1263.75, 5);
    expect(clampPanFree({ x: 0, y: -99999 }, 1.5, screen, landscape).y).toBeCloseTo(-1263.75, 5);
    // x: 확대 폭 1620 > 화면 1080 → 540 + 810 − 1080×0.25 = 1080
    expect(clampPanFree({ x: 99999, y: 0 }, 1.5, screen, landscape).x).toBeCloseTo(1080, 5);
  });

  it('allows moving past the edge where clampPan stopped', () => {
    const strict = clampPan({ x: 99999, y: 0 }, 3, screen, screen);
    const free = clampPanFree({ x: 99999, y: 0 }, 3, screen, screen);
    expect(free.x).toBeGreaterThan(strict.x);
  });
});

describe('pinchStep', () => {
  const big = { width: 100000, height: 100000 };
  type State = { scale: number; translate: { x: number; y: number } };
  type Ev = { focal: { x: number; y: number }; scale: number; pointers: number };

  /** 컴포넌트의 onStart(기준 초기화)+onUpdate 흐름을 이벤트 순서대로 재현한다. */
  function run(events: Ev[], initial: State = { scale: 1, translate: { x: 0, y: 0 } }): State[] {
    let anchor: PinchAnchor | null = null;
    let state = initial;
    const history: State[] = [];
    for (const e of events) {
      const r = pinchStep(anchor, state, e, screen, big);
      anchor = r.anchor;
      if (r.next) state = r.next;
      history.push(state);
    }
    return history;
  }

  it('regression: lifting one finger first does not jump (old code jumped +200px), then the remaining finger pans 1:1', () => {
    // 중앙(±100px) 핀치로 3배 → 오른쪽 손가락을 떼면 RNGH는 핀치를 끝내지 않고 초점을 −100(남은 손가락)으로 보낸다.
    const history = run([
      { focal: { x: 0, y: 0 }, scale: 1, pointers: 2 },
      { focal: { x: 0, y: 0 }, scale: 3, pointers: 2 },
      { focal: { x: -100, y: 0 }, scale: 3, pointers: 1 },
      { focal: { x: -95, y: 3 }, scale: 3, pointers: 1 },
    ]);
    const beforeLift = history[1];
    expect(beforeLift).toEqual({ scale: 3, translate: { x: 0, y: 0 } });
    // 손가락을 떼는 이벤트에서는 움직이지 않는다.
    expect(history[2]).toEqual(beforeLift);
    // 남은 손가락이 (5, 3) 움직이면 사진도 정확히 (5, 3) 움직인다.
    expect(history[3].scale).toBe(3);
    expect(history[3].translate.x).toBeCloseTo(5, 5);
    expect(history[3].translate.y).toBeCloseTo(3, 5);
    // 옛 계산(매 프레임 현재 초점 기준)이었다면 +200px 이동했다.
    expect(translateForFocalZoom({ x: -100, y: 0 }, { x: 0, y: 0 }, 1, 3).x).toBe(200);
  });

  it('putting the finger back down rebases instead of jumping, then keeps pinching from there', () => {
    const history = run([
      { focal: { x: 0, y: 0 }, scale: 1, pointers: 2 },
      { focal: { x: 0, y: 0 }, scale: 3, pointers: 2 },
      { focal: { x: -100, y: 0 }, scale: 3, pointers: 1 },
      // 다시 두 손가락 — 새 ScaleGestureDetector 세션이라 누적 배율·초점이 달라져도 튀지 않아야 한다.
      { focal: { x: 50, y: 20 }, scale: 1.2, pointers: 2 },
      { focal: { x: 50, y: 20 }, scale: 2.4, pointers: 2 },
    ]);
    expect(history[3]).toEqual(history[1]);
    expect(history[4].scale).toBeCloseTo(6, 5);
    // 새 초점(50,20) 아래의 이미지 지점이 그대로 고정된다.
    const p = { x: (50 - 0) / 3, y: (20 - 0) / 3 };
    expect(p.x * 6 + history[4].translate.x).toBeCloseTo(50, 5);
    expect(p.y * 6 + history[4].translate.y).toBeCloseTo(20, 5);
  });

  it('a third finger joining rebases without a jump', () => {
    const history = run([
      { focal: { x: 0, y: 0 }, scale: 1, pointers: 2 },
      { focal: { x: 0, y: 0 }, scale: 2, pointers: 2 },
      { focal: { x: 80, y: 80 }, scale: 2, pointers: 3 },
    ]);
    expect(history[2]).toEqual(history[1]);
  });

  it('starting while already zoomed keeps the point under the fingers', () => {
    const history = run(
      [
        { focal: { x: 200, y: 100 }, scale: 1, pointers: 2 },
        { focal: { x: 200, y: 100 }, scale: 1.5, pointers: 2 },
      ],
      { scale: 2, translate: { x: -300, y: 40 } }
    );
    const p = { x: (200 - -300) / 2, y: (100 - 40) / 2 };
    expect(history[1].scale).toBeCloseTo(3, 5);
    expect(p.x * 3 + history[1].translate.x).toBeCloseTo(200, 5);
    expect(p.y * 3 + history[1].translate.y).toBeCloseTo(100, 5);
  });

  it('two fingers moving together pan the image with them', () => {
    const history = run(
      [
        { focal: { x: 0, y: 0 }, scale: 1, pointers: 2 },
        { focal: { x: 40, y: -30 }, scale: 1, pointers: 2 },
      ],
      { scale: 3, translate: { x: 0, y: 0 } }
    );
    expect(history[1].translate).toEqual({ x: 40, y: -30 });
  });
});
