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
}));
// expo-sqlite는 네이티브 모듈이라 Jest(Node 프로세스)에서 로드 불가 — App.tsx가 스택에
// 등록하는 AlbumSettingsScreen이 정적 import로 src/db/client를 끌어오므로 여기서 mock 처리.
// (automock은 실제 모듈을 먼저 require해 형태를 추론하려다 같은 이유로 실패하므로 factory 필요)
jest.mock('../src/db/client', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  getAlbumByDeviceId: jest.fn(),
  insertAlbum: jest.fn(),
  getSlideshowSettingsByAlbumId: jest.fn(),
  getMusicTrackById: jest.fn(),
  upsertMusicTrack: jest.fn(),
  upsertSlideshowSettings: jest.fn(),
}));

test('앨범 목록 화면으로 진입한다', async () => {
  await render(<App />);
  expect(await screen.findByText('사진 앨범이 없어요')).toBeTruthy();
});
