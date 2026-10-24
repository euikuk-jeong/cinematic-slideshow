import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SlideshowDefaultsScreen } from '../SlideshowDefaultsScreen';
import * as db from '../../db/client';

// automock은 실제 모듈을 먼저 require해 형태를 추론하려다 expo-sqlite(네이티브 모듈) 로드
// 실패로 깨지므로 factory로 직접 mock 함수를 제공한다(AlbumSettingsScreen.test.tsx와 동일 패턴).
jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
}));

// MusicPickerModal은 권한 훅·미디어 라이브러리에 의존하는 무거운 모달이라 이 화면 테스트에선
// "선택 결과를 콜백으로 돌려준다"는 계약만 흉내 내는 대역으로 바꾼다(전용 테스트가 따로 있음).
let mockPickedTracks: Array<{
  sourceType: 'bundled' | 'device';
  sourceValue: string;
  title: string;
  artist: string | null;
  coverUri: string | null;
}> = [];
jest.mock('../MusicPickerModal', () => {
  const { Pressable, Text } = jest.requireActual('react-native');
  return {
    MusicPickerModal: ({ visible, onSelectTracks }: { visible: boolean; onSelectTracks: (t: unknown[]) => void }) =>
      visible ? (
        <Pressable testID="mock-picker-confirm" onPress={() => onSelectTracks(mockPickedTracks)}>
          <Text>confirm</Text>
        </Pressable>
      ) : null,
  };
});

const mockedDb = db as jest.Mocked<typeof db>;

function mockNoStoredDefaults() {
  mockedDb.getAppSetting.mockResolvedValue(null);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedDb.setAppSetting.mockResolvedValue(undefined);
});

test('저장된 값이 없으면 built-in 기본값(5초/순차/1회재생/촬영시간/오름차순)으로 렌더링한다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);

  expect(await screen.findByText('5초')).toBeTruthy();
  expect(screen.getByTestId('slideshow-defaults-sort-criterion-creation_time').props.accessibilityState?.disabled).not.toBe(
    true
  );
});

test('저장된 값이 있으면 그 값으로 렌더링한다', async () => {
  mockedDb.getAppSetting.mockImplementation((key: string) => {
    const values: Record<string, string> = {
      slideshow_default_transition_interval_sec: '7',
      slideshow_default_order_mode: 'random',
      slideshow_default_repeat_mode: 'loop',
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
  await screen.findByText('5초');

  fireEvent(screen.getByTestId('slideshow-defaults-interval-slider'), 'slidingComplete', 6.6);

  expect(await screen.findByText('7초')).toBeTruthy();
  await waitFor(() =>
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_transition_interval_sec', '7')
  );
});

test('순서를 랜덤으로 바꾸면 즉시 저장되고 정렬 기준 버튼이 비활성화된다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);
  await screen.findByText('5초');

  await fireEvent.press(screen.getByTestId('slideshow-defaults-order-random'));

  await waitFor(() => expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_order_mode', 'random'));
  expect(screen.getByTestId('slideshow-defaults-sort-criterion-filename').props.accessibilityState?.disabled).toBe(true);
});

test('반복 모드를 바꾸면 즉시 저장된다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);
  await screen.findByText('5초');

  await fireEvent.press(screen.getByTestId('slideshow-defaults-repeat-loop'));

  await waitFor(() => expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_repeat_mode', 'loop'));
});

test('정렬 기준/방향을 바꾸면 즉시 저장된다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);
  await screen.findByText('5초');

  await fireEvent.press(screen.getByTestId('slideshow-defaults-sort-criterion-filename'));
  await fireEvent.press(screen.getByTestId('slideshow-defaults-sort-direction-desc'));

  await waitFor(() => expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_sort_criterion', 'filename'));
  await waitFor(() => expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_sort_direction', 'desc'));
});

const CALM = { sourceType: 'bundled', sourceValue: 'calm', title: 'Calm Piano', artist: 'Alex', coverUri: null } as const;
const WARM = { sourceType: 'bundled', sourceValue: 'warm', title: 'Warm Days', artist: null, coverUri: null } as const;

test('기본 배경음악이 없으면 빈 상태 문구를 보여준다', async () => {
  mockNoStoredDefaults();
  await render(<SlideshowDefaultsScreen />);

  expect(await screen.findByText('지정된 음악이 없어요')).toBeTruthy();
});

test('저장된 기본 배경음악을 순서대로 보여준다', async () => {
  mockedDb.getAppSetting.mockImplementation((key: string) =>
    Promise.resolve(key === 'slideshow_default_music_tracks' ? JSON.stringify([CALM, WARM]) : null)
  );
  await render(<SlideshowDefaultsScreen />);

  expect(await screen.findByText('1. Calm Piano')).toBeTruthy();
  expect(screen.getByText('Alex')).toBeTruthy();
  expect(screen.getByText('2. Warm Days')).toBeTruthy();
});

test('음악 추가로 고른 트랙을 목록에 더하고 JSON으로 저장한다', async () => {
  mockNoStoredDefaults();
  mockPickedTracks = [{ ...CALM }];
  await render(<SlideshowDefaultsScreen />);

  await fireEvent.press(await screen.findByTestId('slideshow-defaults-music-add'));
  await fireEvent.press(screen.getByTestId('mock-picker-confirm'));

  expect(await screen.findByText('1. Calm Piano')).toBeTruthy();
  expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_music_tracks', JSON.stringify([CALM]));
});

test('이미 있는 트랙을 다시 고르면 중복 추가하지 않는다', async () => {
  mockedDb.getAppSetting.mockImplementation((key: string) =>
    Promise.resolve(key === 'slideshow_default_music_tracks' ? JSON.stringify([CALM]) : null)
  );
  mockPickedTracks = [{ ...CALM }];
  await render(<SlideshowDefaultsScreen />);

  await fireEvent.press(await screen.findByTestId('slideshow-defaults-music-add'));
  await fireEvent.press(screen.getByTestId('mock-picker-confirm'));

  expect(screen.queryByText('2. Calm Piano')).toBeNull();
  expect(mockedDb.setAppSetting).not.toHaveBeenCalledWith('slideshow_default_music_tracks', expect.anything());
});

test('제거를 누르면 목록에서 빼고 저장한다', async () => {
  mockedDb.getAppSetting.mockImplementation((key: string) =>
    Promise.resolve(key === 'slideshow_default_music_tracks' ? JSON.stringify([CALM, WARM]) : null)
  );
  await render(<SlideshowDefaultsScreen />);

  await fireEvent.press(await screen.findByTestId('slideshow-defaults-music-remove-bundled:calm'));

  await waitFor(() => expect(screen.queryByText('1. Calm Piano')).toBeNull());
  expect(screen.getByText('1. Warm Days')).toBeTruthy();
  expect(mockedDb.setAppSetting).toHaveBeenCalledWith('slideshow_default_music_tracks', JSON.stringify([WARM]));
});
