import {
  applyPinchDistanceDelta,
  clampGridColumns,
  DEFAULT_GRID_COLUMNS,
  MAX_GRID_COLUMNS,
  MIN_GRID_COLUMNS,
  parseGridColumns,
  PINCH_STEP_PX,
} from '../albumGridZoom';

describe('clampGridColumns', () => {
  test('범위 안 값은 그대로 반환', () => {
    expect(clampGridColumns(1)).toBe(1);
    expect(clampGridColumns(3)).toBe(3);
    expect(clampGridColumns(4)).toBe(4);
  });

  test('MIN 미만은 MIN으로 clamp', () => {
    expect(clampGridColumns(0)).toBe(MIN_GRID_COLUMNS);
    expect(clampGridColumns(-5)).toBe(MIN_GRID_COLUMNS);
  });

  test('MAX 초과는 MAX로 clamp', () => {
    expect(clampGridColumns(5)).toBe(MAX_GRID_COLUMNS);
    expect(clampGridColumns(100)).toBe(MAX_GRID_COLUMNS);
  });
});

describe('parseGridColumns', () => {
  test('null이면 기본값', () => {
    expect(parseGridColumns(null)).toBe(DEFAULT_GRID_COLUMNS);
  });

  test('빈 문자열이면 기본값', () => {
    expect(parseGridColumns('')).toBe(DEFAULT_GRID_COLUMNS);
  });

  test('숫자가 아니면 기본값', () => {
    expect(parseGridColumns('abc')).toBe(DEFAULT_GRID_COLUMNS);
  });

  test('정수가 아니면 기본값', () => {
    expect(parseGridColumns('2.5')).toBe(DEFAULT_GRID_COLUMNS);
  });

  test('범위 안 정수 문자열은 그대로 반환', () => {
    expect(parseGridColumns('3')).toBe(3);
  });

  test('범위 밖 정수 문자열은 clamp', () => {
    expect(parseGridColumns('9')).toBe(MAX_GRID_COLUMNS);
    expect(parseGridColumns('0')).toBe(MIN_GRID_COLUMNS);
  });
});

describe('applyPinchDistanceDelta', () => {
  test('한 스텝 미만이면 열 수 변화 없이 누적만 됨', () => {
    const result = applyPinchDistanceDelta(2, PINCH_STEP_PX - 1);
    expect(result).toEqual({ columns: 2, remainder: PINCH_STEP_PX - 1 });
  });

  test('손가락을 벌리면(양수 delta) 열 수가 줄어든다', () => {
    const result = applyPinchDistanceDelta(3, PINCH_STEP_PX);
    expect(result).toEqual({ columns: 2, remainder: 0 });
  });

  test('손가락을 오므리면(음수 delta) 열 수가 늘어난다', () => {
    const result = applyPinchDistanceDelta(2, -PINCH_STEP_PX);
    expect(result).toEqual({ columns: 3, remainder: 0 });
  });

  test('여러 스텝이 한 번에 누적되면 그만큼 열 수가 변한다', () => {
    const result = applyPinchDistanceDelta(4, PINCH_STEP_PX * 2 + 10);
    expect(result).toEqual({ columns: 2, remainder: 10 });
  });

  test('MIN에서 더 벌려도 MIN 아래로 내려가지 않는다', () => {
    const result = applyPinchDistanceDelta(1, PINCH_STEP_PX * 5);
    expect(result.columns).toBe(MIN_GRID_COLUMNS);
  });

  test('MAX에서 더 오므려도 MAX 위로 올라가지 않는다', () => {
    const result = applyPinchDistanceDelta(4, -PINCH_STEP_PX * 5);
    expect(result.columns).toBe(MAX_GRID_COLUMNS);
  });
});
