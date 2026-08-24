export const MIN_GRID_COLUMNS = 1;
export const MAX_GRID_COLUMNS = 4;
export const DEFAULT_GRID_COLUMNS = 2;

export const GRID_COLUMNS_STORAGE_KEY = 'album_list_grid_columns';

/** 손가락 사이 거리가 이만큼(px) 바뀔 때마다 열 수를 1씩 조정한다. */
export const PINCH_STEP_PX = 40;

export function clampGridColumns(value: number): number {
  return Math.min(MAX_GRID_COLUMNS, Math.max(MIN_GRID_COLUMNS, value));
}

export function parseGridColumns(raw: string | null): number {
  if (!raw) return DEFAULT_GRID_COLUMNS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return DEFAULT_GRID_COLUMNS;
  return clampGridColumns(parsed);
}

export interface PinchStepResult {
  columns: number;
  /** 다음 move 이벤트에 이어서 누적할, 아직 한 스텝(PINCH_STEP_PX)에 못 미친 나머지 거리 */
  remainder: number;
}

/**
 * 손가락 사이 거리 누적 변화량(accumulatedDeltaPx)을 열 수 변화로 변환한다.
 * 거리가 늘어남(손가락 벌림) = 확대 = 열 수 감소, 거리가 줄어듦(오므림) = 축소 = 열 수 증가.
 */
export function applyPinchDistanceDelta(currentColumns: number, accumulatedDeltaPx: number): PinchStepResult {
  const steps = Math.trunc(accumulatedDeltaPx / PINCH_STEP_PX);
  if (steps === 0) {
    return { columns: currentColumns, remainder: accumulatedDeltaPx };
  }
  return {
    columns: clampGridColumns(currentColumns - steps),
    remainder: accumulatedDeltaPx - steps * PINCH_STEP_PX,
  };
}
