import { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import {
  clampPan,
  clampPanFree,
  doubleTapTargetScale,
  fitSize,
  isZoomed,
  MIN_SCALE,
  nextDoubleTapScale,
  type PinchAnchor,
  pinchStep,
  translateForFocalZoom,
  type Size,
} from '../zoomMath';

const ZOOM_ANIMATION_MS = 200;

export interface ZoomableImageProps {
  /** 제스처/이미지 testID 접두사(페이지별로 유일하게). */
  testIdPrefix: string;
  uri: string;
  /** 원본 이미지 크기(메타데이터). 모르면 null — 더블탭 배율이 폴백(2배)이 된다. */
  imageSize: Size | null;
  viewport: Size;
  /** 현재 보이는 페이지인지. false가 되면 줌 상태를 1배로 리셋한다. */
  active: boolean;
  onZoomChange: (zoomed: boolean) => void;
  onTap: () => void;
  onError: () => void;
}

/**
 * 핀치/더블탭 줌 + 확대 중 팬. 한 번 탭은 onTap으로 올려보낸다(크롬 토글).
 * 확대 중(zoomed)에만 팬 제스처를 켜서, 1배일 때의 가로 스와이프는 상위 페이저가 받는다.
 */
export function ZoomableImage({ testIdPrefix, uri, imageSize, viewport, active, onZoomChange, onTap, onError }: ZoomableImageProps) {
  const scale = useSharedValue(MIN_SCALE);
  const pinchAnchor = useSharedValue<PinchAnchor | null>(null);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  // 팬 제스처는 확대 중에만 켠다 — 1배일 때 한 손가락 가로 드래그를 팬이 가로채면 상위
  // 페이저(FlatList)의 스와이프가 막힌다.
  const [zoomed, setZoomed] = useState(false);
  const handleZoomChange = useCallback(
    (next: boolean) => {
      setZoomed(next);
      onZoomChange(next);
    },
    [onZoomChange]
  );

  const rendered: Size = useMemo(() => (imageSize ? fitSize(viewport, imageSize) : viewport), [imageSize, viewport]);
  const doubleTapTarget = useMemo(() => doubleTapTargetScale(viewport, imageSize), [viewport, imageSize]);

  useEffect(() => {
    if (active) return;
    scale.value = MIN_SCALE;
    pinchAnchor.value = null;
    translateX.value = 0;
    translateY.value = 0;
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
    handleZoomChange(false);
    // active가 바뀔 때만 리셋한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const gesture = useMemo(() => {
    const toCenter = (x: number, y: number) => {
      'worklet';
      return { x: x - viewport.width / 2, y: y - viewport.height / 2 };
    };
    // RNGH 핀치는 손가락을 모두 떼야(ACTION_UP) 끝난다. 하나를 먼저 떼면 핀치가 계속되며 초점이
    // 남은 손가락 위치로 순간 이동하므로, 손가락 수가 바뀔 때마다 기준을 다시 잡는다(pinchStep).
    // 손가락이 하나 남으면 그 손가락을 따라 팬한다(별도 pan 제스처는 두 번째 손가락이 닿을 때 이미 실패함).
    // onStart에서도 기준을 잡아 둬야 첫 onUpdate의 배율 변화가 버려지지 않는다.
    const handlePinch = (e: { focalX: number; focalY: number; scale: number; numberOfPointers: number }) => {
      'worklet';
      const r = pinchStep(
        pinchAnchor.value,
        { scale: scale.value, translate: { x: translateX.value, y: translateY.value } },
        { focal: toCenter(e.focalX, e.focalY), scale: e.scale, pointers: e.numberOfPointers },
        viewport,
        rendered
      );
      pinchAnchor.value = r.anchor;
      if (r.next) {
        scale.value = r.next.scale;
        translateX.value = r.next.translate.x;
        translateY.value = r.next.translate.y;
      }
    };

    const pinch = Gesture.Pinch()
      .withTestId(`${testIdPrefix}-pinch`)
      .onStart((e) => {
        pinchAnchor.value = null;
        handlePinch(e);
      })
      .onUpdate(handlePinch)
      .onEnd(() => {
        if (!isZoomed(scale.value)) {
          scale.value = withTiming(MIN_SCALE, { duration: ZOOM_ANIMATION_MS });
          translateX.value = withTiming(0, { duration: ZOOM_ANIMATION_MS });
          translateY.value = withTiming(0, { duration: ZOOM_ANIMATION_MS });
        }
        runOnJS(handleZoomChange)(isZoomed(scale.value));
      });

    const pan = Gesture.Pan()
      .withTestId(`${testIdPrefix}-pan`)
      .enabled(zoomed)
      .minPointers(1)
      .maxPointers(1)
      .onStart(() => {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      })
      .onUpdate((e) => {
        if (!isZoomed(scale.value)) return;
        const clamped = clampPanFree(
          { x: savedTranslateX.value + e.translationX, y: savedTranslateY.value + e.translationY },
          scale.value,
          viewport,
          rendered
        );
        translateX.value = clamped.x;
        translateY.value = clamped.y;
      });

    const doubleTap = Gesture.Tap()
      .withTestId(`${testIdPrefix}-double-tap`)
      .numberOfTaps(2)
      .onEnd((e) => {
        const target = nextDoubleTapScale(scale.value, doubleTapTarget);
        if (target === MIN_SCALE) {
          scale.value = withTiming(MIN_SCALE, { duration: ZOOM_ANIMATION_MS });
          translateX.value = withTiming(0, { duration: ZOOM_ANIMATION_MS });
          translateY.value = withTiming(0, { duration: ZOOM_ANIMATION_MS });
        } else {
          const focal = toCenter(e.x, e.y);
          const t = clampPan(
            translateForFocalZoom(focal, { x: translateX.value, y: translateY.value }, scale.value, target),
            target,
            viewport,
            rendered
          );
          scale.value = withTiming(target, { duration: ZOOM_ANIMATION_MS });
          translateX.value = withTiming(t.x, { duration: ZOOM_ANIMATION_MS });
          translateY.value = withTiming(t.y, { duration: ZOOM_ANIMATION_MS });
        }
        runOnJS(handleZoomChange)(target !== MIN_SCALE);
      });

    const singleTap = Gesture.Tap()
      .withTestId(`${testIdPrefix}-single-tap`)
      .numberOfTaps(1)
      .requireExternalGestureToFail(doubleTap)
      .onEnd(() => {
        runOnJS(onTap)();
      });

    return Gesture.Race(Gesture.Simultaneous(pinch, pan), Gesture.Exclusive(doubleTap, singleTap));
    // shared value 객체와 콜백은 안정적이라 viewport/rendered/배율/콜백이 바뀔 때만 재생성
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testIdPrefix, viewport, rendered, doubleTapTarget, zoomed, handleZoomChange, onTap]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }, { scale: scale.value }],
  }));

  // 제스처는 transform이 없는 바깥 View에서 받는다 — RNGH는 이벤트 좌표를 붙은 뷰의 transform
  // 역행렬로 변환하므로, 움직이는 뷰에 붙이면 확대 중 초점(focalX/Y)이 화면 좌표가 아니게 된다.
  return (
    <GestureDetector gesture={gesture}>
      <View testID={`${testIdPrefix}-gesture-area`} style={{ width: viewport.width, height: viewport.height }}>
        <Animated.View
          testID={`${testIdPrefix}-content`}
          style={[{ width: viewport.width, height: viewport.height }, animatedStyle]}
        >
          <Image
            testID={`${testIdPrefix}-image`}
            source={{ uri }}
            resizeMode="contain"
            style={StyleSheet.absoluteFill}
            onError={onError}
          />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}
