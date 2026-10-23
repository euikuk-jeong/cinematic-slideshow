import { useRef } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';

import { applyPinchDistanceDelta, type GridColumnRange } from '../settings/albumGridZoom';

function touchDistance(touches: ReadonlyArray<{ pageX: number; pageY: number }>): number {
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * 두 손가락 핀치로 그리드 열 수를 조절하는 PanResponder 핸들러. 한 손가락 스크롤/탭은
 * 가로채지 않는다(터치가 정확히 2개일 때만 capture) — AlbumListScreen의 방식과 동일.
 */
export function usePinchColumns(
  columns: number,
  range: GridColumnRange,
  onChange: (columns: number) => void,
  onCommit: (columns: number) => void
): GestureResponderHandlers {
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const callbacksRef = useRef({ onChange, onCommit, range });
  callbacksRef.current = { onChange, onCommit, range };
  const stateRef = useRef({ lastDistance: 0, accumulated: 0 });

  return useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponderCapture: (evt) => evt.nativeEvent.touches.length === 2,
      onPanResponderGrant: (evt) => {
        stateRef.current = { lastDistance: touchDistance(evt.nativeEvent.touches), accumulated: 0 };
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length !== 2) return;
        const distance = touchDistance(touches);
        const delta = distance - stateRef.current.lastDistance;
        stateRef.current.lastDistance = distance;
        const result = applyPinchDistanceDelta(columnsRef.current, stateRef.current.accumulated + delta, callbacksRef.current.range);
        stateRef.current.accumulated = result.remainder;
        if (result.columns !== columnsRef.current) {
          columnsRef.current = result.columns;
          callbacksRef.current.onChange(result.columns);
        }
      },
      onPanResponderRelease: () => callbacksRef.current.onCommit(columnsRef.current),
      onPanResponderTerminate: () => callbacksRef.current.onCommit(columnsRef.current),
    })
  ).current.panHandlers;
}
