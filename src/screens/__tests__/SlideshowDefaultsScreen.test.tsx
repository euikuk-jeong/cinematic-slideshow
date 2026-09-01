import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SlideshowDefaultsScreen } from '../SlideshowDefaultsScreen';
import * as db from '../../db/client';

// automock은 실제 모듈을 먼저 require해 형태를 추론하려다 expo-sqlite(네이티브 모듈) 로드
// 실패로 깨지므로 factory로 직접 mock 함수를 제공한다(AlbumSettingsScreen.test.tsx와 동일 패턴).
jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));

const mockedDb = db as jest.Mocked<typeof db>;

function mockNoStoredDefaults() {
  mockedDb.getAppSetting.mockResolvedValue(null);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedDb.setAppSetting.mockResolvedValue(undefined);
});

test('저장된 값이 없으면 built-in 기본값(4초/순차/무한반복/촬영시간/오름차순)으로 렌더링한다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);

  expect(await screen.findByText('4초')).toBeTruthy();
  expect(screen.getByTestId('slideshow-defaults-sort-criterion-creation_time').props.accessibilityState?.disabled).not.toBe(
    true
  );
});

test('저장된 값이 있으면 그 값으로 렌더링한다', async () => {
  mockedDb.getAppSetting.mockImplementation((key: string) => {
    const values: Record<string, string> = {
      slideshow_default_transition_interval_sec: '7',
      slideshow_default_order_mode: 'random',
      slideshow_default_repeat_mode: 'once',
      slideshow_default_sort_criterion: 'filename',
      slideshow_default_sort_direction: 'desc',
    };
    return Promise.resolve(values[key] ?? null);
  });

  await render(<SlideshowDefaultsScreen />);

  expect(await screen.findByText('7초')).toBeTruthy();
  expect(screen.getByTestId('slideshow-defaults-sort-criterion-filename').props.accessibilityState?.disabled).toBe(true);
});

test('전환 간격을 조정하면 즉시 저장된다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);
  await screen.findByText('4초');

  fireEvent(screen.getByTestId('slideshow-defaults-interval-slider'), 'slidingComplete', 6.6);

  expect(await screen.findByText('7초')).toBeTruthy();
  await waitFor(() =>
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_transition_interval_sec', '7')
  );
});

test('순서를 랜덤으로 바꾸면 즉시 저장되고 정렬 기준 버튼이 비활성화된다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);
  await screen.findByText('4초');

  await fireEvent.press(screen.getByTestId('slideshow-defaults-order-random'));

  await waitFor(() => expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_order_mode', 'random'));
  expect(screen.getByTestId('slideshow-defaults-sort-criterion-filename').props.accessibilityState?.disabled).toBe(true);
});

test('반복 모드를 바꾸면 즉시 저장된다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);
  await screen.findByText('4초');

  await fireEvent.press(screen.getByTestId('slideshow-defaults-repeat-once'));

  await waitFor(() => expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_repeat_mode', 'once'));
});

test('정렬 기준/방향을 바꾸면 즉시 저장된다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);
  await screen.findByText('4초');

  await fireEvent.press(screen.getByTestId('slideshow-defaults-sort-criterion-filename'));
  await fireEvent.press(screen.getByTestId('slideshow-defaults-sort-direction-desc'));

  await waitFor(() => expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_sort_criterion', 'filename'));
  await waitFor(() => expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_sort_direction', 'desc'));
});
