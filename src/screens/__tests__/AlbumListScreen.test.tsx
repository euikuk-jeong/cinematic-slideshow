import { fireEvent, render, screen, within } from '@testing-library/react-native';

import { AlbumListScreen } from '../AlbumListScreen';
import { getAppSetting, setAppSetting } from '../../db/client';
import { useMediaLibraryPermission } from '../../permissions/useMediaLibraryPermission';
import type { UseMediaLibraryPermissionResult } from '../../permissions/useMediaLibraryPermission';

jest.mock('../../permissions/useMediaLibraryPermission');
jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-media-library', () => ({
  Album: { getAll: jest.fn().mockResolvedValue([]) },
  Query: jest.fn().mockImplementation(() => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: jest.fn().mockResolvedValue([]),
  })),
  AssetField: { CREATION_TIME: 'creationTime', MEDIA_TYPE: 'mediaType' },
  MediaType: { IMAGE: 'image' },
}));

const mockedUseMediaLibraryPermission = useMediaLibraryPermission as jest.MockedFunction<
  typeof useMediaLibraryPermission
>;
const mockedGetAppSetting = getAppSetting as jest.MockedFunction<typeof getAppSetting>;
const mockedSetAppSetting = setAppSetting as jest.MockedFunction<typeof setAppSetting>;

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

function mockAlbumCoverPhoto(uri: string | null, modifiedAt: number | null = null) {
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Query.mockImplementationOnce(() => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: jest
      .fn()
      .mockResolvedValue(
        uri
          ? [{ getUri: () => Promise.resolve(uri), getModificationTime: () => Promise.resolve(modifiedAt) }]
          : []
      ),
  }));
}

beforeEach(() => {
  mockedGetAppSetting.mockResolvedValue(null);
  mockedSetAppSetting.mockClear();
});

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

test('granted 상태면 사진이 있는 기기 앨범 목록을 보여준다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  mockAlbumCoverPhoto('file:///family.jpg');
  await render(<AlbumListScreen />);
  expect(await screen.findByText('여행 사진')).toBeTruthy();
  expect(screen.getByText('가족')).toBeTruthy();
});

test('앨범에 사진이 있으면 대표 썸네일을 그려준다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumCoverPhoto('file:///thumb.jpg');
  await render(<AlbumListScreen />);
  expect(await screen.findByTestId('album-thumbnail-1')).toBeTruthy();
});

test('사진이 한 장도 없는 앨범(오디오 전용 버킷 등)은 목록에서 제외된다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('Notifications') },
  ]);
  mockAlbumCoverPhoto('file:///thumb.jpg');
  mockAlbumCoverPhoto(null);
  await render(<AlbumListScreen />);
  expect(await screen.findByText('여행 사진')).toBeTruthy();
  expect(screen.queryByText('Notifications')).toBeNull();
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

test('검색어를 입력하면 제목에 부분일치하는 앨범만 보여준다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  mockAlbumCoverPhoto('file:///family.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');

  await fireEvent.changeText(screen.getByTestId('album-search-input'), '여행');

  expect(screen.getByText('여행 사진')).toBeTruthy();
  expect(screen.queryByText('가족')).toBeNull();
});

test('검색은 대소문자를 구분하지 않는다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('Vacation') }]);
  mockAlbumCoverPhoto('file:///vacation.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('Vacation');

  await fireEvent.changeText(screen.getByTestId('album-search-input'), 'vaca');

  expect(screen.getByText('Vacation')).toBeTruthy();
});

test('검색 결과가 없으면 전용 안내 문구를 보여준다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');

  await fireEvent.changeText(screen.getByTestId('album-search-input'), '존재하지않음');

  expect(screen.getByText('검색 결과가 없어요')).toBeTruthy();
  expect(screen.queryByText('여행 사진')).toBeNull();
});

test('클리어 버튼을 누르면 검색어가 지워지고 전체 목록이 다시 보인다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  mockAlbumCoverPhoto('file:///family.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');

  await fireEvent.changeText(screen.getByTestId('album-search-input'), '여행');
  expect(screen.queryByText('가족')).toBeNull();

  await fireEvent.press(screen.getByTestId('album-search-clear'));

  expect(screen.getByText('여행 사진')).toBeTruthy();
  expect(screen.getByText('가족')).toBeTruthy();
});

test('점세개 버튼을 누르면 정렬 방식/설정/앱 정보 메뉴가 보인다', async () => {
  mockPermission({ state: 'granted' });
  await render(<AlbumListScreen />);
  await screen.findByTestId('album-menu-button');

  await fireEvent.press(screen.getByTestId('album-menu-button'));

  expect(screen.getByText('정렬 방식')).toBeTruthy();
  expect(screen.getByText('설정')).toBeTruthy();
  expect(screen.getByText('앱 정보')).toBeTruthy();
});

function cardOrder() {
  return screen.getAllByTestId(/^album-card-/).map((node) => node.props.testID);
}

test('정렬 방식을 선택하면 앨범 목록이 이름 오름차순으로 재정렬되고 DB에 저장된다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  mockAlbumCoverPhoto('file:///family.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');
  expect(cardOrder()).toEqual(['album-card-1', 'album-card-2']);

  await fireEvent.press(screen.getByTestId('album-menu-button'));
  await fireEvent.press(screen.getByTestId('album-menu-sort'));
  await fireEvent.press(screen.getByTestId('album-sort-option-title_asc'));

  expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_sort_mode', 'title_asc');
  expect(cardOrder()).toEqual(['album-card-2', 'album-card-1']);
});

test('저장된 정렬 방식(app_settings)을 불러와 앨범 목록에 적용하고 체크 표시로 보여준다', async () => {
  mockedGetAppSetting.mockImplementation((key) =>
    Promise.resolve(key === 'album_list_sort_mode' ? 'modified_desc' : null)
  );
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('오래된 앨범') },
    { id: '2', getTitle: () => Promise.resolve('최근 앨범') },
    { id: '3', getTitle: () => Promise.resolve('수정일 알 수 없는 앨범') },
  ]);
  mockAlbumCoverPhoto('file:///old.jpg', 1000);
  mockAlbumCoverPhoto('file:///new.jpg', 2000);
  mockAlbumCoverPhoto('file:///unknown.jpg', null);
  await render(<AlbumListScreen />);
  await screen.findByText('오래된 앨범');

  expect(mockedGetAppSetting).toHaveBeenCalledWith('album_list_sort_mode');
  // modified_desc: 최근(2000) → 오래된(1000) → modifiedAt null(??0 취급, 가장 뒤)
  expect(cardOrder()).toEqual(['album-card-2', 'album-card-1', 'album-card-3']);

  await fireEvent.press(screen.getByTestId('album-menu-button'));
  await fireEvent.press(screen.getByTestId('album-menu-sort'));

  const { getByText } = within(screen.getByTestId('album-sort-option-modified_desc'));
  expect(getByText('✓')).toBeTruthy();
});

test("'설정'/'앱 정보' 메뉴 항목은 지금은 눌러도 아무 동작 없이 메뉴만 닫힌다", async () => {
  mockPermission({ state: 'granted' });
  await render(<AlbumListScreen />);
  await screen.findByTestId('album-menu-button');

  await fireEvent.press(screen.getByTestId('album-menu-button'));
  await fireEvent.press(screen.getByTestId('album-menu-settings'));

  expect(screen.queryByText('설정')).toBeNull();
  expect(mockedSetAppSetting).not.toHaveBeenCalledWith('album_list_sort_mode', expect.anything());
});
