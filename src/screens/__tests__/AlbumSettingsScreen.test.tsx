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

  expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'random', 'loop', null);
});

test('반복 모드를 변경하면 즉시 저장된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('1회 재생'));

  expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'sequential', 'once', null);
});

test('번들 음원을 선택하면 upsertMusicTrack 후 settings에 반영된다', async () => {
  mockNoExistingSettings();
  await render(<AlbumSettingsScreen {...routeProps} />);
  await screen.findByText('4초');

  fireEvent.press(screen.getByText('Calm Piano (Alex Morgan)'));

  expect(mockedDb.upsertMusicTrack).toHaveBeenCalledWith('bundled', 'calm', 'Calm Piano');
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

  expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(1, 4, 'sequential', 'loop', null);
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

    expect(mockedDb.upsertMusicTrack).toHaveBeenCalledWith('device', 'audio-1', 'song.mp3');
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
