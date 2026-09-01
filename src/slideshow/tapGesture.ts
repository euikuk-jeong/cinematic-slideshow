/**
 * 슬라이드쇼 재생 화면의 탭 판정 — 짧은 움직임(탭)인지 구분하고, 탭 위치가 화면 좌/중앙/우
 * 중 어디인지에 따라 이전/다음 이동인지 툴바 토글인지 가른다. RN PanResponder의
 * gestureState(dx/dy)와 pageX를 그대로 넘기면 된다.
 */

const TAP_MOVE_THRESHOLD_PX = 15;
const TAP_TIME_THRESHOLD_MS = 300;

/** 탭(짧은 움직임 + 빠른 시간) 여부 */
export function isTap(
  dx: number,
  dy: number,
  dt: number,
  moveThreshold: number = TAP_MOVE_THRESHOLD_PX,
  timeThreshold: number = TAP_TIME_THRESHOLD_MS
): boolean {
  return Math.abs(dx) < moveThreshold && Math.abs(dy) < moveThreshold && dt < timeThreshold;
}

export type TapZone = 'prev' | 'next' | 'toggle';

/** 화면을 좌/중앙/우 3등분해 탭 x좌표가 속한 구역을 판정한다 — 좌/우 가장자리(각 1/3)는
 * 이전/다음 이동, 중앙은 툴바 노출 토글. */
export function resolveTapZone(x: number, screenWidth: number): TapZone {
  if (x < screenWidth / 3) return 'prev';
  if (x > (screenWidth * 2) / 3) return 'next';
  return 'toggle';
}
