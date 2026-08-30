/**
 * 슬라이드쇼 재생 화면의 탭(툴바 노출 토글)/스와이프(이전·다음) 판정 — LumisShow 웹 버전
 * (frontend/assets/js/touch-gesture.js)의 isTap/resolveSwipeDirection과 동일한 임계값을
 * 그대로 이식한 순수 함수. RN PanResponder의 gestureState(dx/dy)를 그대로 넘기면 된다.
 */

export const SWIPE_THRESHOLD_PX = 50;
const TAP_MOVE_THRESHOLD_PX = 15;
const TAP_TIME_THRESHOLD_MS = 300;

/** 좌우 스와이프 방향 판정. 1 = 다음, -1 = 이전, 0 = 스와이프로 인정하지 않음(무시) */
export function resolveSwipeDirection(dx: number, dy: number, threshold: number = SWIPE_THRESHOLD_PX): 1 | -1 | 0 {
  if (Math.abs(dx) <= threshold) return 0;
  if (Math.abs(dx) <= Math.abs(dy)) return 0;
  return dx < 0 ? 1 : -1;
}

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
