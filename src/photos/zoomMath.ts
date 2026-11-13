export const MIN_SCALE = 1;
export const MAX_SCALE = 10;
/** 이미지 크기를 모르거나 화면과 비율이 같아 계산 배율이 1일 때 쓰는 더블탭 배율. */
export const FALLBACK_DOUBLE_TAP_SCALE = 2;
/** 1배로 간주하는 허용 오차(부동소수 오차로 페이징이 잠기는 것을 막는다). */
export const SCALE_EPSILON = 0.01;

export interface Size {
  width: number;
  height: number;
}

export function clampScale(scale: number): number {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/** 컨테이너 안에 비율을 유지하며 들어가는(contain) 이미지의 렌더 크기. */
export function fitSize(container: Size, image: Size): Size {
  'worklet';
  const ratio = Math.min(container.width / image.width, container.height / image.height);
  return { width: image.width * ratio, height: image.height * ratio };
}

/**
 * 더블탭 목표 배율: 화면을 꽉 채우는 배율(contain 렌더 크기 기준)을 이미지 비율로 계산한다.
 * 크기를 모르거나(null) 계산 결과가 사실상 1배면 FALLBACK_DOUBLE_TAP_SCALE.
 */
export function doubleTapTargetScale(container: Size, image: Size | null): number {
  'worklet';
  if (!image || image.width <= 0 || image.height <= 0) return FALLBACK_DOUBLE_TAP_SCALE;
  const rendered = fitSize(container, image);
  const fill = Math.max(container.width / rendered.width, container.height / rendered.height);
  if (fill <= MIN_SCALE + SCALE_EPSILON) return FALLBACK_DOUBLE_TAP_SCALE;
  return clampScale(fill);
}

/** 확대 중이면 1배로 복귀, 아니면 목표 배율. */
export function nextDoubleTapScale(currentScale: number, targetScale: number): number {
  'worklet';
  return currentScale > MIN_SCALE + SCALE_EPSILON ? MIN_SCALE : targetScale;
}

export function isZoomed(scale: number): boolean {
  'worklet';
  return scale > MIN_SCALE + SCALE_EPSILON;
}

/** 확대 중에는 페이징을 비활성화한다(확대 중 가로 드래그는 팬). */
export function canPage(scale: number): boolean {
  'worklet';
  return !isZoomed(scale);
}

/**
 * 팬 이동량 clamp. 배율×렌더 크기가 화면보다 작은 축은 중앙에 고정(0)한다.
 * 축별 허용 범위 = max(0, (렌더 크기 × scale − 컨테이너 크기) / 2).
 */
export function clampPan(
  translate: { x: number; y: number },
  scale: number,
  container: Size,
  rendered: Size
): { x: number; y: number } {
  'worklet';
  const maxX = Math.max(0, (rendered.width * scale - container.width) / 2);
  const maxY = Math.max(0, (rendered.height * scale - container.height) / 2);
  return {
    // `|| 0`: 한 축이 중앙 고정(max=0)일 때 -0이 나오는 것을 0으로 정규화한다.
    x: Math.min(maxX, Math.max(-maxX, translate.x)) || 0,
    y: Math.min(maxY, Math.max(-maxY, translate.y)) || 0,
  };
}

/**
 * 컨테이너 중심 기준 좌표계에서, focal 점이 화면상 같은 위치에 머물도록 배율을 바꿀 때의
 * 새 이동량: t1 = f − (f − t0) × (s1 / s0).
 */
export function translateForFocalZoom(
  focal: { x: number; y: number },
  translate: { x: number; y: number },
  fromScale: number,
  toScale: number
): { x: number; y: number } {
  'worklet';
  // translateForPinch(focal, focal, ...)와 같지만, worklet 변환된 함수는 호이스팅되지 않아 직접 계산한다.
  const k = toScale / fromScale;
  return { x: focal.x - (focal.x - translate.x) * k, y: focal.y - (focal.y - translate.y) * k };
}

/**
 * 핀치 이동량: 시작 시점 초점(startFocal) 아래에 있던 이미지 지점을 현재 초점(focal) 아래로 옮긴다.
 * t1 = f − (f0 − t0) × (s1 / s0). 두 손가락을 함께 움직이면 이미지가 손가락을 따라간다.
 * (startFocal = focal이면 translateForFocalZoom과 같다.)
 */
export function translateForPinch(
  startFocal: { x: number; y: number },
  focal: { x: number; y: number },
  startTranslate: { x: number; y: number },
  startScale: number,
  scale: number
): { x: number; y: number } {
  'worklet';
  const k = scale / startScale;
  return {
    x: focal.x - (startFocal.x - startTranslate.x) * k,
    y: focal.y - (startFocal.y - startTranslate.y) * k,
  };
}

/**
 * 핀치 기준점. 손가락 수가 바뀌면 초점(손가락 평균 위치)이 순간 이동하므로, 그때마다 현재 상태로
 * 기준을 다시 잡아야 이미지가 튀지 않는다(SubsamplingScaleImageView의 ACTION_POINTER_UP 처리와 같은 목적).
 * gestureScale: 기준을 잡은 시점의 제스처 누적 배율(e.scale) — 이후 배율 변화는 이 값에 대한 비율로 계산.
 */
export interface PinchAnchor {
  scale: number;
  translate: { x: number; y: number };
  focal: { x: number; y: number };
  gestureScale: number;
  pointers: number;
}

/** 이 이벤트에서 기준을 (다시) 잡아야 하는지. 손가락 2개 미만은 기준을 잡지 않는다(이동 생략). */
export function needsPinchRebase(anchor: PinchAnchor | null, pointers: number): boolean {
  'worklet';
  return pointers >= 2 && (anchor === null || anchor.pointers !== pointers);
}

/** 기준점 기준으로 현재 핀치 이벤트의 배율·이동량(경계 clamp 포함). */
export function pinchTransform(
  anchor: PinchAnchor,
  focal: { x: number; y: number },
  gestureScale: number,
  container: Size,
  rendered: Size
): { scale: number; translate: { x: number; y: number } } {
  'worklet';
  const scale = clampScale(anchor.scale * (gestureScale / anchor.gestureScale));
  const t = translateForPinch(anchor.focal, focal, anchor.translate, anchor.scale, scale);
  return { scale, translate: clampPan(t, scale, container, rendered) };
}

/**
 * 핀치 이벤트 하나를 처리한다(onStart·onUpdate 공용).
 * - 손가락 2개 미만: 기준을 버리고 이동하지 않는다(next=null).
 * - 첫 이벤트이거나 손가락 수가 바뀌면 현재 상태로 기준을 다시 잡는다(이 이벤트에서는 움직이지 않음).
 */
export function pinchStep(
  anchor: PinchAnchor | null,
  current: { scale: number; translate: { x: number; y: number } },
  event: { focal: { x: number; y: number }; scale: number; pointers: number },
  container: Size,
  rendered: Size
): { anchor: PinchAnchor | null; next: { scale: number; translate: { x: number; y: number } } | null } {
  'worklet';
  if (event.pointers < 2) return { anchor: null, next: null };
  const a: PinchAnchor =
    anchor !== null && !needsPinchRebase(anchor, event.pointers)
      ? anchor
      : {
          scale: current.scale,
          translate: current.translate,
          focal: event.focal,
          gestureScale: event.scale,
          pointers: event.pointers,
        };
  return { anchor: a, next: pinchTransform(a, event.focal, event.scale, container, rendered) };
}
