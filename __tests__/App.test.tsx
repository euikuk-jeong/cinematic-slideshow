import { render, screen } from '@testing-library/react-native';

import App from '../App';

jest.mock('../src/permissions/useMediaLibraryPermission', () => ({
  useMediaLibraryPermission: () => ({
    state: 'granted',
    start: jest.fn(),
    confirmRationale: jest.fn(),
    cancelRationale: jest.fn(),
    openSettings: jest.fn(),
  }),
}));
jest.mock('expo-media-library', () => ({
  Album: { getAll: jest.fn().mockResolvedValue([]) },
  Asset: jest.fn().mockImplementation(() => ({ getUri: jest.fn().mockResolvedValue(null) })),
}));
// AlbumSettingsScreen이 정적 import로 끌어오는 모듈 — music-metadata(동적 import 기반)는
// Jest VM에서 실행 불가해(src/music/__tests__/tagReader.test.ts 상단 설명 참고) mock 처리.
jest.mock('../src/music/resolveTrackMetadata', () => ({
  resolveDeviceTrackMetadata: jest.fn().mockResolvedValue(null),
}));
// expo-sqlite는 네이티브 모듈이라 Jest(Node 프로세스)에서 로드 불가 — App.tsx가 스택에
// 등록하는 AlbumSettingsScreen이 정적 import로 src/db/client를 끌어오므로 여기서 mock 처리.
// (automock은 실제 모듈을 먼저 require해 형태를 추론하려다 같은 이유로 실패하므로 factory 필요)
jest.mock('../src/db/client', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  getAlbumByDeviceId: jest.fn(),
  insertAlbum: jest.fn(),
  updateAlbumDisplayName: jest.fn(),
  getSlideshowSettingsByAlbumId: jest.fn(),
  getSlideshowDefaults: jest.fn().mockResolvedValue({
    transitionIntervalSec: 5,
    orderMode: 'sequential',
    repeatMode: 'once',
    sortCriterion: 'creation_time',
    sortDirection: 'asc',
  }),
  getMusicTracksBySettingsId: jest.fn(),
  upsertMusicTrack: jest.fn(),
  upsertSlideshowSettings: jest.fn(),
  setSlideshowMusicTracks: jest.fn(),
  reconcileAlbumReferenceValidity: jest.fn().mockResolvedValue({ toValid: [], toInvalid: [] }),
  getAllAlbums: jest.fn().mockResolvedValue([]),
  deleteAlbum: jest.fn(),
  getSelectedPhotoCount: jest.fn().mockResolvedValue(0),
  getSelectedPhotoIds: jest.fn().mockResolvedValue([]),
  addSelectedPhoto: jest.fn(),
  removeSelectedPhoto: jest.fn(),
  setSelectedPhotoIds: jest.fn(),
}));

test('앨범 목록 화면으로 진입한다', async () => {
  await render(<App />);
  expect(await screen.findByText('사진 앨범이 없어요')).toBeTruthy();
});
