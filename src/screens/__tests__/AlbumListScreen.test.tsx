import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { AlbumListScreen } from '../AlbumListScreen';
import { getAppSetting, setAppSetting } from '../../db/client';
import { useMediaLibraryPermission } from '../../permissions/useMediaLibraryPermission';
import type { UseMediaLibraryPermissionResult } from '../../permissions/useMediaLibraryPermission';
import { notifyHiddenAlbumIdsChanged } from '../../settings/hiddenAlbums';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: mockNavigate }),
}));
jest.mock('../../permissions/useMediaLibraryPermission');
jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-media-library', () => ({
  Album: Object.assign(
    jest.fn().mockImplementation((id: string) => ({ id })),
    { getAll: jest.fn().mockResolvedValue([]) }
  ),
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
  mockNavigate.mockClear();
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

test('정렬 기준을 선택하면 이름 오름차순(기본 방향)으로 재정렬되고 DB에 저장된다', async () => {
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
  await fireEvent.press(screen.getByTestId('album-sort-criterion-title'));

  expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_sort_criterion', 'title');
  expect(cardOrder()).toEqual(['album-card-2', 'album-card-1']);
});

test('정렬 방향을 내림차순으로 바꾸면 순서가 뒤집히고 DB에 저장된다', async () => {
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

  await fireEvent.press(screen.getByTestId('album-menu-button'));
  await fireEvent.press(screen.getByTestId('album-menu-sort'));
  await fireEvent.press(screen.getByTestId('album-sort-criterion-title'));
  await fireEvent.press(screen.getByTestId('album-sort-direction-desc'));

  expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_sort_direction', 'desc');
  expect(cardOrder()).toEqual(['album-card-1', 'album-card-2']);
});

test("기준을 '시스템 기본'으로 두면 순서 그룹이 보이지 않고 기기 반환 순서 그대로 보여준다", async () => {
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

  await fireEvent.press(screen.getByTestId('album-menu-button'));
  await fireEvent.press(screen.getByTestId('album-menu-sort'));

  expect(screen.queryByTestId('album-sort-direction-asc')).toBeNull();
  expect(cardOrder()).toEqual(['album-card-1', 'album-card-2']);
});

test('저장된 정렬 기준/방향(app_settings)을 불러와 앨범 목록에 적용하고 체크 표시로 보여준다', async () => {
  mockedGetAppSetting.mockImplementation((key) => {
    if (key === 'album_list_sort_criterion') return Promise.resolve('modified');
    if (key === 'album_list_sort_direction') return Promise.resolve('desc');
    return Promise.resolve(null);
  });
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

  expect(mockedGetAppSetting).toHaveBeenCalledWith('album_list_sort_criterion');
  expect(mockedGetAppSetting).toHaveBeenCalledWith('album_list_sort_direction');
  // modified desc: 최근(2000) → 오래된(1000) → modifiedAt null(??0 취급, 가장 뒤)
  expect(cardOrder()).toEqual(['album-card-2', 'album-card-1', 'album-card-3']);

  await fireEvent.press(screen.getByTestId('album-menu-button'));
  await fireEvent.press(screen.getByTestId('album-menu-sort'));

  expect(within(screen.getByTestId('album-sort-criterion-modified')).getByText('✓')).toBeTruthy();
  expect(within(screen.getByTestId('album-sort-direction-desc')).getByText('✓')).toBeTruthy();
});

test("정렬 기준 '사진 개수'를 처음 고르면 앨범별 이미지 개수를 조회해 정렬한다", async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('적은 사진') },
    { id: '2', getTitle: () => Promise.resolve('많은 사진') },
  ]);
  mockAlbumCoverPhoto('file:///few.jpg');
  mockAlbumCoverPhoto('file:///many.jpg');

  const queryExeMock = jest.fn().mockResolvedValue([]);
  queryExeMock.mockResolvedValueOnce([{ id: 'a' }]).mockResolvedValueOnce([{ id: 'b' }, { id: 'c' }, { id: 'd' }]);
  mediaLibrary.Query.mockImplementation(() => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: queryExeMock,
  }));

  await render(<AlbumListScreen />);
  await screen.findByText('적은 사진');

  await fireEvent.press(screen.getByTestId('album-menu-button'));
  await fireEvent.press(screen.getByTestId('album-menu-sort'));
  await fireEvent.press(screen.getByTestId('album-sort-criterion-photo_count'));

  expect(await screen.findByTestId('album-sort-direction-asc')).toBeTruthy();
  expect(cardOrder()).toEqual(['album-card-1', 'album-card-2']);
});

test('기본값은 그리드 뷰이고, 토글 버튼을 누르면 리스트 뷰로 전환되며 DB에 저장된다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');

  await fireEvent.press(screen.getByTestId('album-view-mode-toggle'));

  expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_view_mode', 'list');
  expect(screen.getByTestId('album-card-1')).toBeTruthy();
  expect(screen.getByText('여행 사진')).toBeTruthy();
});

test('저장된 뷰 모드(app_settings)를 불러와 적용한다', async () => {
  mockedGetAppSetting.mockImplementation((key) => {
    if (key === 'album_list_view_mode') return Promise.resolve('list');
    return Promise.resolve(null);
  });
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');

  expect(mockedGetAppSetting).toHaveBeenCalledWith('album_list_view_mode');

  await fireEvent.press(screen.getByTestId('album-view-mode-toggle'));

  expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_view_mode', 'grid');
});

test("'설정' 메뉴 항목을 누르면 설정 화면으로 이동하고 메뉴가 닫힌다", async () => {
  mockPermission({ state: 'granted' });
  await render(<AlbumListScreen />);
  await screen.findByTestId('album-menu-button');

  await fireEvent.press(screen.getByTestId('album-menu-button'));
  await fireEvent.press(screen.getByTestId('album-menu-settings'));

  expect(mockNavigate).toHaveBeenCalledWith('AppSettings');
  expect(screen.queryByText('설정')).toBeNull();
});

test('제외(숨김) 처리된 앨범은 목록에서 보이지 않는다', async () => {
  mockedGetAppSetting.mockImplementation((key) => {
    if (key === 'album_list_hidden_ids') return Promise.resolve(JSON.stringify(['2']));
    return Promise.resolve(null);
  });
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
  expect(screen.queryByText('가족')).toBeNull();
});

test('설정 화면에서 숨김 변경 알림이 오면 목록을 다시 불러와 반영한다', async () => {
  let hiddenIds: string[] = [];
  mockedGetAppSetting.mockImplementation((key) => {
    if (key === 'album_list_hidden_ids') return Promise.resolve(JSON.stringify(hiddenIds));
    return Promise.resolve(null);
  });
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  mockAlbumCoverPhoto('file:///family.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('가족');

  hiddenIds = ['2'];
  notifyHiddenAlbumIdsChanged();

  await waitFor(() => expect(screen.queryByText('가족')).toBeNull());
  expect(screen.getByText('여행 사진')).toBeTruthy();
});

test("'앱 정보' 메뉴 항목을 누르면 앱 정보 화면으로 이동하고 메뉴가 닫힌다", async () => {
  mockPermission({ state: 'granted' });
  await render(<AlbumListScreen />);
  await screen.findByTestId('album-menu-button');

  await fireEvent.press(screen.getByTestId('album-menu-button'));
  await fireEvent.press(screen.getByTestId('album-menu-appinfo'));

  expect(mockNavigate).toHaveBeenCalledWith('AppInfo');
  expect(screen.queryByText('앱 정보')).toBeNull();
});
