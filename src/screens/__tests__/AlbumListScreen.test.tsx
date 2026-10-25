import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { AlbumListScreen } from '../AlbumListScreen';
import { isBannerLastChildOfRoot } from '../../ads/bannerPlacement';
import { getAppSetting, reconcileAlbumReferenceValidity, setAppSetting } from '../../db/client';
import { useMediaLibraryPermission } from '../../permissions/useMediaLibraryPermission';
import type { UseMediaLibraryPermissionResult } from '../../permissions/useMediaLibraryPermission';
import { notifyAlbumContentsChanged } from '../../library/albumContentsEvents';
import { notifyHiddenFolderPathsChanged } from '../../settings/hiddenFolders';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();
// useFocusEffect는 마운트 시 한 번 실행하고, 테스트가 mockRefocus()로 포커스 복귀를 흉내 낸다.
let mockFocusCallback: (() => void | (() => void)) | null = null;
function mockRefocus() {
  mockFocusCallback?.();
}
jest.mock('@react-navigation/native', () => {
  const { useEffect } = jest.requireActual('react');
  return {
    ...jest.requireActual('@react-navigation/native'),
    useNavigation: () => ({ navigate: mockNavigate, setOptions: mockSetOptions }),
    useFocusEffect: (callback: () => void | (() => void)) => {
      useEffect(() => {
        mockFocusCallback = callback;
        return callback();
      }, [callback]);
    },
  };
});
// 앨범 단위 삭제·이동·복사·이름 변경은 네이티브를 직접 부르므로 경계 모듈째 대체한다(실제 로직은
// photos/__tests__/mediaMutations.test.ts가 검증). 기본값은 미지원 — 파일 관리 describe에서만 켠다.
const mockIsFileManagementAvailable = jest.fn(() => false);
const mockRunAlbumsMutation = jest.fn();
jest.mock('../../photos/mediaMutations', () => ({
  isFileManagementAvailable: () => mockIsFileManagementAvailable(),
  isCopyMutation: (m: { kind: string }) => m.kind.startsWith('copy'),
  runAlbumsMutation: (...args: unknown[]) => mockRunAlbumsMutation(...args),
}));
const mockIsDirectMoveSupported = jest.fn(() => false);
jest.mock('../../photos/fileMover', () => ({
  isDirectMoveSupported: () => mockIsDirectMoveSupported(),
  isAllFilesAccessGranted: () => false,
  openAllFilesAccessSettings: jest.fn(),
}));
jest.mock('../../permissions/useMediaLibraryPermission');
jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
  reconcileAlbumReferenceValidity: jest.fn().mockResolvedValue({ toValid: [], toInvalid: [] }),
}));
jest.mock('expo-media-library', () => ({
  Album: Object.assign(
    jest.fn().mockImplementation((id: string) => ({ id })),
    { getAll: jest.fn().mockResolvedValue([]) }
  ),
  getPermissionsAsync: jest.fn().mockResolvedValue({ granted: false }),
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

function mockAlbumCoverPhoto(uri: string | null, modifiedAt: number | null = null, capturedAt: number | null = null) {
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Query.mockImplementationOnce(() => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: jest.fn().mockResolvedValue(
      uri
        ? [
            {
              getUri: () => Promise.resolve(uri),
              getModificationTime: () => Promise.resolve(modifiedAt),
              getCreationTime: () => Promise.resolve(capturedAt),
            },
          ]
        : []
    ),
  }));
}

// 헤더 우측(navigation.setOptions의 headerRight)에 둔 ⚙ 버튼을 별도 트리로 렌더한다 — 이후 screen이
// 그 트리로 바뀌므로 화면 상호작용을 먼저 끝낸 뒤 호출한다.
async function renderHeaderRight() {
  const calls = mockSetOptions.mock.calls;
  const options = calls[calls.length - 1][0] as { headerRight: () => React.ReactElement };
  return render(options.headerRight());
}

beforeEach(() => {
  mockedGetAppSetting.mockResolvedValue(null);
  mockedSetAppSetting.mockClear();
  mockNavigate.mockClear();
  mockSetOptions.mockClear();
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

// 갤러리에서 영상 권한을 허용하고 돌아오면 영상 전용 폴더가 보여야 한다(목록 화면은 unmount되지 않는다).
test('포커스 복귀 시 영상 권한이 새로 허용됐으면 앨범 목록을 다시 조회한다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.getPermissionsAsync.mockClear().mockResolvedValue({ granted: false });
  mediaLibrary.Album.getAll.mockClear();
  await render(<AlbumListScreen />);
  await waitFor(() => expect(mediaLibrary.getPermissionsAsync).toHaveBeenCalledTimes(1));
  const callsBefore = mediaLibrary.Album.getAll.mock.calls.length;

  mediaLibrary.getPermissionsAsync.mockResolvedValue({ granted: true });
  await act(async () => {
    mockRefocus();
  });

  await waitFor(() => expect(mediaLibrary.Album.getAll.mock.calls.length).toBe(callsBefore + 1));
});

// 갤러리·뷰어에서 사진을 삭제·이동하면 이 화면은 백그라운드에 남아 있어 옛 커버/빈 앨범이 그대로 보인다.
test('앨범 내용 변경 알림(삭제·이동)을 받으면 앨범 목록을 다시 조회한다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.getPermissionsAsync.mockClear().mockResolvedValue({ granted: false });
  mediaLibrary.Album.getAll.mockClear();
  await render(<AlbumListScreen />);
  await waitFor(() => expect(mediaLibrary.getPermissionsAsync).toHaveBeenCalledTimes(1));
  const callsBefore = mediaLibrary.Album.getAll.mock.calls.length;

  await act(async () => {
    notifyAlbumContentsChanged();
  });

  await waitFor(() => expect(mediaLibrary.Album.getAll.mock.calls.length).toBe(callsBefore + 1));
});

test('포커스 복귀 시 영상 권한이 그대로면 앨범 목록을 다시 조회하지 않는다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.getPermissionsAsync.mockClear().mockResolvedValue({ granted: false });
  mediaLibrary.Album.getAll.mockClear();
  await render(<AlbumListScreen />);
  await waitFor(() => expect(mediaLibrary.getPermissionsAsync).toHaveBeenCalledTimes(1));
  const callsBefore = mediaLibrary.Album.getAll.mock.calls.length;

  await act(async () => {
    mockRefocus();
  });

  await waitFor(() => expect(mediaLibrary.getPermissionsAsync).toHaveBeenCalledTimes(2));
  expect(mediaLibrary.Album.getAll.mock.calls.length).toBe(callsBefore);
});

test('앨범 하나의 조회가 실패해도(깨진 MediaStore 버킷 등) 나머지 앨범은 정상 표시된다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.reject(new Error('bucket_display_name null')) },
  ]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  mockAlbumCoverPhoto('file:///broken.jpg');
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

  await render(<AlbumListScreen />);

  expect(await screen.findByText('여행 사진')).toBeTruthy();
  expect(screen.queryByTestId('album-card-2')).toBeNull();
  warnSpy.mockRestore();
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

test('granted 상태면 기기 앨범 id 전체(사진 없는 앨범 포함) 기준으로 참조 무효화를 갱신한다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('Notifications') },
  ]);
  mockAlbumCoverPhoto('file:///thumb.jpg');
  mockAlbumCoverPhoto(null);
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');
  expect(reconcileAlbumReferenceValidity).toHaveBeenCalledWith(['1', '2']);
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

  expect(screen.queryByTestId('album-search-input')).toBeNull();
  await fireEvent.press(screen.getByTestId('album-search-toggle'));
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

  await fireEvent.press(screen.getByTestId('album-search-toggle'));
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

  await fireEvent.press(screen.getByTestId('album-search-toggle'));
  await fireEvent.changeText(screen.getByTestId('album-search-input'), '존재하지않음');

  expect(screen.getByText('검색 결과가 없어요')).toBeTruthy();
  expect(screen.queryByText('여행 사진')).toBeNull();
});

test('검색을 닫으면 검색어가 지워지고 전체 목록이 다시 보이며 다시 열어도 검색어가 남지 않는다', async () => {
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

  await fireEvent.press(screen.getByTestId('album-search-toggle'));
  await fireEvent.changeText(screen.getByTestId('album-search-input'), '여행');
  expect(screen.queryByText('가족')).toBeNull();

  await fireEvent.press(screen.getByTestId('album-search-close'));

  expect(screen.queryByTestId('album-search-input')).toBeNull();
  expect(screen.getByText('여행 사진')).toBeTruthy();
  expect(screen.getByText('가족')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('album-search-toggle'));
  expect(screen.getByTestId('album-search-input').props.value).toBe('');
});

test('툴바에 앨범 개수가 보인다', async () => {
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
  expect(screen.getByTestId('album-summary').props.children).toBe('앨범 2개');
});

test('검색 중에는 툴바가 입력창으로 바뀌어 정렬·보기 버튼이 숨고, 닫으면 돌아온다', async () => {
  mockPermission({ state: 'granted' });
  await render(<AlbumListScreen />);
  await screen.findByTestId('album-search-toggle');
  await fireEvent.press(screen.getByTestId('album-search-toggle'));
  expect(screen.queryByTestId('album-sort-button')).toBeNull();
  expect(screen.queryByTestId('album-view-mode-toggle')).toBeNull();
  await fireEvent.press(screen.getByTestId('album-search-close'));
  expect(screen.getByTestId('album-sort-button')).toBeTruthy();
  expect(screen.getByTestId('album-view-mode-toggle')).toBeTruthy();
});

test('앱 설정은 ⋮ 메뉴가 아니라 헤더 우측 ⚙ 버튼으로 항상 보인다(스크롤 영역 밖)', async () => {
  mockPermission({ state: 'granted' });
  await render(<AlbumListScreen />);
  await screen.findByTestId('album-search-toggle');
  expect(screen.queryByTestId('album-menu-button')).toBeNull();
  expect(screen.queryByTestId('album-menu-settings')).toBeNull();
  expect(mockSetOptions).toHaveBeenCalledWith(expect.objectContaining({ headerRight: expect.any(Function) }));
});

test('헤더의 ⚙ 버튼을 누르면 앱 설정 화면으로 이동한다', async () => {
  mockPermission({ state: 'granted' });
  await render(<AlbumListScreen />);
  await screen.findByTestId('album-search-toggle');
  await renderHeaderRight();
  await fireEvent.press(screen.getByTestId('album-menu-settings'));
  expect(mockNavigate).toHaveBeenCalledWith('AppSettings');
});

test.each(['rationale', 'blocked', 'partial_unsupported'] as const)(
  '권한 안내 화면(%s)에서도 헤더의 앱 설정 버튼은 쓸 수 있다',
  async (state) => {
    mockPermission({ state });
    await render(<AlbumListScreen />);
    await renderHeaderRight();
    await fireEvent.press(screen.getByTestId('album-menu-settings'));
    expect(mockNavigate).toHaveBeenCalledWith('AppSettings');
  }
);

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

  await fireEvent.press(screen.getByTestId('album-sort-button'));
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

  await fireEvent.press(screen.getByTestId('album-sort-button'));
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

  await fireEvent.press(screen.getByTestId('album-sort-button'));

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

  await fireEvent.press(screen.getByTestId('album-sort-button'));

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

  await fireEvent.press(screen.getByTestId('album-sort-button'));
  await fireEvent.press(screen.getByTestId('album-sort-criterion-photo_count'));

  expect(await screen.findByTestId('album-sort-direction-asc')).toBeTruthy();
  expect(cardOrder()).toEqual(['album-card-1', 'album-card-2']);
});

test('기본값은 그리드 뷰이고, 보기 버튼을 누르면 그리드 → 목록 → 날짜별 → 그리드 순으로 순환하며 DB에 저장된다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');
  const label = () => screen.getByTestId('album-view-mode-label').props.children;
  expect(label()).toBe('그리드');

  for (const [expected, saved] of [
    ['목록', 'list'],
    ['날짜별', 'date'],
    ['그리드', 'grid'],
  ]) {
    await fireEvent.press(screen.getByTestId('album-view-mode-toggle'));
    expect(label()).toBe(expected);
    expect(mockedSetAppSetting).toHaveBeenLastCalledWith('album_list_view_mode', saved);
    expect(screen.getByTestId('album-card-1')).toBeTruthy();
    expect(screen.getByText('여행 사진')).toBeTruthy();
  }
});

test('저장된 뷰 모드(app_settings)를 불러와 적용하고 거기서부터 순환한다', async () => {
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
  expect(screen.getByTestId('album-view-mode-label').props.children).toBe('목록');

  await fireEvent.press(screen.getByTestId('album-view-mode-toggle'));

  expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_view_mode', 'date');
});

// 핀치로 열 수를 바꾸는 PanResponder는 루트 View의 start/move capture 핸들러로 붙는다.
function rootHasPinchHandlers(): boolean {
  const json = screen.toJSON() as any;
  const root = Array.isArray(json) ? json[0] : json;
  return typeof root.props.onStartShouldSetResponderCapture === 'function';
}

test('핀치(열 수 조절)는 그리드·날짜별 보기에만 붙고 목록 보기에서는 두 손가락 터치를 가로채지 않는다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');

  expect(rootHasPinchHandlers()).toBe(true); // 그리드
  await fireEvent.press(screen.getByTestId('album-view-mode-toggle'));
  expect(rootHasPinchHandlers()).toBe(false); // 목록
  await fireEvent.press(screen.getByTestId('album-view-mode-toggle'));
  expect(rootHasPinchHandlers()).toBe(true); // 날짜별
});

describe('날짜별 보기와 촬영일 정렬', () => {
  const d = (month: number, day: number) => new Date(2026, month - 1, day, 12).getTime();

  async function renderDateAlbums() {
    mockPermission({ state: 'granted' });
    const mediaLibrary = jest.requireMock('expo-media-library');
    mediaLibrary.Album.getAll.mockResolvedValueOnce([
      { id: '1', getTitle: () => Promise.resolve('수정 10월 · 촬영 8월') },
      { id: '2', getTitle: () => Promise.resolve('수정 9월 · 촬영 9월') },
      { id: '3', getTitle: () => Promise.resolve('수정 9월 · 촬영 없음') },
      { id: '4', getTitle: () => Promise.resolve('날짜 전혀 없음') },
    ]);
    mockAlbumCoverPhoto('file:///a.jpg', d(10, 3), d(8, 1));
    mockAlbumCoverPhoto('file:///b.jpg', d(9, 5), d(9, 2));
    mockAlbumCoverPhoto('file:///c.jpg', d(9, 20), null);
    mockAlbumCoverPhoto('file:///d.jpg', null, null);
    await render(<AlbumListScreen />);
    await screen.findByText('수정 10월 · 촬영 8월');
  }

  test('기본(수정일 기준)은 앨범을 월별로 묶고 최신 월이 먼저, 날짜를 모르는 앨범은 맨 뒤다', async () => {
    mockedGetAppSetting.mockImplementation((key) => Promise.resolve(key === 'album_list_view_mode' ? 'date' : null));
    await renderDateAlbums();
    expect(screen.getByText('2026년 10월')).toBeTruthy();
    expect(screen.getByText('2026년 9월')).toBeTruthy();
    expect(screen.getByText('날짜 없음')).toBeTruthy();
    expect(screen.queryByText('2026년 8월')).toBeNull();
    expect(cardOrder()).toEqual(['album-card-1', 'album-card-2', 'album-card-3', 'album-card-4']);
  });

  test("정렬 기준이 '촬영일'이면 촬영일로 묶고, 촬영일이 없는 앨범은 수정일로 대신한다", async () => {
    mockedGetAppSetting.mockImplementation((key) => {
      if (key === 'album_list_view_mode') return Promise.resolve('date');
      if (key === 'album_list_sort_criterion') return Promise.resolve('captured');
      if (key === 'album_list_sort_direction') return Promise.resolve('desc');
      return Promise.resolve(null);
    });
    await renderDateAlbums();
    // 9월: 촬영 9월(id2) + 촬영 없음→수정 9월(id3), 8월: id1, 날짜 없음: id4
    expect(screen.queryByText('2026년 10월')).toBeNull();
    expect(screen.getByText('2026년 9월')).toBeTruthy();
    expect(screen.getByText('2026년 8월')).toBeTruthy();
    // 섹션은 최신 월 먼저, 섹션 안은 현재 정렬(촬영일 내림차순: id3 수정 9/20 > id2 촬영 9/2)
    expect(cardOrder()).toEqual(['album-card-3', 'album-card-2', 'album-card-1', 'album-card-4']);
  });

  test("정렬 다이얼로그에 '촬영일' 기준이 있고 선택하면 저장된다", async () => {
    await renderDateAlbums();
    await fireEvent.press(screen.getByTestId('album-sort-button'));
    await fireEvent.press(screen.getByTestId('album-sort-criterion-captured'));
    expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_sort_criterion', 'captured');
  });

  test('묶음 기준 안내는 날짜별 보기의 정렬 다이얼로그에서만 보인다', async () => {
    await renderDateAlbums();
    await fireEvent.press(screen.getByTestId('album-sort-button'));
    expect(screen.queryByTestId('album-sort-footnote')).toBeNull();
  });

  test('날짜별 보기의 정렬 다이얼로그에는 어떤 날짜로 묶는지 안내가 보인다', async () => {
    mockedGetAppSetting.mockImplementation((key) => Promise.resolve(key === 'album_list_view_mode' ? 'date' : null));
    await renderDateAlbums();
    await fireEvent.press(screen.getByTestId('album-sort-button'));
    expect(screen.getByTestId('album-sort-footnote').props.children).toContain('촬영일');
  });

  test('촬영일 정렬: 촬영일시가 있으면 그 값, 없으면 수정시각으로 비교한다(내림차순)', async () => {
    mockedGetAppSetting.mockImplementation((key) => {
      if (key === 'album_list_sort_criterion') return Promise.resolve('captured');
      if (key === 'album_list_sort_direction') return Promise.resolve('desc');
      return Promise.resolve(null);
    });
    await renderDateAlbums();
    // 값: id1=8/1, id2=9/2, id3=(수정)9/20, id4=없음(맨 뒤)
    expect(cardOrder()).toEqual(['album-card-3', 'album-card-2', 'album-card-1', 'album-card-4']);
  });
});

test('제외(숨김) 처리된 앨범은 목록에서 보이지 않는다', async () => {
  mockedGetAppSetting.mockImplementation((key) => {
    if (key === 'album_list_hidden_folder_paths') return Promise.resolve(JSON.stringify(['file:///DCIM/family']));
    return Promise.resolve(null);
  });
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumCoverPhoto('file:///DCIM/travel/1.jpg');
  mockAlbumCoverPhoto('file:///DCIM/family/1.jpg');
  await render(<AlbumListScreen />);

  expect(await screen.findByText('여행 사진')).toBeTruthy();
  expect(screen.queryByText('가족')).toBeNull();
});

test('설정 화면에서 숨김 변경 알림이 오면 목록을 다시 불러와 반영한다', async () => {
  let hiddenPaths: string[] = [];
  mockedGetAppSetting.mockImplementation((key) => {
    if (key === 'album_list_hidden_folder_paths') return Promise.resolve(JSON.stringify(hiddenPaths));
    return Promise.resolve(null);
  });
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumCoverPhoto('file:///DCIM/travel/1.jpg');
  mockAlbumCoverPhoto('file:///DCIM/family/1.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('가족');

  hiddenPaths = ['file:///DCIM/family'];
  notifyHiddenFolderPathsChanged();

  await waitFor(() => expect(screen.queryByText('가족')).toBeNull());
  expect(screen.getByText('여행 사진')).toBeTruthy();
});

test('레거시 flat id 숨김 목록을 경로 기반으로 1회 이관한다', async () => {
  mockedGetAppSetting.mockImplementation((key) => {
    if (key === 'album_list_hidden_ids') return Promise.resolve(JSON.stringify(['2']));
    if (key === 'album_list_hidden_folder_paths') return Promise.resolve(null);
    return Promise.resolve(null);
  });
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumCoverPhoto('file:///DCIM/travel/1.jpg');
  mockAlbumCoverPhoto('file:///DCIM/family/1.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');

  await waitFor(() => expect(screen.queryByText('가족')).toBeNull());
  expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_hidden_folder_paths', JSON.stringify(['file:///DCIM/family']));
});

test('앨범을 탭하면 해당 앨범의 갤러리 화면으로 이동한다', async () => {
  mockPermission({ state: 'granted' });
  mockNavigate.mockClear();
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  await render(<AlbumListScreen />);
  fireEvent.press(await screen.findByText('여행 사진'));
  expect(mockNavigate).toHaveBeenCalledWith('AlbumGallery', { deviceAlbumId: '1', displayName: '여행 사진' });
  // 목록에서 설정 화면으로 바로 가는 경로는 없다(갤러리 상단 버튼으로만 진입).
  expect(mockNavigate).not.toHaveBeenCalledWith('AlbumSettings', expect.anything());
});

test('리스트 뷰에서도 앨범을 탭하면 해당 앨범의 갤러리 화면으로 이동한다', async () => {
  mockPermission({ state: 'granted' });
  mockNavigate.mockClear();
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');
  await fireEvent.press(screen.getByTestId('album-view-mode-toggle'));
  fireEvent.press(await screen.findByTestId('album-card-1'));
  expect(mockNavigate).toHaveBeenCalledWith('AlbumGallery', { deviceAlbumId: '1', displayName: '여행 사진' });
});

// FR-AD: 배너 광고는 화면 맨 아래(루트 View의 마지막 자식)에 붙는다 — 갤러리 도입 이후에도 이
// 위치가 바뀌지 않는지 고정한다. 현재 동작: 배너는 목록 본문(AlbumListContent)에만 있고,
// 권한 안내(rationale/blocked/partial_unsupported)·로딩 화면에는 없다.
test('granted 상태의 목록 화면에서 banner-ad가 루트 View의 마지막 자식이다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumCoverPhoto('file:///travel.jpg');
  await render(<AlbumListScreen />);
  await screen.findByText('여행 사진');
  expect(screen.getByTestId('banner-ad')).toBeTruthy();
  expect(isBannerLastChildOfRoot(screen.toJSON() as any)).toBe(true);
});

test('앨범이 하나도 없는 빈 목록에서도 banner-ad가 루트 View의 마지막 자식이다', async () => {
  mockPermission({ state: 'granted' });
  await render(<AlbumListScreen />);
  await waitFor(() => expect(screen.getByTestId('banner-ad')).toBeTruthy());
  expect(isBannerLastChildOfRoot(screen.toJSON() as any)).toBe(true);
});

test.each(['rationale', 'blocked', 'partial_unsupported'] as const)(
  '권한 안내 화면(%s)에는 banner-ad가 없다',
  async (state) => {
    mockPermission({ state });
    await render(<AlbumListScreen />);
    expect(screen.queryByTestId('banner-ad')).toBeNull();
  }
);

// FR-A1: 사진이 없고 영상만 있는 폴더는 영상 권한이 있어 영상 행이 조회될 때만 목록에 나타난다.
function mockAlbumCoverVideoOnly(uri: string | null) {
  // 첫 Query(사진)는 비어 있고, 두 번째 Query(영상)가 결과를 돌려준다.
  const mediaLibrary = jest.requireMock('expo-media-library');
  const emptyQuery = () => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: jest.fn().mockResolvedValue([]),
  });
  mediaLibrary.Query.mockImplementationOnce(emptyQuery);
  mediaLibrary.Query.mockImplementationOnce(() => ({
    ...emptyQuery(),
    exe: jest
      .fn()
      .mockResolvedValue(
        uri
          ? [
              {
                getUri: () => Promise.resolve(uri),
                getModificationTime: () => Promise.resolve(null),
                getCreationTime: () => Promise.resolve(null),
              },
            ]
          : []
      ),
  }));
}

test('영상 권한으로 영상 행이 조회되면 영상 전용 폴더가 목록에 나타난다(영상 프레임 커버)', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '9', getTitle: () => Promise.resolve('영상 폴더') }]);
  mockAlbumCoverVideoOnly('file:///storage/emulated/0/Movies/clip.mp4');
  await render(<AlbumListScreen />);
  expect(await screen.findByText('영상 폴더')).toBeTruthy();
  expect(screen.getByTestId('album-video-cover-9')).toBeTruthy();
  expect(screen.queryByTestId('album-thumbnail-9')).toBeNull();
  expect(screen.getByTestId('album-video-frame-9').props.source).toEqual({
    uri: 'file:///storage/emulated/0/Movies/clip.mp4',
  });
});

test('영상 프레임을 못 그리면 영상 커버가 아이콘으로 대체된다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '9', getTitle: () => Promise.resolve('영상 폴더') }]);
  mockAlbumCoverVideoOnly('file:///storage/emulated/0/Movies/clip.mp4');
  await render(<AlbumListScreen />);
  await screen.findByText('영상 폴더');

  await act(async () => {
    screen.getByTestId('album-video-frame-9').props.onError();
  });

  expect(screen.queryByTestId('album-video-frame-9')).toBeNull();
  expect(screen.getByText('🎞')).toBeTruthy();
});

test('영상 권한이 없어 영상 행이 조회되지 않으면 영상 전용 폴더는 나타나지 않는다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '9', getTitle: () => Promise.resolve('영상 폴더') }]);
  mockAlbumCoverVideoOnly(null);
  await render(<AlbumListScreen />);
  await waitFor(() => expect(screen.getByText('사진 앨범이 없어요')).toBeTruthy());
  expect(screen.queryByText('영상 폴더')).toBeNull();
});

test('영상 전용 폴더를 탭하면 갤러리로 이동한다', async () => {
  mockPermission({ state: 'granted' });
  mockNavigate.mockClear();
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '9', getTitle: () => Promise.resolve('영상 폴더') }]);
  mockAlbumCoverVideoOnly('file:///storage/emulated/0/Movies/clip.mp4');
  await render(<AlbumListScreen />);
  await fireEvent.press(await screen.findByText('영상 폴더'));
  expect(mockNavigate).toHaveBeenCalledWith('AlbumGallery', { deviceAlbumId: '9', displayName: '영상 폴더' });
});

test('사진과 영상이 모두 없는 폴더(오디오 전용 등)는 계속 목록에서 제외된다', async () => {
  mockPermission({ state: 'granted' });
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '3', getTitle: () => Promise.resolve('알림음') }]);
  mockAlbumCoverVideoOnly(null);
  await render(<AlbumListScreen />);
  await waitFor(() => expect(screen.getByText('사진 앨범이 없어요')).toBeTruthy());
});

describe('앨범 단위 파일 관리(삭제·이동·복사·이름 변경)', () => {
  const MOVE_CACHE = JSON.stringify([
    { id: '1', title: '여행', folderPath: 'file:///storage/emulated/0/Pictures/travel' },
    { id: '2', title: '가족', folderPath: 'file:///storage/emulated/0/Pictures/family' },
    { id: '3', title: '문서', folderPath: 'file:///storage/emulated/0/Pictures/docs' },
  ]);

  async function renderTwoAlbums() {
    mockPermission({ state: 'granted' });
    const mediaLibrary = jest.requireMock('expo-media-library');
    mediaLibrary.Album.getAll.mockResolvedValueOnce([
      { id: '1', getTitle: () => Promise.resolve('여행') },
      { id: '2', getTitle: () => Promise.resolve('가족') },
    ]);
    mockAlbumCoverPhoto('file:///storage/emulated/0/Pictures/travel/a.jpg');
    mockAlbumCoverPhoto('file:///storage/emulated/0/Pictures/family/b.jpg');
    await render(<AlbumListScreen />);
    await screen.findByText('여행');
  }

  beforeEach(() => {
    mockIsFileManagementAvailable.mockReturnValue(true);
    mockRunAlbumsMutation.mockReset();
    mockedGetAppSetting.mockImplementation(async (key: string) => (key === 'album_thumbnail_cache' ? MOVE_CACHE : null));
  });

  afterEach(() => {
    mockIsFileManagementAvailable.mockReturnValue(false);
    mockIsDirectMoveSupported.mockReturnValue(false);
  });

  test('지원하지 않는 환경에서는 길게 눌러도 선택 모드가 켜지지 않는다', async () => {
    mockIsFileManagementAvailable.mockReturnValue(false);
    await renderTwoAlbums();
    await fireEvent(screen.getByTestId('album-card-1'), 'longPress');
    expect(screen.queryByTestId('selection-bar')).toBeNull();
  });

  test('길게 누르면 선택 모드가 되고, 탭은 열기가 아니라 선택 토글이며, ✕로 끈다', async () => {
    await renderTwoAlbums();
    await fireEvent(screen.getByTestId('album-card-1'), 'longPress');
    expect(screen.getByTestId('selection-bar')).toBeTruthy();
    expect(screen.getByTestId('selection-count')).toHaveTextContent('1개 선택');
    expect(screen.getByTestId('album-select-check-1')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('album-card-2'));
    expect(screen.getByTestId('selection-count')).toHaveTextContent('2개 선택');
    expect(mockNavigate).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('album-card-2'));
    expect(screen.queryByTestId('album-select-check-2')).toBeNull();

    await fireEvent.press(screen.getByTestId('selection-cancel'));
    expect(screen.queryByTestId('selection-bar')).toBeNull();
  });

  test('삭제: 선택한 앨범들을 한 번에 요청하고, 성공하면 선택 모드가 끝난다', async () => {
    mockRunAlbumsMutation.mockResolvedValue({
      summary: { removedIds: ['a', 'b'], remainingIds: [] },
      error: null,
      emptiedAlbumIds: ['1', '2'],
    });
    await renderTwoAlbums();
    await fireEvent(screen.getByTestId('album-card-1'), 'longPress');
    await fireEvent.press(screen.getByTestId('album-card-2'));
    await fireEvent.press(screen.getByTestId('selection-delete'));
    expect(mockRunAlbumsMutation).toHaveBeenCalledWith(['1', '2'], { kind: 'delete' });
    await waitFor(() => expect(screen.queryByTestId('selection-bar')).toBeNull());
  });

  test('취소/실패하면 선택이 유지되고 이유를 안내한다', async () => {
    mockRunAlbumsMutation.mockResolvedValue({
      summary: { removedIds: [], remainingIds: ['a'] },
      error: new Error("User didn't grant write permission to requested files."),
      emptiedAlbumIds: [],
    });
    await renderTwoAlbums();
    await fireEvent(screen.getByTestId('album-card-1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-delete'));
    expect(await screen.findByTestId('album-mutation-notice')).toBeTruthy();
    expect(screen.getByTestId('selection-bar')).toBeTruthy();
  });

  test('이동: 대상 목록에서 선택한 앨범들을 빼고, 고르면 move 작업을 실행한다', async () => {
    mockRunAlbumsMutation.mockResolvedValue({
      summary: { removedIds: ['a'], remainingIds: [] },
      error: null,
      emptiedAlbumIds: ['1', '2'],
    });
    await renderTwoAlbums();
    await fireEvent(screen.getByTestId('album-card-1'), 'longPress');
    await fireEvent.press(screen.getByTestId('album-card-2'));
    await fireEvent.press(screen.getByTestId('selection-move'));
    expect(await screen.findByTestId('move-target-3')).toBeTruthy();
    expect(screen.queryByTestId('move-target-1')).toBeNull();
    expect(screen.queryByTestId('move-target-2')).toBeNull();
    await fireEvent.press(screen.getByTestId('move-target-3'));
    expect(mockRunAlbumsMutation).toHaveBeenCalledWith(['1', '2'], { kind: 'move', targetAlbumId: '3' });
  });

  test('복사: 완료 안내가 뜨고 선택 모드가 끝난다', async () => {
    mockRunAlbumsMutation.mockResolvedValue({
      summary: { removedIds: ['a', 'b', 'c'], remainingIds: [] },
      error: null,
      emptiedAlbumIds: [],
    });
    await renderTwoAlbums();
    await fireEvent(screen.getByTestId('album-card-1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-copy'));
    await fireEvent.press(await screen.findByTestId('move-target-3'));
    expect(mockRunAlbumsMutation).toHaveBeenCalledWith(['1'], { kind: 'copy', targetAlbumId: '3' });
    expect(await screen.findByText('3개를 복사했어요')).toBeTruthy();
    expect(screen.queryByTestId('selection-bar')).toBeNull();
  });

  test('이름 변경은 앨범이 1개일 때만 보이고, 같은 상위 폴더의 새 이름으로 옮긴다', async () => {
    mockRunAlbumsMutation.mockResolvedValue({
      summary: { removedIds: ['a'], remainingIds: [] },
      error: null,
      emptiedAlbumIds: ['1'],
    });
    await renderTwoAlbums();
    await fireEvent(screen.getByTestId('album-card-1'), 'longPress');
    expect(screen.getByTestId('selection-rename')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('album-card-2'));
    expect(screen.queryByTestId('selection-rename')).toBeNull();
    await fireEvent.press(screen.getByTestId('album-card-2'));

    await fireEvent.press(screen.getByTestId('selection-rename'));
    expect(screen.getByTestId('rename-input').props.value).toBe('여행');
    // 같은 상위 폴더(Pictures)에 이미 있는 폴더 이름(family)으로는 바꿀 수 없다.
    await fireEvent.changeText(screen.getByTestId('rename-input'), 'family');
    expect(screen.getByTestId('rename-error')).toBeTruthy();
    expect(screen.getByTestId('rename-confirm').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('rename-input'), '제주 여행');
    await fireEvent.press(screen.getByTestId('rename-confirm'));
    // 앨범이 Pictures 아래라 권한 없이 MediaStore로 새 이름 폴더를 만들며 옮긴다.
    expect(mockRunAlbumsMutation).toHaveBeenCalledWith(['1'], { kind: 'moveToNew', folderName: '제주 여행' });
  });

  test('Pictures 밖 앨범의 이름 변경은 모든 파일 접근 안내를 거쳐 직접 이동으로 간다', async () => {
    mockIsDirectMoveSupported.mockReturnValue(true);
    mockPermission({ state: 'granted' });
    const mediaLibrary = jest.requireMock('expo-media-library');
    mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '7', getTitle: () => Promise.resolve('Private') }]);
    mockAlbumCoverPhoto('file:///storage/emulated/0/_MyData/Photo/Private/a.jpg');
    await render(<AlbumListScreen />);
    await screen.findByText('Private');
    await fireEvent(screen.getByTestId('album-card-7'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-rename'));
    await fireEvent.changeText(screen.getByTestId('rename-input'), 'Secret');
    await fireEvent.press(screen.getByTestId('rename-confirm'));
    expect(await screen.findByTestId('all-files-access-why')).toBeTruthy();
    expect(mockRunAlbumsMutation).not.toHaveBeenCalled();
  });

  test('선택 모드에서도 banner-ad는 루트 View의 마지막 자식이다', async () => {
    await renderTwoAlbums();
    await fireEvent(screen.getByTestId('album-card-1'), 'longPress');
    expect(isBannerLastChildOfRoot(screen.toJSON() as any)).toBe(true);
  });
});
