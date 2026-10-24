import {
  canPage,
  clampPan,
  clampScale,
  doubleTapTargetScale,
  FALLBACK_DOUBLE_TAP_SCALE,
  fitSize,
  MAX_SCALE,
  nextDoubleTapScale,
  translateForFocalZoom,
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
