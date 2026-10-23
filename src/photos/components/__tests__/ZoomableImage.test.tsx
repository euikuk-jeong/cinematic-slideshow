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
