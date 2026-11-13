import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { ZoomableImage } from '../ZoomableImage';

const viewport = { width: 1080, height: 1920 };

async function renderImage(overrides: Partial<React.ComponentProps<typeof ZoomableImage>> = {}) {
  const onZoomChange = jest.fn();
  const onTap = jest.fn();
  const onError = jest.fn();
  const view = await render(
    <ZoomableImage
      testIdPrefix="z"
      uri="file:///a.jpg"
      imageSize={{ width: 4000, height: 3000 }}
      viewport={viewport}
      active
      onZoomChange={onZoomChange}
      onTap={onTap}
      onError={onError}
      {...overrides}
    />
  );
  return { view, onZoomChange, onTap, onError };
}

test('더블탭하면 확대 상태가 되고, 한 번 더 더블탭하면 1배로 돌아온다', async () => {
  const { onZoomChange } = await renderImage();
  await act(async () => {
    fireGestureHandler(getByGestureTestId('z-double-tap'), [{ state: 5, x: 540, y: 960 }]);
  });
  await waitFor(() => expect(onZoomChange).toHaveBeenLastCalledWith(true));
  await act(async () => {
    fireGestureHandler(getByGestureTestId('z-double-tap'), [{ state: 5, x: 540, y: 960 }]);
  });
  await waitFor(() => expect(onZoomChange).toHaveBeenLastCalledWith(false));
});

test('한 번 탭은 onTap으로 전달되고 확대 상태는 바뀌지 않는다', async () => {
  const { onTap, onZoomChange } = await renderImage();
  await act(async () => {
    fireGestureHandler(getByGestureTestId('z-single-tap'), [{ state: 5 }]);
  });
  await waitFor(() => expect(onTap).toHaveBeenCalledTimes(1));
  expect(onZoomChange).not.toHaveBeenCalledWith(true);
});

test('이미지 크기를 몰라도(null) 더블탭 확대가 동작한다(폴백 배율)', async () => {
  const { onZoomChange } = await renderImage({ imageSize: null });
  await act(async () => {
    fireGestureHandler(getByGestureTestId('z-double-tap'), [{ state: 5, x: 100, y: 100 }]);
  });
  await waitFor(() => expect(onZoomChange).toHaveBeenLastCalledWith(true));
});

test('이미지 로드 오류가 onError로 전달된다', async () => {
  const { view, onError } = await renderImage();
  await fireEvent(view.getByTestId('z-image'), 'error');
  expect(onError).toHaveBeenCalledTimes(1);
});

test('active가 false가 되면 확대 상태를 해제한다', async () => {
  const { view, onZoomChange } = await renderImage();
  await act(async () => {
    fireGestureHandler(getByGestureTestId('z-double-tap'), [{ state: 5, x: 540, y: 960 }]);
  });
  await waitFor(() => expect(onZoomChange).toHaveBeenLastCalledWith(true));
  await view.rerender(
    <ZoomableImage
      testIdPrefix="z"
      uri="file:///a.jpg"
      imageSize={{ width: 4000, height: 3000 }}
      viewport={viewport}
      active={false}
      onZoomChange={onZoomChange}
      onTap={jest.fn()}
      onError={jest.fn()}
    />
  );
  await waitFor(() => expect(onZoomChange).toHaveBeenLastCalledWith(false));
});

test('제스처는 transform이 없는 바깥 View에서 받고, transform은 안쪽 콘텐츠에만 건다', async () => {
  const { view } = await renderImage();
  const outer = view.getByTestId('z-gesture-area');
  expect(JSON.stringify(outer.props.style)).not.toContain('transform');
  expect(JSON.stringify(view.getByTestId('z-content').props.style)).toContain('transform');
});

test('두 손가락 핀치로 확대하면 확대 상태가 된다', async () => {
  const { onZoomChange } = await renderImage();
  await act(async () => {
    fireGestureHandler(getByGestureTestId('z-pinch'), [
      { state: 2, numberOfPointers: 2, scale: 1, focalX: 540, focalY: 960 },
      { state: 4, numberOfPointers: 2, scale: 1, focalX: 540, focalY: 960 },
      { state: 4, numberOfPointers: 2, scale: 3, focalX: 540, focalY: 960 },
      { state: 5, numberOfPointers: 2, scale: 3, focalX: 540, focalY: 960 },
    ]);
  });
  await waitFor(() => expect(onZoomChange).toHaveBeenLastCalledWith(true));
});

test('핀치 중 손가락 하나를 먼저 떼도(1개 이벤트) 확대 상태가 유지된다', async () => {
  const { onZoomChange } = await renderImage();
  await act(async () => {
    fireGestureHandler(getByGestureTestId('z-pinch'), [
      { state: 2, numberOfPointers: 2, scale: 1, focalX: 540, focalY: 960 },
      { state: 4, numberOfPointers: 2, scale: 1, focalX: 540, focalY: 960 },
      { state: 4, numberOfPointers: 2, scale: 3, focalX: 540, focalY: 960 },
      { state: 4, numberOfPointers: 1, scale: 3, focalX: 440, focalY: 960 },
      { state: 5, numberOfPointers: 1, scale: 3, focalX: 440, focalY: 960 },
    ]);
  });
  await waitFor(() => expect(onZoomChange).toHaveBeenLastCalledWith(true));
});
