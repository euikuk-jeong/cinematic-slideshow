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
  getMusicTrackById: jest.fn(),
  upsertMusicTrack: jest.fn(),
  upsertSlideshowSettings: jest.fn(),
}));
let capturedDevicePickerProps: { onSelect: (track: { sourceValue: string; title: string }) => void } | null = null;
jest.mock('../DeviceMusicPickerModal', () => ({
  DeviceMusicPickerModal: (props: { onSelect: (track: { sourceValue: string; title: string }) => void }) => {
    capturedDevicePickerProps = props;
    return null;
  },
}));

const mockedDb = db as jest.Mocked<typeof db>;

const album: Album = {
  id: 1,
  deviceAlbumId: 'device-album-1',
  displayName: '여행 사진',
  isReferenceValid: true,
  createdAt: '2026-08-23T00:00:00.000Z',
};

const routeProps = { route: { params: { deviceAlbumId: 'device-album-1', displayName: '여행 사진' } } } as any;

function mockNoExistingSettings() {
  mockedDb.getAlbumByDeviceId.mockResolvedValue(null);
  mockedDb.insertAlbum.mockResolvedValue(album);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(null);
  mockedDb.upsertMusicTrack.mockResolvedValue({
    id: 10,
    sourceType: 'bundled',
    sourceValue: 'calm',
    title: 'Calm Piano',
    createdAt: '2026-08-23T00:00:00.000Z',
  } as MusicTrack);
  mockedDb.upsertSlideshowSettings.mockResolvedValue({} as SlideshowSettings);
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

test('기존 앨범이면 저장된 설정을 불러와 반영한다', async () => {
  mockedDb.getAlbumByDeviceId.mockResolvedValue(album);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({
    id: 1,
    albumId: 1,
    transitionIntervalSec: 6,
    orderMode: 'random',
    repeatMode: 'once',
    musicTrackId: 10,
    updatedAt: '2026-08-23T00:00:00.000Z',
  });
  mockedDb.getMusicTrackById.mockResolvedValue({
    id: 10,
    sourceType: 'bundled',
    sourceValue: 'calm',
    title: 'Calm Piano',
    createdAt: '2026-08-23T00:00:00.000Z',
  });

  await render(<AlbumSettingsScreen {...routeProps} />);

  expect(await screen.findByText('6초')).toBeTruthy();
  expect(mockedDb.insertAlbum).not.toHaveBeenCalled();
});

test('순서를 변경하면 즉시 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('랜덤'));

  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'random', 'loop', null));
});

test('반복 모드를 변경하면 즉시 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('1회 재생'));

  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'sequential', 'once', null));
});

test('번들 음원을 선택하면 upsertMusicTrack 후 settings에 반영된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('Calm Piano (Alex Morgan)'));

  await waitFor(() => expect(mockedDb.upsertMusicTrack).toHaveBeenCalledWith('bundled', 'calm', 'Calm Piano'));
  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'sequential', 'loop', 10));
});

test('"없음"을 선택하면 music_track_id가 null로 저장된다', async () => {
  mockedDb.getAlbumByDeviceId.mockResolvedValue(album);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({
    id: 1,
    albumId: 1,
    transitionIntervalSec: 4,
    orderMode: 'sequential',
    repeatMode: 'loop',
    musicTrackId: 10,
    updatedAt: '2026-08-23T00:00:00.000Z',
  });
  mockedDb.getMusicTrackById.mockResolvedValue({
    id: 10,
    sourceType: 'bundled',
    sourceValue: 'calm',
    title: 'Calm Piano',
    createdAt: '2026-08-23T00:00:00.000Z',
  });
  mockedDb.upsertSlideshowSettings.mockResolvedValue({} as SlideshowSettings);

  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('없음'));

  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'sequential', 'loop', null));
  expect(mockedDb.upsertMusicTrack).not.toHaveBeenCalled();
});

test('Android에서 기기 음악을 선택하면 upsertMusicTrack(device) 후 settings에 반영된다', async () => {
  const originalOS = Platform.OS;
  Platform.OS = 'android';
  try {
    mockNoExistingSettings();
    mockedDb.upsertMusicTrack.mockResolvedValue({
      id: 20,
      sourceType: 'device',
      sourceValue: 'audio-1',
      title: 'song.mp3',
      createdAt: '2026-08-23T00:00:00.000Z',
    } as MusicTrack);
    await render(<AlbumSettingsScreen {...routeProps} />);
    await screen.findByText('4초');

    expect(capturedDevicePickerProps).not.toBeNull();
    await act(async () => {
      capturedDevicePickerProps!.onSelect({ sourceValue: 'audio-1', title: 'song.mp3' });
    });

    await waitFor(() => expect(mockedDb.upsertMusicTrack).toHaveBeenCalledWith('device', 'audio-1', 'song.mp3'));
    await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'sequential', 'loop', 20));
  } finally {
    Platform.OS = originalOS;
  }
});

test('기기 음악 선택 버튼은 Android에서만 노출된다(iOS는 expo-media-library가 오디오 자산을 다루지 않음)', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');
  expect(screen.queryByText('기기에서 선택')).toBeNull();
});

test('Android에서는 기기 음악 선택 버튼이 노출된다', async () => {
  const originalOS = Platform.OS;
  Platform.OS = 'android';
  try {
    mockNoExistingSettings();
    await render(<AlbumSettingsScreen {...routeProps} />);
    await screen.findByText('4초');
    expect(screen.getByText('기기에서 선택')).toBeTruthy();
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
  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 2, 'sequential', 'loop', null));
});

test('슬라이더를 최댓값(10초)으로 조정하면 즉시 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent(screen.getByTestId('transition-interval-slider'), 'slidingComplete', 10);

  expect(await screen.findByText('10초')).toBeTruthy();
  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 10, 'sequential', 'loop', null));
});

test('슬라이더 값은 정수로 반올림되어 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent(screen.getByTestId('transition-interval-slider'), 'slidingComplete', 6.6);

  expect(await screen.findByText('7초')).toBeTruthy();
  await waitFor(() => expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 7, 'sequential', 'loop', null));
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

test('설정 로드는 성공했지만 저장된 음악 트랙 조회가 실패하면 화면은 정상 렌더링하고 별도 안내만 보여준다', async () => {
  mockedDb.getAlbumByDeviceId.mockResolvedValue(album);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({
    id: 1,
    albumId: 1,
    transitionIntervalSec: 4,
    orderMode: 'sequential',
    repeatMode: 'loop',
    musicTrackId: 10,
    updatedAt: '2026-08-23T00:00:00.000Z',
  });
  mockedDb.getMusicTrackById.mockRejectedValue(new Error('track lookup failed'));

  await render(<AlbumSettingsScreen {...routeProps} />);

  expect(await screen.findByText('4초')).toBeTruthy();
  expect(await screen.findByText('저장된 배경음악 정보를 불러오지 못했어요')).toBeTruthy();
  expect(screen.queryByText('설정을 불러오지 못했어요')).toBeNull();
});
