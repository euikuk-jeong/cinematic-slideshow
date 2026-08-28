import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';

import { AlbumSettingsScreen } from '../AlbumSettingsScreen';
import * as db from '../../db/client';
import type { Album, MusicTrack, SlideshowSettings } from '../../db/types';

// automock은 실제 모듈을 먼저 require해 형태를 추론하려다 expo-sqlite(네이티브 모듈) 로드
// 실패로 깨지므로 factory로 직접 mock 함수를 제공한다.
jest.mock('../../db/client', () => ({
  getAlbumByDeviceId: jest.fn(),
  insertAlbum: jest.fn(),
  updateAlbumDisplayName: jest.fn(),
  getSlideshowSettingsByAlbumId: jest.fn(),
  getMusicTracksBySettingsId: jest.fn(),
  upsertMusicTrack: jest.fn(),
  upsertSlideshowSettings: jest.fn(),
  setSlideshowMusicTracks: jest.fn(),
}));
let capturedDevicePickerProps: {
  onSelectTracks: (tracks: readonly { sourceValue: string; title: string }[]) => void;
} | null = null;
jest.mock('../DeviceMusicPickerModal', () => ({
  DeviceMusicPickerModal: (props: {
    onSelectTracks: (tracks: readonly { sourceValue: string; title: string }[]) => void;
  }) => {
    capturedDevicePickerProps = props;
    return null;
  },
}));

// react-native-draggable-flatlist는 Reanimated 공유값을 실제 네이티브 스레드 타이밍에 맞춰
// 배치 처리하는데, RNTL/Jest 환경(react-native-reanimated/mock)에서는 그 배치가 없어 내부
// onAnimValInit → setState가 무한 루프에 빠진다(디바이스 동작과 무관한 테스트 환경 전용 문제).
// 그래서 실제 드래그 제스처 대신 렌더링만 그대로 흉내내고, onDragEnd를 캡처해 테스트에서
// 직접 호출하는 방식으로 재정렬 로직(우리 쪽 handleMusicDragEnd)만 검증한다.
let capturedMusicListProps: { data: unknown[]; onDragEnd: (params: { data: unknown[] }) => void } | null = null;
jest.mock('react-native-draggable-flatlist', () => {
  const RN = require('react-native');
  const ReactLib = require('react');
  return {
    NestableScrollContainer: (props: { children: unknown }) => ReactLib.createElement(RN.View, null, props.children),
    NestableDraggableFlatList: (props: {
      data: unknown[];
      keyExtractor: (item: unknown, index: number) => string;
      renderItem: (params: { item: unknown; index: number; getIndex: () => number; drag: () => void; isActive: boolean }) => unknown;
      onDragEnd: (params: { data: unknown[] }) => void;
    }) => {
      capturedMusicListProps = props;
      return ReactLib.createElement(
        RN.View,
        null,
        props.data.map((item: unknown, index: number) =>
          ReactLib.createElement(
            RN.View,
            { key: props.keyExtractor(item, index) },
            props.renderItem({ item, index, getIndex: () => index, drag: jest.fn(), isActive: false })
          )
        )
      );
    },
  };
});

const mockedDb = db as jest.Mocked<typeof db>;

const album: Album = {
  id: 1,
  deviceAlbumId: 'device-album-1',
  displayName: '여행 사진',
  isReferenceValid: true,
  createdAt: '2026-08-23T00:00:00.000Z',
};

const calmTrack: MusicTrack = {
  id: 10,
  sourceType: 'bundled',
  sourceValue: 'calm',
  title: 'Calm Piano',
  createdAt: '2026-08-23T00:00:00.000Z',
};

const settingsBase: SlideshowSettings = {
  id: 1,
  albumId: 1,
  transitionIntervalSec: 4,
  orderMode: 'sequential',
  repeatMode: 'loop',
  updatedAt: '2026-08-23T00:00:00.000Z',
};

const routeProps = { route: { params: { deviceAlbumId: 'device-album-1', displayName: '여행 사진' } } } as any;

function mockNoExistingSettings() {
  mockedDb.getAlbumByDeviceId.mockResolvedValue(null);
  mockedDb.insertAlbum.mockResolvedValue(album);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(null);
  mockedDb.upsertMusicTrack.mockResolvedValue(calmTrack);
  mockedDb.upsertSlideshowSettings.mockResolvedValue(settingsBase);
  mockedDb.setSlideshowMusicTracks.mockResolvedValue(undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
});

test('신규 앨범이면 album을 생성하고 기본값으로 렌더링한다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);

  expect(await screen.findByText('4초')).toBeTruthy();
  expect(mockedDb.insertAlbum).toHaveBeenCalledWith('device-album-1', '여행 사진');
});

test('기존 앨범이면 저장된 설정과 재생목록을 불러와 반영한다', async () => {
  mockedDb.getAlbumByDeviceId.mockResolvedValue(album);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({
    ...settingsBase,
    transitionIntervalSec: 6,
    orderMode: 'random',
    repeatMode: 'once',
  });
  mockedDb.getMusicTracksBySettingsId.mockResolvedValue([calmTrack]);

  await render(<AlbumSettingsScreen {...routeProps} />);

  expect(await screen.findByText('6초')).toBeTruthy();
  expect(await screen.findByText('1. Calm Piano')).toBeTruthy();
  expect(mockedDb.getMusicTracksBySettingsId).toHaveBeenCalledWith(1);
  expect(mockedDb.insertAlbum).not.toHaveBeenCalled();
});

test('순서를 변경하면 즉시 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('랜덤'));

  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'random', 'loop'));
});

test('반복 모드를 변경하면 즉시 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('1회 재생'));

  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'sequential', 'once'));
});

test('번들 음원을 추가하면 upsertMusicTrack 후 재생목록에 반영된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('Calm Piano (Alex Morgan)'));

  expect(await screen.findByText('1. Calm Piano')).toBeTruthy();
  await waitFor(() => expect(mockedDb.upsertMusicTrack).toHaveBeenCalledWith('bundled', 'calm', 'Calm Piano'));
  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'sequential', 'loop'));
  await waitFor(() => expect(mockedDb.setSlideshowMusicTracks).toHaveBeenCalledWith(1, [10]));
});

test('선택된 트랙을 제거하면 빈 재생목록으로 저장된다', async () => {
  mockedDb.getAlbumByDeviceId.mockResolvedValue(album);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settingsBase);
  mockedDb.getMusicTracksBySettingsId.mockResolvedValue([calmTrack]);
  mockedDb.upsertSlideshowSettings.mockResolvedValue(settingsBase);
  mockedDb.setSlideshowMusicTracks.mockResolvedValue(undefined);

  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('1. Calm Piano');

  fireEvent.press(screen.getByTestId('music-remove-bundled:calm'));

  expect(await screen.findByText('선택된 음악이 없어요')).toBeTruthy();
  await waitFor(() => expect(mockedDb.setSlideshowMusicTracks).toHaveBeenCalledWith(1, []));
  expect(mockedDb.upsertMusicTrack).not.toHaveBeenCalled();
});

test('여러 곡을 추가한 뒤 순서를 바꾸면 바뀐 순서대로 저장된다', async () => {
  mockNoExistingSettings();
  const upbeatTrack: MusicTrack = { id: 11, sourceType: 'bundled', sourceValue: 'upbeat', title: 'Summer Pop', createdAt: '2026-08-23T00:00:00.000Z' };
  mockedDb.upsertMusicTrack.mockImplementation(async (sourceType, sourceValue) =>
    sourceValue === 'calm' ? calmTrack : upbeatTrack
  );

  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('Calm Piano (Alex Morgan)'));
  expect(await screen.findByText('1. Calm Piano')).toBeTruthy();
  fireEvent.press(screen.getByText('Summer Pop (JonasBlakewood)'));
  expect(await screen.findByText('2. Summer Pop')).toBeTruthy();

  await waitFor(() => expect(mockedDb.setSlideshowMusicTracks).toHaveBeenLastCalledWith(1, [10, 11]));

  // 실제 드래그 제스처는 RNTL로 재현할 수 없어(위 mock 설명 참고), 드래그가 끝났을 때
  // 라이브러리가 호출하는 onDragEnd를 캡처해 재정렬된 데이터로 직접 호출해 흉내낸다.
  await act(async () => {
    capturedMusicListProps!.onDragEnd({ data: [...capturedMusicListProps!.data].reverse() });
  });

  expect(await screen.findByText('1. Summer Pop')).toBeTruthy();
  expect(await screen.findByText('2. Calm Piano')).toBeTruthy();
  await waitFor(() => expect(mockedDb.setSlideshowMusicTracks).toHaveBeenLastCalledWith(1, [11, 10]));
});

test('이미 선택된 곡은 "추가" 목록에서 사라져 중복 추가할 수 없다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('Calm Piano (Alex Morgan)'));
  await screen.findByText('1. Calm Piano');

  expect(screen.queryByText('Calm Piano (Alex Morgan)')).toBeNull();
});

test('Android에서 기기 음악을 추가하면 upsertMusicTrack(device) 후 재생목록에 반영된다', async () => {
  const originalOS = Platform.OS;
  Platform.OS = 'android';
  try {
    mockNoExistingSettings();
    const deviceTrack: MusicTrack = {
      id: 20,
      sourceType: 'device',
      sourceValue: 'audio-1',
      title: 'song.mp3',
      createdAt: '2026-08-23T00:00:00.000Z',
    };
    mockedDb.upsertMusicTrack.mockResolvedValue(deviceTrack);
    await render(<AlbumSettingsScreen {...routeProps} />);
    await screen.findByText('4초');

    expect(capturedDevicePickerProps).not.toBeNull();
    await act(async () => {
      capturedDevicePickerProps!.onSelectTracks([{ sourceValue: 'audio-1', title: 'song.mp3' }]);
    });

    await waitFor(() => expect(mockedDb.upsertMusicTrack).toHaveBeenCalledWith('device', 'audio-1', 'song.mp3'));
    await waitFor(() => expect(mockedDb.setSlideshowMusicTracks).toHaveBeenCalledWith(1, [20]));
  } finally {
    Platform.OS = originalOS;
  }
});

test('한 번에 여러 곡을 확정해도(배치 추가) 모두 반영된다', async () => {
  const originalOS = Platform.OS;
  Platform.OS = 'android';
  try {
    mockNoExistingSettings();
    const trackByValue: Record<string, MusicTrack> = {
      'audio-1': { id: 20, sourceType: 'device', sourceValue: 'audio-1', title: 'song-one.mp3', createdAt: '2026-08-23T00:00:00.000Z' },
      'audio-2': { id: 21, sourceType: 'device', sourceValue: 'audio-2', title: 'song-two.mp3', createdAt: '2026-08-23T00:00:00.000Z' },
    };
    mockedDb.upsertMusicTrack.mockImplementation(async (_sourceType, sourceValue) => trackByValue[sourceValue]);
    await render(<AlbumSettingsScreen {...routeProps} />);
    await screen.findByText('4초');

    await act(async () => {
      capturedDevicePickerProps!.onSelectTracks([
        { sourceValue: 'audio-1', title: 'song-one.mp3' },
        { sourceValue: 'audio-2', title: 'song-two.mp3' },
      ]);
    });

    expect(await screen.findByText('1. song-one.mp3')).toBeTruthy();
    expect(await screen.findByText('2. song-two.mp3')).toBeTruthy();
    await waitFor(() => expect(mockedDb.setSlideshowMusicTracks).toHaveBeenLastCalledWith(1, [20, 21]));
  } finally {
    Platform.OS = originalOS;
  }
});

test('같은 기기 음악을 두 번 추가해도 재생목록에는 한 번만 반영된다', async () => {
  const originalOS = Platform.OS;
  Platform.OS = 'android';
  try {
    mockNoExistingSettings();
    const deviceTrack: MusicTrack = {
      id: 20,
      sourceType: 'device',
      sourceValue: 'audio-1',
      title: 'song.mp3',
      createdAt: '2026-08-23T00:00:00.000Z',
    };
    mockedDb.upsertMusicTrack.mockResolvedValue(deviceTrack);
    await render(<AlbumSettingsScreen {...routeProps} />);
    await screen.findByText('4초');

    await act(async () => {
      capturedDevicePickerProps!.onSelectTracks([{ sourceValue: 'audio-1', title: 'song.mp3' }]);
    });
    await screen.findByText('1. song.mp3');
    await act(async () => {
      capturedDevicePickerProps!.onSelectTracks([{ sourceValue: 'audio-1', title: 'song.mp3' }]);
    });

    expect(screen.queryByText('2. song.mp3')).toBeNull();
    await waitFor(() => expect(mockedDb.setSlideshowMusicTracks).toHaveBeenLastCalledWith(1, [20]));
  } finally {
    Platform.OS = originalOS;
  }
});

test('기기 음악 추가 버튼은 Android에서만 노출된다(iOS는 expo-media-library가 오디오 자산을 다루지 않음)', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');
  expect(screen.queryByText('기기에서 추가')).toBeNull();
});

test('Android에서는 기기 음악 추가 버튼이 노출된다', async () => {
  const originalOS = Platform.OS;
  Platform.OS = 'android';
  try {
    mockNoExistingSettings();
    await render(<AlbumSettingsScreen {...routeProps} />);
    await screen.findByText('4초');
    expect(screen.getByText('기기에서 추가')).toBeTruthy();
  } finally {
    Platform.OS = originalOS;
  }
});

test('슬라이더를 최솟값(2초)으로 조정하면 즉시 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent(screen.getByTestId('transition-interval-slider'), 'slidingComplete', 2);

  expect(await screen.findByText('2초')).toBeTruthy();
  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 2, 'sequential', 'loop'));
});

test('슬라이더를 최댓값(10초)으로 조정하면 즉시 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent(screen.getByTestId('transition-interval-slider'), 'slidingComplete', 10);

  expect(await screen.findByText('10초')).toBeTruthy();
  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 10, 'sequential', 'loop'));
});

test('슬라이더 값은 정수로 반올림되어 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent(screen.getByTestId('transition-interval-slider'), 'slidingComplete', 6.6);

  expect(await screen.findByText('7초')).toBeTruthy();
  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 7, 'sequential', 'loop'));
});

test('기존 앨범의 표시명이 기기에서 바뀌었으면 DB의 display_name을 갱신한다', async () => {
  mockedDb.getAlbumByDeviceId.mockResolvedValue(album);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(null);

  const renamedRouteProps = {
    route: { params: { deviceAlbumId: 'device-album-1', displayName: '여행 사진 (수정됨)' } },
  } as any;
  await render(<AlbumSettingsScreen {...renamedRouteProps} />);

  await screen.findByText('4초');
  expect(mockedDb.updateAlbumDisplayName).toHaveBeenCalledWith(1, '여행 사진 (수정됨)');
});

test('mount 시 DB 조회가 실패하면 에러 문구를 보여주고 로딩 스피너를 멈춘다', async () => {
  mockedDb.getAlbumByDeviceId.mockRejectedValue(new Error('db error'));

  await render(<AlbumSettingsScreen {...routeProps} />);

  expect(await screen.findByText('설정을 불러오지 못했어요')).toBeTruthy();
});

test('저장이 실패하면 에러 문구를 보여준다', async () => {
  mockNoExistingSettings();
  mockedDb.upsertSlideshowSettings.mockRejectedValue(new Error('save failed'));
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('랜덤'));

  expect(await screen.findByText('설정 저장에 실패했어요. 다시 시도해주세요')).toBeTruthy();
});

test('저장 실패 후 다음 저장이 성공하면 에러 문구가 사라진다', async () => {
  mockNoExistingSettings();
  mockedDb.upsertSlideshowSettings.mockRejectedValueOnce(new Error('save failed'));
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('랜덤'));
  await screen.findByText('설정 저장에 실패했어요. 다시 시도해주세요');

  fireEvent.press(screen.getByText('1회 재생'));

  await waitFor(() =>
    expect(screen.queryByText('설정 저장에 실패했어요. 다시 시도해주세요')).toBeNull()
  );
});

test('설정 로드는 성공했지만 저장된 재생목록 조회가 실패하면 화면은 정상 렌더링하고 별도 안내만 보여준다', async () => {
  mockedDb.getAlbumByDeviceId.mockResolvedValue(album);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settingsBase);
  mockedDb.getMusicTracksBySettingsId.mockRejectedValue(new Error('playlist lookup failed'));

  await render(<AlbumSettingsScreen {...routeProps} />);

  expect(await screen.findByText('4초')).toBeTruthy();
  expect(await screen.findByText('저장된 배경음악 정보를 불러오지 못했어요')).toBeTruthy();
  expect(screen.queryByText('설정을 불러오지 못했어요')).toBeNull();
});
