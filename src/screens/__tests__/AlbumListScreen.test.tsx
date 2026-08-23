import { render, screen } from '@testing-library/react-native';

import { AlbumListScreen } from '../AlbumListScreen';
import { useMediaLibraryPermission } from '../../permissions/useMediaLibraryPermission';
import type { UseMediaLibraryPermissionResult } from '../../permissions/useMediaLibraryPermission';

jest.mock('../../permissions/useMediaLibraryPermission');
jest.mock('expo-media-library', () => ({
  Album: { getAll: jest.fn().mockResolvedValue([]) },
  Query: jest.fn().mockImplementation(() => ({
    album: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: jest.fn().mockResolvedValue([]),
  })),
  AssetField: { CREATION_TIME: 'creationTime' },
}));

const mockedUseMediaLibraryPermission = useMediaLibraryPermission as jest.MockedFunction<
  typeof useMediaLibraryPermission
>;

function mockPermission(overrides: Partial<UseMediaLibraryPermissionResult>) {
  mockedUseMediaLibraryPermission.mockReturnValue({
    state: 'idle',
    isReady: true,
    start: jest.fn(),
    confirmRationale: jest.fn(),
    cancelRationale: jest.fn(),
    openSettings: jest.fn(),
    ...overrides,
  });
}

test('rationale 상태면 설명 화면을 보여준다', async () => {
  mockPermission({ state: 'rationale' });
  await render(<AlbumListScreen />);
  expect(screen.getByText('사진 접근 권한이 필요해요')).toBeTruthy();
});

test('blocked 상태면 설정 이동 화면을 보여준다', async () => {
  mockPermission({ state: 'blocked' });
  await render(<AlbumListScreen />);
  expect(screen.getByText('사진 접근 권한이 꺼져 있어요')).toBeTruthy();
});

test('partial_unsupported 상태면 전체 허용 안내를 보여준다', async () => {
  mockPermission({ state: 'partial_unsupported' });
  await render(<AlbumListScreen />);
  expect(screen.getByText('전체 앨범 접근이 필요해요')).toBeTruthy();
});

test('granted 상태면 기기 앨범 목록을 보여준다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  await render(<AlbumListScreen />);
  expect(await screen.findByText('여행 사진')).toBeTruthy();
  expect(screen.getByText('가족')).toBeTruthy();
});

test('앨범에 사진이 있으면 대표 썸네일을 그려준다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mediaLibrary.Query.mockImplementationOnce(() => ({
    album: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: jest.fn().mockResolvedValue([{ getUri: () => Promise.resolve('file:///thumb.jpg') }]),
  }));
  await render(<AlbumListScreen />);
  expect(await screen.findByTestId('album-thumbnail-1')).toBeTruthy();
});

test('앨범에 사진이 없으면 썸네일 대신 플레이스홀더를 보여준다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('빈 앨범') }]);
  await render(<AlbumListScreen />);
  expect(await screen.findByText('빈 앨범')).toBeTruthy();
  expect(screen.queryByTestId('album-thumbnail-1')).toBeNull();
});

test('idle 상태면 마운트 시 권한 흐름을 시작한다', async () => {
  const start = jest.fn();
  mockPermission({ state: 'idle', isReady: true, start });
  await render(<AlbumListScreen />);
  expect(start).toHaveBeenCalled();
});

test('denied 상태면 재요청을 위해 자동으로 rationale로 되돌아간다', async () => {
  const start = jest.fn();
  mockPermission({ state: 'denied', isReady: true, start });
  await render(<AlbumListScreen />);
  expect(start).toHaveBeenCalled();
});

test('콜드스타트 조회가 끝나기 전에는 idle이어도 시작하지 않는다(rationale 깜빡임 방지)', async () => {
  const start = jest.fn();
  mockPermission({ state: 'idle', isReady: false, start });
  const { rerender } = await render(<AlbumListScreen />);
  expect(start).not.toHaveBeenCalled();

  mockPermission({ state: 'granted', isReady: true, start });
  await rerender(<AlbumListScreen />);
  expect(start).not.toHaveBeenCalled();
  expect(screen.queryByText('사진 접근 권한이 필요해요')).toBeNull();
});

test('partial_unsupported 상태에서는 앨범을 조회하지 않는다', async () => {
  mockPermission({ state: 'partial_unsupported' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockClear();
  await render(<AlbumListScreen />);
  expect(mediaLibrary.Album.getAll).not.toHaveBeenCalled();
});
