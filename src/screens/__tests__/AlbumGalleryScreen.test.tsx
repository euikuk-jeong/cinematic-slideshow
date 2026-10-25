import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { AlbumGalleryScreen } from '../AlbumGalleryScreen';
import { isBannerLastChildOfRoot } from '../../ads/bannerPlacement';
import * as db from '../../db/client';
import { useMediaLibraryPermission } from '../../permissions/useMediaLibraryPermission';
import type { UseMediaLibraryPermissionResult } from '../../permissions/useMediaLibraryPermission';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();
// 실제 usePreventRemove는 네비게이터 컨텍스트가 필요하다 — 마지막으로 등록된 (prevent, callback)만 캡처한다.
const mockUsePreventRemove = jest.fn();

// 삭제·이동은 네이티브(expo-media-library)를 직접 부르므로 경계 모듈째 대체한다(실제 로직은
// photos/__tests__/mediaMutations.test.ts가 검증). 기본값은 미지원 — 파일 관리 describe에서만 켠다.
const mockIsFileManagementAvailable = jest.fn(() => false);
const mockRunMediaMutation = jest.fn();
jest.mock('../../photos/mediaMutations', () => ({
  isFileManagementAvailable: () => mockIsFileManagementAvailable(),
  runMediaMutation: (...args: unknown[]) => mockRunMediaMutation(...args),
}));

// 실제 useFocusEffect는 NavigationContainer의 focus 이벤트에 의존하는데 이 테스트는 네비게이터
// 없이 컴포넌트만 렌더링한다 — mount 시 한 번 포커스된 것처럼 콜백을 실행하고, 테스트에서
// 다시 포커스된 상황을 흉내낼 수 있게 콜백을 캡처한다.
let mockFocusCallback: (() => void | (() => void)) | null = null;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  usePreventRemove: (prevent: boolean, callback: () => void) => mockUsePreventRemove(prevent, callback),
  useFocusEffect: (callback: () => void | (() => void)) => {
    mockFocusCallback = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

jest.mock('../../permissions/useMediaLibraryPermission');

jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
  // 갤러리는 조회·정렬·검색·보기 전환·앨범 설정 이동만으로는 albums row를 만들지 않는다(FR-N3) —
  // 슬라이드쇼를 바로 재생할 때만 albumSetup.prepareAlbumForPlayback이 아래 함수들을 호출한다.
  getAlbumByDeviceId: jest.fn(),
  insertAlbum: jest.fn(),
  updateAlbumDisplayName: jest.fn(),
  getSlideshowSettingsByAlbumId: jest.fn(),
  getSlideshowDefaults: jest.fn(),
  getDefaultMusicTracks: jest.fn(),
  upsertSlideshowSettings: jest.fn(),
  upsertMusicTrack: jest.fn(),
  setSlideshowMusicTracks: jest.fn(),
}));

interface FakeMeta {
  id: string;
  filename: string | null;
  mediaType: 'image' | 'video' | 'audio';
  width: number | null;
  height: number | null;
  duration: number | null;
  creationTime: number | null;
  modificationTime: number | null;
}

let mockQueryResult: FakeMeta[] = [];
let mockQueryImpl: (() => Promise<FakeMeta[]>) | null = null;
const mockExeForMetadata = jest.fn();
const mockWithin = jest.fn();
const mockGetUri = jest.fn();

jest.mock('expo-media-library', () => ({
  Album: jest.fn().mockImplementation((id: string) => ({ id })),
  Query: jest.fn().mockImplementation(() => {
    const q = {
      album: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      within: (field: string, values: string[]) => {
        mockWithin(field, values);
        mockFilterTypes = values;
        return q;
      },
      exeForMetadata: () => {
        mockExeForMetadata();
        const result = mockQueryImpl ? mockQueryImpl() : Promise.resolve(mockQueryResult);
        return result.then((rows) => rows.filter((r) => mockFilterTypes.includes(r.mediaType)));
      },
    };
    return q;
  }),
  Asset: jest.fn().mockImplementation((id: string) => ({ getUri: () => mockGetUri(id) })),
  AssetField: { MEDIA_TYPE: 'mediaType' },
  MediaType: { IMAGE: 'image', VIDEO: 'video', AUDIO: 'audio' },
}));
let mockFilterTypes: string[] = [];

const mockedDb = db as jest.Mocked<typeof db>;
const mockedUsePermission = useMediaLibraryPermission as jest.MockedFunction<typeof useMediaLibraryPermission>;

function mockVideoPermission(overrides: Partial<UseMediaLibraryPermissionResult> = {}) {
  const result: UseMediaLibraryPermissionResult = {
    state: 'granted',
    isReady: true,
    start: jest.fn(),
    confirmRationale: jest.fn().mockResolvedValue(undefined),
    cancelRationale: jest.fn(),
    openSettings: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  mockedUsePermission.mockReturnValue(result);
  return result;
}

const routeProps = {
  route: { params: { deviceAlbumId: 'device-album-1', displayName: '여행 사진' } },
  navigation: { navigate: mockNavigate, setOptions: mockSetOptions },
} as any;

function img(id: string, filename: string | null, creationTime: number | null, extra: Partial<FakeMeta> = {}): FakeMeta {
  return { id, filename, mediaType: 'image', width: 100, height: 100, duration: null, creationTime, modificationTime: 1, ...extra };
}
function vid(id: string, creationTime: number | null, duration: number | null): FakeMeta {
  return { id, filename: `${id}.mp4`, mediaType: 'video', width: 100, height: 100, duration, creationTime, modificationTime: 1 };
}

let settingStore: Record<string, string>;

// 슬라이드쇼 버튼은 헤더 우측(navigation.setOptions의 headerRight)으로 렌더된다 — 가장 최근에
// 설정된 headerRight를 별도 트리로 렌더해 버튼을 얻는다(screen이 이 트리로 바뀌므로 화면 상호작용을
// 먼저 끝낸 뒤 호출한다).
async function renderHeaderRight() {
  const calls = mockSetOptions.mock.calls;
  const options = calls[calls.length - 1][0] as { headerRight: () => React.ReactElement };
  return render(options.headerRight());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockQueryResult = [];
  mockQueryImpl = null;
  mockFocusCallback = null;
  mockIsFileManagementAvailable.mockReturnValue(false);
  settingStore = {};
  mockVideoPermission();
  mockedDb.getAppSetting.mockImplementation(async (key: string) => settingStore[key] ?? null);
  mockedDb.setAppSetting.mockImplementation(async (key: string, value: string) => {
    settingStore[key] = value;
  });
  mockGetUri.mockImplementation((id: string) => Promise.resolve(`file:///${id}.jpg`));
  mockedDb.getAlbumByDeviceId.mockResolvedValue(null);
  mockedDb.insertAlbum.mockResolvedValue({ id: 42, deviceAlbumId: 'device-album-1', displayName: '여행 사진' } as any);
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(null);
  mockedDb.getSlideshowDefaults.mockResolvedValue({
    transitionIntervalSec: 5,
    orderMode: 'sequential',
    repeatMode: 'once',
    sortCriterion: 'creation_time',
    sortDirection: 'asc',
  } as any);
  mockedDb.getDefaultMusicTracks.mockResolvedValue([]);
  mockedDb.upsertSlideshowSettings.mockResolvedValue({ id: 99 } as any);
  mockedDb.upsertMusicTrack.mockResolvedValue({ id: 5 } as any);
  mockedDb.setSlideshowMusicTracks.mockResolvedValue(undefined);
});

function tileOrder(): string[] {
  return screen.getAllByTestId(/^gallery-item-/).map((node) => node.props.testID.replace('gallery-item-', ''));
}

describe('조회', () => {
  test('사진·영상만 렌더하고 오디오는 렌더하지 않는다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100), vid('v1', 200, 5000), { ...img('a1', 'x.mp3', 300), mediaType: 'audio' }];
    await render(<AlbumGalleryScreen {...routeProps} />);
    expect(await screen.findByTestId('gallery-item-p1')).toBeTruthy();
    expect(screen.getByTestId('gallery-item-v1')).toBeTruthy();
    expect(screen.queryByTestId('gallery-item-a1')).toBeNull();
    expect(mockExeForMetadata).toHaveBeenCalledTimes(1);
    expect(mockWithin).toHaveBeenCalledWith('mediaType', ['image', 'video']);
  });

  test('마운트 시 조회는 한 번만 일어나고 getInfo는 쓰지 않는다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(mockExeForMetadata).toHaveBeenCalledTimes(1);
  });

  test('로딩 중에는 스피너를 보여준다', async () => {
    mockQueryImpl = () => new Promise(() => {});
    await render(<AlbumGalleryScreen {...routeProps} />);
    expect(screen.getByTestId('gallery-loading')).toBeTruthy();
  });

  test('빈 앨범이면 안내 문구를 보여준다', async () => {
    mockQueryResult = [];
    await render(<AlbumGalleryScreen {...routeProps} />);
    expect(await screen.findByText('표시할 사진이 없습니다')).toBeTruthy();
  });

  test('조회가 실패하면 안내와 재시도 버튼을 보여주고, 재시도하면 복구된다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockQueryImpl = () => Promise.reject(new Error('boom'));
    await render(<AlbumGalleryScreen {...routeProps} />);
    expect(await screen.findByText('사진을 불러오지 못했어요')).toBeTruthy();
    expect(warn).toHaveBeenCalled();

    mockQueryImpl = null;
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await fireEvent.press(screen.getByTestId('gallery-retry'));
    expect(await screen.findByTestId('gallery-item-p1')).toBeTruthy();
    expect(mockExeForMetadata).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  test('화면에 다시 포커스되면 재조회해 새 사진을 반영한다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    mockQueryResult = [img('p1', 'a.jpg', 100), img('p2', 'b.jpg', 200)];
    mockFocusCallback!();
    expect(await screen.findByTestId('gallery-item-p2')).toBeTruthy();
    expect(mockExeForMetadata).toHaveBeenCalledTimes(2);
  });

  test('재조회 도중 언마운트돼도 예외 없이 끝난다', async () => {
    let resolveQuery: (rows: FakeMeta[]) => void = () => {};
    mockQueryImpl = () => new Promise((r) => (resolveQuery = r));
    const view = await render(<AlbumGalleryScreen {...routeProps} />);
    await view.unmount();
    resolveQuery([img('p1', 'a.jpg', 100)]);
    await Promise.resolve();
  });
});

describe('정렬·보기·설정 저장', () => {
  const items = [img('old', 'img10.jpg', 100), img('mid', 'img2.jpg', 200), img('new', 'img1.jpg', 300), img('nodate', null, null)];

  test('기본값은 촬영시간 내림차순·그리드이며 날짜 없는 항목은 맨 뒤다', async () => {
    mockQueryResult = items;
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-new');
    expect(tileOrder()).toEqual(['new', 'mid', 'old', 'nodate']);
  });

  test('저장된 설정(파일명·오름차순)이 초기 렌더에 반영되고 자연수 순서로 정렬된다', async () => {
    settingStore = { gallery_sort_criterion: 'filename', gallery_sort_direction: 'asc' };
    mockQueryResult = items;
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-new');
    // img1 < img2 < img10, 파일명 없는 항목은 맨 뒤
    expect(tileOrder()).toEqual(['new', 'mid', 'old', 'nodate']);
  });

  test('정렬 기준을 파일명으로 바꾸면 재배열되고 저장된다', async () => {
    mockQueryResult = items;
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-new');
    await fireEvent.press(screen.getByTestId('gallery-sort-button'));
    await fireEvent.press(screen.getByTestId('gallery-sort-criterion-filename'));
    await fireEvent.press(screen.getByTestId('gallery-sort-direction-asc'));
    expect(tileOrder()).toEqual(['new', 'mid', 'old', 'nodate']);
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('gallery_sort_criterion', 'filename');
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('gallery_sort_direction', 'asc');
  });

  test('정렬 다이얼로그는 항목을 눌러도 닫히지 않고 정렬 버튼은 스크롤 영역 밖 툴바에 있다', async () => {
    mockQueryResult = items;
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-new');
    expect(screen.queryByTestId('gallery-sort-criterion-filename')).toBeNull();
    await fireEvent.press(screen.getByTestId('gallery-sort-button'));
    await fireEvent.press(screen.getByTestId('gallery-sort-criterion-filename'));
    expect(screen.getByTestId('gallery-sort-direction-desc')).toBeTruthy();
  });

  test('날짜별 보기에서 촬영일이 없는 항목은 수정시각 날짜 섹션으로 묶인다', async () => {
    const day1 = new Date(2026, 9, 1, 12).getTime();
    const day2 = new Date(2026, 9, 2, 12).getTime();
    mockQueryResult = [img('a', 'a.jpg', day1), img('m', 'm.jpg', null, { modificationTime: day2 })];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-a');
    await fireEvent.press(screen.getByTestId('gallery-view-mode-toggle'));
    await fireEvent.press(screen.getByTestId('gallery-view-mode-toggle'));
    expect(await screen.findByText('2026년 10월 2일')).toBeTruthy();
    expect(screen.queryByText('날짜 없음')).toBeNull();
    expect(tileOrder()).toEqual(['m', 'a']);
  });

  test('날짜별 보기로 전환하면 섹션 헤더가 보이고 저장된다', async () => {
    const day1 = new Date(2026, 9, 1, 12).getTime();
    const day2 = new Date(2026, 9, 2, 12).getTime();
    mockQueryResult = [img('a', 'a.jpg', day1), img('b', 'b.jpg', day2), img('n', 'n.jpg', null, { modificationTime: null })];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-a');
    // 보기 버튼은 그리드 → 목록 → 날짜별 순으로 순환한다.
    await fireEvent.press(screen.getByTestId('gallery-view-mode-toggle'));
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('gallery_view_mode', 'list');
    await fireEvent.press(screen.getByTestId('gallery-view-mode-toggle'));
    expect(await screen.findByText('2026년 10월 2일')).toBeTruthy();
    expect(screen.getByText('2026년 10월 1일')).toBeTruthy();
    expect(screen.getByText('날짜 없음')).toBeTruthy();
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('gallery_view_mode', 'date');
    expect(tileOrder()).toEqual(['b', 'a', 'n']);
  });

  test('보기 버튼은 날짜별 다음에 다시 그리드로 돌아가고 현재 보기 이름을 보여준다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    const label = () => screen.getByTestId('gallery-view-mode-label').props.children;
    expect(label()).toBe('그리드');
    for (const expected of ['목록', '날짜별', '그리드']) {
      await fireEvent.press(screen.getByTestId('gallery-view-mode-toggle'));
      expect(label()).toBe(expected);
    }
    expect(mockedDb.setAppSetting).toHaveBeenLastCalledWith('gallery_view_mode', 'grid');
  });

  test('핀치(열 수 조절)는 그리드·날짜별 보기에만 붙고 목록 보기에서는 붙지 않는다', async () => {
    const rootHasPinch = () => {
      const json = screen.toJSON() as any;
      const root = Array.isArray(json) ? json[0] : json;
      return typeof root.props.onStartShouldSetResponderCapture === 'function';
    };
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(rootHasPinch()).toBe(true); // 그리드
    await fireEvent.press(screen.getByTestId('gallery-view-mode-toggle'));
    expect(rootHasPinch()).toBe(false); // 목록
    await fireEvent.press(screen.getByTestId('gallery-view-mode-toggle'));
    expect(rootHasPinch()).toBe(true); // 날짜별
  });

  test('저장된 목록 보기가 초기 렌더에 반영된다', async () => {
    settingStore = { gallery_view_mode: 'list' };
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.getByTestId('gallery-filename-p1')).toBeTruthy();
    expect(within(screen.getByTestId('gallery-view-mode-toggle')).getByText('목록')).toBeTruthy();
  });

  test('저장된 열 수가 반영된다', async () => {
    settingStore = { gallery_grid_columns: '5' };
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    // 5열이면 타일 한 변 = (창 폭 - 패딩 6 - 간격 12) / 5
    const style = StyleSheetFlatten(screen.getByTestId('gallery-item-p1').props.style);
    expect(style.width).toBeCloseTo((750 - 6 - 3 * 4) / 5, 0);
  });
});

function StyleSheetFlatten(style: unknown): { width: number } {
  const { StyleSheet } = require('react-native');
  return StyleSheet.flatten(style);
}

describe('타일', () => {
  test('영상 타일은 재생시간 배지(m:ss)를 보여주고 사진 타일은 배지가 없다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100), vid('v1', 200, 65000)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(within(screen.getByTestId('video-badge-v1')).getByText('▶ 1:05')).toBeTruthy();
    expect(screen.queryByTestId('video-badge-p1')).toBeNull();
  });

  test('영상 길이가 없어도 아이콘만으로 렌더된다', async () => {
    mockQueryResult = [vid('v1', 200, null)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    expect(await screen.findByText('▶')).toBeTruthy();
  });

  test('한 asset의 uri 조회가 실패하면 그 타일만 오류 표시가 되고 나머지는 정상이다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockQueryResult = [img('good', 'a.jpg', 200), img('bad', 'b.jpg', 100)];
    mockGetUri.mockImplementation((id: string) => (id === 'bad' ? Promise.reject(new Error('gone')) : Promise.resolve(`file:///${id}.jpg`)));
    await render(<AlbumGalleryScreen {...routeProps} />);
    expect(await screen.findByTestId('thumb-error-bad')).toBeTruthy();
    expect(screen.getByTestId('gallery-item-bad')).toBeTruthy();
    expect(screen.queryByTestId('thumb-error-good')).toBeNull();
    warn.mockRestore();
  });

  test('사진 타일을 탭하면 현재 정렬/보기 컨텍스트와 함께 뷰어로 이동한다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await fireEvent.press(await screen.findByTestId('gallery-item-p1'));
    expect(mockNavigate).toHaveBeenCalledWith('PhotoViewer', {
      deviceAlbumId: 'device-album-1',
      displayName: '여행 사진',
      initialAssetId: 'p1',
      sortCriterion: 'creation_time',
      sortDirection: 'desc',
      viewMode: 'grid',
      searchQuery: '',
    });
  });

  test('검색 중에 연 뷰어에는 검색어가 넘어가고, 검색을 닫은 뒤에는 넘어가지 않는다', async () => {
    mockQueryResult = [img('p1', 'beach.jpg', 100), img('p2', 'city.jpg', 200)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    await fireEvent.changeText(screen.getByTestId('gallery-search-input'), 'beach');
    await fireEvent.press(await screen.findByTestId('gallery-item-p1'));
    expect(mockNavigate).toHaveBeenLastCalledWith(
      'PhotoViewer',
      expect.objectContaining({ initialAssetId: 'p1', searchQuery: 'beach' })
    );

    await fireEvent.press(screen.getByTestId('gallery-search-close'));
    await fireEvent.press(await screen.findByTestId('gallery-item-p2'));
    expect(mockNavigate).toHaveBeenLastCalledWith(
      'PhotoViewer',
      expect.objectContaining({ initialAssetId: 'p2', searchQuery: '' })
    );
  });

  test('영상 타일을 탭했는데 외부 플레이어를 쓸 수 없으면(Android 아님 등) 뷰어로 이동한다', async () => {
    mockQueryResult = [vid('v1', 100, 1000)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await fireEvent.press(await screen.findByTestId('gallery-item-v1'));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('PhotoViewer', expect.objectContaining({ initialAssetId: 'v1' }))
    );
  });

  describe('Android 영상 타일', () => {
    const { Platform } = jest.requireActual('react-native');
    const { startActivityAsync } = jest.requireMock('expo-intent-launcher') as { startActivityAsync: jest.Mock };
    const VIDEO_ID = 'content://media/external/video/media/5';
    let originalOS: string;

    beforeEach(() => {
      originalOS = Platform.OS;
      Platform.OS = 'android';
      startActivityAsync.mockReset().mockResolvedValue({ resultCode: 0 });
    });
    afterEach(() => {
      Platform.OS = originalOS;
    });

    test('탭하면 뷰어를 거치지 않고 바로 다른 플레이어 앱으로 연다', async () => {
      mockQueryResult = [vid(VIDEO_ID, 100, 1000)];
      await render(<AlbumGalleryScreen {...routeProps} />);
      await fireEvent.press(await screen.findByTestId(`gallery-item-${VIDEO_ID}`));

      await waitFor(() =>
        expect(startActivityAsync).toHaveBeenCalledWith(
          'android.intent.action.VIEW',
          expect.objectContaining({ data: VIDEO_ID, type: 'video/*' })
        )
      );
      expect(mockNavigate).not.toHaveBeenCalledWith('PhotoViewer', expect.anything());
    });

    test('열 수 있는 앱이 없어 실행에 실패하면 뷰어(내장 플레이어)로 간다', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      startActivityAsync.mockRejectedValue(new Error('No Activity found'));
      mockQueryResult = [vid(VIDEO_ID, 100, 1000)];
      await render(<AlbumGalleryScreen {...routeProps} />);
      await fireEvent.press(await screen.findByTestId(`gallery-item-${VIDEO_ID}`));

      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('PhotoViewer', expect.objectContaining({ initialAssetId: VIDEO_ID }))
      );
      warn.mockRestore();
    });

    test('사진 타일은 외부 플레이어를 열지 않는다', async () => {
      mockQueryResult = [img('p1', 'a.jpg', 100)];
      await render(<AlbumGalleryScreen {...routeProps} />);
      await fireEvent.press(await screen.findByTestId('gallery-item-p1'));

      expect(startActivityAsync).not.toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith('PhotoViewer', expect.objectContaining({ initialAssetId: 'p1' }));
    });
  });

  test('선택 모드(체크박스) UI가 없다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.queryByTestId('select-mode')).toBeNull();
  });
});

describe('파일명 표시', () => {
  test('그리드(3열 이하)에서는 사진·영상 타일에 파일명이 보인다', async () => {
    mockQueryResult = [img('p1', 'beach.jpg', 100), vid('v1', 200, 5000)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.getByTestId('gallery-filename-p1').props.children).toBe('beach.jpg');
    expect(screen.getByTestId('gallery-filename-v1').props.children).toBe('v1.mp4');
  });

  test('4열 이상이면 타일이 작아 파일명을 숨긴다', async () => {
    settingStore = { gallery_grid_columns: '4' };
    mockQueryResult = [img('p1', 'beach.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.queryByTestId('gallery-filename-p1')).toBeNull();
  });

  test('날짜별 보기 타일에도 파일명이 보인다', async () => {
    settingStore = { gallery_view_mode: 'date' };
    mockQueryResult = [img('p1', 'beach.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.getByTestId('gallery-filename-p1').props.children).toBe('beach.jpg');
  });

  test('목록 보기는 열 수와 무관하게 파일명과 날짜(영상은 길이 포함)를 보여준다', async () => {
    settingStore = { gallery_view_mode: 'list', gallery_grid_columns: '6' };
    const day = new Date(2026, 9, 3, 12).getTime();
    mockQueryResult = [img('p1', 'beach.jpg', day), vid('v1', day - 1000, 65000)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.getByTestId('gallery-filename-p1').props.children).toBe('beach.jpg');
    expect(screen.getByTestId('gallery-filename-v1').props.children).toBe('v1.mp4');
    expect(within(screen.getByTestId('gallery-item-p1')).getByText('2026년 10월 3일')).toBeTruthy();
    expect(within(screen.getByTestId('gallery-item-v1')).getByText('2026년 10월 3일 · ▶ 1:05')).toBeTruthy();
  });

  test('목록 보기에서 날짜를 모르는 항목은 날짜 없음으로 표시한다', async () => {
    settingStore = { gallery_view_mode: 'list' };
    mockQueryResult = [img('p1', 'beach.jpg', null)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(within(screen.getByTestId('gallery-item-p1')).getByText('날짜 없음')).toBeTruthy();
  });
});

describe('툴바와 검색', () => {
  test('툴바에 사진·영상 개수 요약이 보이고 영상이 없으면 사진 개수만 보인다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100), img('p2', 'b.jpg', 200), vid('v1', 300, 1000)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.getByTestId('gallery-summary').props.children).toBe('사진 2장 · 영상 1개');
  });

  test('영상이 없는 앨범은 사진 개수만 요약한다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.getByTestId('gallery-summary').props.children).toBe('사진 1장');
  });

  test('검색 토글을 켜면 입력창이 나타나고 파일명으로 필터링한다(대소문자 무시)', async () => {
    mockQueryResult = [img('p1', 'Beach.jpg', 100), img('p2', 'city.jpg', 200), vid('v1', 300, 1000)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.queryByTestId('gallery-search-input')).toBeNull();
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    await fireEvent.changeText(screen.getByTestId('gallery-search-input'), 'BEACH');
    expect(tileOrder()).toEqual(['p1']);
    await fireEvent.changeText(screen.getByTestId('gallery-search-input'), '.mp4');
    expect(tileOrder()).toEqual(['v1']);
  });

  test('일치하는 파일이 없으면 검색 결과 없음 문구를 보여준다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    await fireEvent.changeText(screen.getByTestId('gallery-search-input'), 'zzz');
    expect(await screen.findByText('검색 결과가 없어요')).toBeTruthy();
    expect(screen.queryByText('표시할 사진이 없습니다')).toBeNull();
  });

  test('검색을 닫으면 검색어가 지워지고 전체 목록으로 돌아온다(숨은 필터가 남지 않는다)', async () => {
    mockQueryResult = [img('p1', 'beach.jpg', 100), img('p2', 'city.jpg', 200)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    await fireEvent.changeText(screen.getByTestId('gallery-search-input'), 'beach');
    expect(tileOrder()).toEqual(['p1']);
    await fireEvent.press(screen.getByTestId('gallery-search-close'));
    expect(screen.queryByTestId('gallery-search-input')).toBeNull();
    expect(tileOrder().sort()).toEqual(['p1', 'p2']);
    // 다시 열면 이전 검색어가 남아 있지 않다
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    expect(screen.getByTestId('gallery-search-input').props.value).toBe('');
  });

  test('검색 결과는 요약 개수에 반영되지만 슬라이드쇼 가능 여부는 앨범 전체 기준이다', async () => {
    mockQueryResult = [img('p1', 'beach.jpg', 100), vid('v1', 200, 1000)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    await fireEvent.changeText(screen.getByTestId('gallery-search-input'), 'v1');
    expect(tileOrder()).toEqual(['v1']);
    await renderHeaderRight();
    expect(screen.getByTestId('gallery-slideshow-button').props.accessibilityState.disabled).toBe(false);
  });

  test('검색 결과도 현재 정렬을 따른다', async () => {
    mockQueryResult = [img('a', 'img_a.jpg', 100), img('b', 'img_b.jpg', 200), img('c', 'other.jpg', 300)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-a');
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    await fireEvent.changeText(screen.getByTestId('gallery-search-input'), 'img');
    // 기본 정렬(촬영시간 내림차순)
    expect(tileOrder()).toEqual(['b', 'a']);

    await fireEvent.press(screen.getByTestId('gallery-search-close'));
    await fireEvent.press(screen.getByTestId('gallery-sort-button'));
    await fireEvent.press(screen.getByTestId('gallery-sort-criterion-filename'));
    await fireEvent.press(screen.getByTestId('gallery-sort-direction-asc'));
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    await fireEvent.changeText(screen.getByTestId('gallery-search-input'), 'img');
    expect(tileOrder()).toEqual(['a', 'b']);
  });

  test('검색 중에는 툴바가 입력창으로 바뀌어 정렬·보기 버튼이 숨고, 닫으면 돌아온다', async () => {
    mockQueryResult = [img('a', 'img_a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-a');
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    expect(screen.queryByTestId('gallery-sort-button')).toBeNull();
    expect(screen.queryByTestId('gallery-view-mode-toggle')).toBeNull();
    await fireEvent.press(screen.getByTestId('gallery-search-close'));
    expect(screen.getByTestId('gallery-sort-button')).toBeTruthy();
    expect(screen.getByTestId('gallery-view-mode-toggle')).toBeTruthy();
  });
});

describe('슬라이드쇼 버튼과 앨범 설정 버튼(헤더 우측)', () => {
  test('사진이 있으면 활성화되고 탭하면 설정 화면을 거치지 않고 바로 재생 화면으로 이동한다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await renderHeaderRight();
    expect(screen.getByTestId('gallery-slideshow-button').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId('gallery-slideshow-button'));
    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('SlideshowPlayer', { albumId: 42, deviceAlbumId: 'device-album-1' })
    );
    expect(mockNavigate).not.toHaveBeenCalledWith('AlbumSettings', expect.anything());
  });

  test('⚙ 버튼은 앨범 설정 화면으로 이동한다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await renderHeaderRight();
    await fireEvent.press(screen.getByTestId('gallery-album-settings-button'));
    expect(mockNavigate).toHaveBeenCalledWith('AlbumSettings', { deviceAlbumId: 'device-album-1', displayName: '여행 사진' });
    expect(mockNavigate).not.toHaveBeenCalledWith('SlideshowPlayer', expect.anything());
  });

  test('⚙ 버튼은 사진이 없는 앨범에서도 쓸 수 있다', async () => {
    mockQueryResult = [vid('v1', 100, 1000)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-v1');
    await renderHeaderRight();
    expect(screen.getByTestId('gallery-album-settings-button').props.accessibilityState.disabled).toBe(false);
  });

  test('신규 앨범을 바로 재생하면 설정 화면 첫 진입과 같은 기본값·기본 음악 저장이 먼저 일어난다', async () => {
    mockedDb.getDefaultMusicTracks.mockResolvedValue([
      { sourceType: 'bundled', sourceValue: 'calm', title: 'Calm', artist: null, coverUri: null },
    ] as any);
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await renderHeaderRight();
    await fireEvent.press(screen.getByTestId('gallery-slideshow-button'));
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('SlideshowPlayer', expect.anything()));
    expect(mockedDb.insertAlbum).toHaveBeenCalledWith('device-album-1', '여행 사진');
    expect(mockedDb.upsertSlideshowSettings).toHaveBeenCalledWith(42, 5, 'sequential', 'once', 'creation_time', 'asc');
    expect(mockedDb.upsertMusicTrack).toHaveBeenCalledWith('bundled', 'calm', 'Calm', null, null);
    expect(mockedDb.setSlideshowMusicTracks).toHaveBeenCalledWith(99, [5]);
  });

  test('앨범 준비에 실패하면 재생 화면으로 가지 않고 안내를 보여준다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockedDb.getAlbumByDeviceId.mockRejectedValue(new Error('db'));
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    const view = await render(<AlbumGalleryScreen {...routeProps} />);
    await view.findByTestId('gallery-item-p1');
    await renderHeaderRight();
    await fireEvent.press(screen.getByTestId('gallery-slideshow-button'));
    expect(await view.findByTestId('gallery-start-error')).toBeTruthy();
    expect(mockNavigate).not.toHaveBeenCalledWith('SlideshowPlayer', expect.anything());
    warn.mockRestore();
  });

  test('앨범을 준비하는 동안에는 재생 버튼이 비활성화돼 연타해도 한 번만 시작한다', async () => {
    let resolveAlbum: (album: any) => void = () => {};
    mockedDb.getAlbumByDeviceId.mockReturnValue(new Promise((r) => (resolveAlbum = r)));
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    const view = await render(<AlbumGalleryScreen {...routeProps} />);
    await view.findByTestId('gallery-item-p1');
    // fireEvent.press는 핸들러가 돌려준 Promise가 끝날 때까지 기다리고 act 범위가 겹치므로, 앨범 준비가
    // 끝나기 전의 상태를 보려면 헤더 버튼의 onPress를 직접 호출해 Promise를 쥐고 있는다.
    const slideshowPressable = () => {
      const calls = mockSetOptions.mock.calls;
      return (calls[calls.length - 1][0] as { headerRight: () => any }).headerRight().props.children[0];
    };
    let pending!: Promise<void>;
    await act(async () => {
      pending = slideshowPressable().props.onPress();
    });
    expect(slideshowPressable().props.disabled).toBe(true);
    resolveAlbum({ id: 42, deviceAlbumId: 'device-album-1', displayName: '여행 사진' });
    await act(async () => {
      await pending;
    });
    expect(mockNavigate.mock.calls.filter(([name]) => name === 'SlideshowPlayer')).toHaveLength(1);
    expect(slideshowPressable().props.disabled).toBe(false);
  });

  test('버튼은 목록 스크롤 영역이 아니라 헤더에 있다(화면 본문에는 없다)', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.queryByTestId('gallery-slideshow-button')).toBeNull();
    expect(mockSetOptions).toHaveBeenCalledWith(expect.objectContaining({ headerRight: expect.any(Function) }));
  });

  test('영상만 있는 앨범에서는 비활성화되고 안내가 보인다', async () => {
    mockQueryResult = [vid('v1', 100, 1000)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-v1');
    expect(screen.getByText('사진이 없는 앨범은 슬라이드쇼를 재생할 수 없어요')).toBeTruthy();
    await renderHeaderRight();
    const button = screen.getByTestId('gallery-slideshow-button');
    expect(button.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(button);
    expect(mockNavigate).not.toHaveBeenCalledWith('SlideshowPlayer', expect.anything());
  });

  test('빈 앨범에서도 비활성화된다', async () => {
    mockQueryResult = [];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByText('표시할 사진이 없습니다');
    await renderHeaderRight();
    expect(screen.getByTestId('gallery-slideshow-button').props.accessibilityState.disabled).toBe(true);
  });

  test('조회 전(로딩 중)에는 비활성화돼 있다', async () => {
    mockQueryImpl = () => new Promise(() => {});
    await render(<AlbumGalleryScreen {...routeProps} />);
    await renderHeaderRight();
    expect(screen.getByTestId('gallery-slideshow-button').props.accessibilityState.disabled).toBe(true);
  });
});

describe('albums row 미생성(FR-N3)', () => {
  test('조회·검색·정렬·보기 전환·앨범 설정 이동 중에는 album/settings 생성 함수가 호출되지 않는다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await fireEvent.press(screen.getByTestId('gallery-search-toggle'));
    await fireEvent.changeText(screen.getByTestId('gallery-search-input'), 'a');
    await fireEvent.press(screen.getByTestId('gallery-search-close'));
    await fireEvent.press(screen.getByTestId('gallery-sort-button'));
    await fireEvent.press(screen.getByTestId('gallery-sort-criterion-filename'));
    await fireEvent.press(screen.getByTestId('gallery-view-mode-toggle'));
    await fireEvent.press(screen.getByTestId('gallery-view-mode-toggle'));
    await renderHeaderRight();
    await fireEvent.press(screen.getByTestId('gallery-album-settings-button'));
    expect(mockedDb.getAlbumByDeviceId).not.toHaveBeenCalled();
    expect(mockedDb.insertAlbum).not.toHaveBeenCalled();
    expect(mockedDb.upsertSlideshowSettings).not.toHaveBeenCalled();
  });

  test('슬라이드쇼를 바로 재생할 때만 album row가 만들어진다(재생 화면이 albumId를 필요로 한다)', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await renderHeaderRight();
    await fireEvent.press(screen.getByTestId('gallery-slideshow-button'));
    await waitFor(() => expect(mockedDb.insertAlbum).toHaveBeenCalledTimes(1));
  });
});

describe('배너 광고 위치(FR-AD)', () => {
  test.each([
    ['로딩', () => { mockQueryImpl = () => new Promise(() => {}); }],
    ['빈 앨범', () => { mockQueryResult = []; }],
    ['정상', () => { mockQueryResult = [img('p1', 'a.jpg', 100)]; }],
    ['오류', () => { mockQueryImpl = () => Promise.reject(new Error('x')); }],
  ])('%s 상태에서도 banner-ad가 루트 View의 마지막 자식이다', async (_label, setup) => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (setup as () => void)();
    await render(<AlbumGalleryScreen {...routeProps} />);
    await waitFor(() => expect(screen.getByTestId('banner-ad')).toBeTruthy());
    expect(isBannerLastChildOfRoot(screen.toJSON() as any)).toBe(true);
    warn.mockRestore();
  });
});

describe('영상 권한(NFR-P2) — 사진은 영상 권한과 무관하게 항상 보인다', () => {
  test('영상 권한이 허용돼 있으면 배너가 없다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.queryByTestId('video-access-banner')).toBeNull();
  });

  test.each(['idle', 'denied', 'blocked', 'partial_unsupported'] as const)(
    '영상 권한이 %s여도 사진 그리드는 정상 표시되고 안내 배너만 나타난다',
    async (state) => {
      mockVideoPermission({ state });
      mockQueryResult = [img('p1', 'a.jpg', 100)];
      await render(<AlbumGalleryScreen {...routeProps} />);
      expect(await screen.findByTestId('gallery-item-p1')).toBeTruthy();
      expect(screen.getByTestId('video-access-banner')).toBeTruthy();
      // 차단 화면(rationale/blocked)이 사진 위를 덮지 않는다
      expect(screen.queryByText('영상 접근 권한이 필요해요')).toBeNull();
      expect(screen.queryByText('영상 접근 권한이 꺼져 있어요')).toBeNull();
    }
  );

  test('권한 상태 확인이 끝나기 전(isReady=false)에는 배너를 보이지 않는다', async () => {
    mockVideoPermission({ state: 'idle', isReady: false });
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.queryByTestId('video-access-banner')).toBeNull();
  });

  test('사진 권한 훅과 분리돼 영상(["video"])만 요청한다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(mockedUsePermission).toHaveBeenCalledWith(['video']);
    expect(mockedUsePermission).not.toHaveBeenCalledWith(expect.arrayContaining(['photo']));
  });

  test('이미 닫은 배너는 다시 나타나지 않는다', async () => {
    settingStore = { gallery_video_banner_dismissed: '1' };
    mockVideoPermission({ state: 'idle' });
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(screen.queryByTestId('video-access-banner')).toBeNull();
  });

  test('배너 ✕를 누르면 사라지고 닫힘 상태가 저장된다', async () => {
    mockVideoPermission({ state: 'idle' });
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await fireEvent.press(await screen.findByTestId('video-access-banner-dismiss'));
    expect(screen.queryByTestId('video-access-banner')).toBeNull();
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('gallery_video_banner_dismissed', '1');
  });

  test('배너를 누르면 권한 흐름이 시작(rationale)된다', async () => {
    const permission = mockVideoPermission({ state: 'idle' });
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await fireEvent.press(await screen.findByTestId('video-access-banner-action'));
    expect(permission.start).toHaveBeenCalledTimes(1);
  });

  test('rationale 상태면 영상용 설명 화면이 뜨고, 계속/취소가 훅으로 전달된다', async () => {
    const permission = mockVideoPermission({ state: 'rationale' });
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    expect(await screen.findByText('영상 접근 권한이 필요해요')).toBeTruthy();
    await fireEvent.press(screen.getByText('계속'));
    expect(permission.confirmRationale).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByText('취소'));
    expect(permission.cancelRationale).toHaveBeenCalledTimes(1);
  });

  test('차단(blocked) 상태에서 배너를 누르면 설정 이동 안내가 뜨고 닫을 수 있다', async () => {
    const permission = mockVideoPermission({ state: 'blocked' });
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await fireEvent.press(await screen.findByTestId('video-access-banner-action'));
    expect(await screen.findByText('영상 접근 권한이 꺼져 있어요')).toBeTruthy();
    await fireEvent.press(screen.getByText('설정으로 이동'));
    expect(permission.openSettings).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByTestId('video-blocked-close'));
    await waitFor(() => expect(screen.queryByText('영상 접근 권한이 꺼져 있어요')).toBeNull());
  });

  test('영상 권한이 새로 허용되면 갤러리를 재조회해 영상이 나타난다', async () => {
    mockVideoPermission({ state: 'idle' });
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    const view = await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(mockExeForMetadata).toHaveBeenCalledTimes(1);

    mockVideoPermission({ state: 'granted' });
    mockQueryResult = [img('p1', 'a.jpg', 100), vid('v1', 200, 3000)];
    await view.rerender(<AlbumGalleryScreen {...routeProps} />);
    expect(await screen.findByTestId('gallery-item-v1')).toBeTruthy();
    expect(mockExeForMetadata).toHaveBeenCalledTimes(2);
  });

  test('이미 허용된 상태로 시작하면 권한 때문에 재조회하지 않는다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    expect(mockExeForMetadata).toHaveBeenCalledTimes(1);
  });
});

describe('파일 관리(삭제·이동)', () => {
  function galleryItem(id: string, filename: string, creationTime: number) {
    return {
      id,
      filename,
      creationTime,
      mediaKind: 'image' as const,
      width: 100,
      height: 100,
      durationMs: null,
      modificationTime: 1,
    };
  }

  async function renderWithPhotos() {
    mockIsFileManagementAvailable.mockReturnValue(true);
    mockQueryResult = [img('p1', 'a.jpg', 100), img('p2', 'b.jpg', 200), img('p3', 'c.jpg', 300)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
  }

  test('지원하지 않는 환경(iOS·Android 10 이하)에서는 길게 눌러도 선택 모드가 켜지지 않는다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await fireEvent(await screen.findByTestId('gallery-item-p1'), 'longPress');
    expect(screen.queryByTestId('selection-bar')).toBeNull();
  });

  test('길게 누르면 선택 모드가 켜지고 그 항목이 선택된다', async () => {
    await renderWithPhotos();
    await fireEvent(screen.getByTestId('gallery-item-p2'), 'longPress');
    expect(screen.getByTestId('selection-bar')).toBeTruthy();
    expect(screen.getByTestId('selection-count').props.children).toBe('1개 선택');
    expect(screen.getByTestId('select-check-p2')).toBeTruthy();
    expect(screen.queryByTestId('select-check-p1')).toBeNull();
  });

  test('선택 모드에서 탭하면 뷰어로 가지 않고 선택이 토글된다', async () => {
    await renderWithPhotos();
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('gallery-item-p2'));
    expect(screen.getByTestId('selection-count').props.children).toBe('2개 선택');
    await fireEvent.press(screen.getByTestId('gallery-item-p2'));
    expect(screen.getByTestId('selection-count').props.children).toBe('1개 선택');
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  test('선택 모드가 아닐 때 탭은 기존처럼 뷰어를 연다', async () => {
    await renderWithPhotos();
    await fireEvent.press(screen.getByTestId('gallery-item-p1'));
    expect(mockNavigate).toHaveBeenCalledWith('PhotoViewer', expect.objectContaining({ initialAssetId: 'p1' }));
  });

  test('전체 선택은 현재 표시 중인 항목을 모두 선택한다', async () => {
    await renderWithPhotos();
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-select-all'));
    expect(screen.getByTestId('selection-count').props.children).toBe('3개 선택');
  });

  test('✕를 누르면 선택 모드가 꺼진다', async () => {
    await renderWithPhotos();
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-cancel'));
    expect(screen.queryByTestId('selection-bar')).toBeNull();
    expect(screen.queryByTestId('select-check-p1')).toBeNull();
  });

  test('선택 모드에서 뒤로가기는 화면을 떠나지 않고 선택 모드부터 끈다', async () => {
    await renderWithPhotos();
    const lastRegistration = () => mockUsePreventRemove.mock.calls[mockUsePreventRemove.mock.calls.length - 1];
    expect(lastRegistration()[0]).toBe(false);
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    expect(lastRegistration()[0]).toBe(true);
    await act(async () => lastRegistration()[1]());
    expect(screen.queryByTestId('selection-bar')).toBeNull();
    expect(lastRegistration()[0]).toBe(false);
  });

  test('선택 모드에서는 헤더 우측(슬라이드쇼·설정) 버튼을 비운다', async () => {
    await renderWithPhotos();
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    const calls = mockSetOptions.mock.calls;
    const options = calls[calls.length - 1][0] as { headerRight: () => unknown };
    expect(options.headerRight()).toBeNull();
  });

  test('삭제: 선택한 id로 삭제를 실행하고, 전부 처리되면 목록이 갱신되고 선택 모드가 꺼진다', async () => {
    await renderWithPhotos();
    mockRunMediaMutation.mockResolvedValue({
      items: [galleryItem('p3', 'c.jpg', 300)],
      summary: { removedIds: ['p1', 'p2'], remainingIds: [] },
      error: null,
    });
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('gallery-item-p2'));
    await fireEvent.press(screen.getByTestId('selection-delete'));

    expect(mockRunMediaMutation).toHaveBeenCalledWith('device-album-1', ['p1', 'p2'], { kind: 'delete' });
    await waitFor(() => expect(screen.queryByTestId('selection-bar')).toBeNull());
    expect(screen.queryByTestId('gallery-item-p1')).toBeNull();
    expect(screen.queryByTestId('gallery-item-p2')).toBeNull();
    expect(screen.getByTestId('gallery-item-p3')).toBeTruthy();
  });

  test('삭제를 취소(아무것도 안 지워짐)하면 선택이 유지되고 안내가 뜬다', async () => {
    await renderWithPhotos();
    mockRunMediaMutation.mockResolvedValue({
      items: [galleryItem('p1', 'a.jpg', 100), galleryItem('p2', 'b.jpg', 200), galleryItem('p3', 'c.jpg', 300)],
      summary: { removedIds: [], remainingIds: ['p1'] },
      error: new Error("User didn't grant write permission to requested files."),
    });
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-delete'));

    expect(await screen.findByTestId('gallery-mutation-notice')).toBeTruthy();
    expect(screen.getByText('처리되지 않았어요. 확인을 취소했거나 허용되지 않았어요')).toBeTruthy();
    expect(screen.getByTestId('selection-bar')).toBeTruthy();
    expect(screen.getByTestId('select-check-p1')).toBeTruthy();
  });

  test('이동이 취소가 아닌 이유로 실패하면 네이티브 오류 메시지를 안내에 보여준다', async () => {
    await renderWithPhotos();
    mockRunMediaMutation.mockResolvedValue({
      items: [galleryItem('p1', 'a.jpg', 100), galleryItem('p2', 'b.jpg', 200), galleryItem('p3', 'c.jpg', 300)],
      summary: { removedIds: [], remainingIds: ['p1'] },
      error: new Error('Primary directory Download not allowed for content://media/external/images/media/1'),
    });
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-delete'));

    expect(
      await screen.findByText('처리하지 못했어요: Primary directory Download not allowed for content://media/external/images/media/1')
    ).toBeTruthy();
  });

  test('일부만 처리되면 처리된 항목은 사라지고 남은 항목만 선택된 채 안내가 뜬다', async () => {
    await renderWithPhotos();
    mockRunMediaMutation.mockResolvedValue({
      items: [galleryItem('p2', 'b.jpg', 200), galleryItem('p3', 'c.jpg', 300)],
      summary: { removedIds: ['p1'], remainingIds: ['p2'] },
      error: new Error('partial'),
    });
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('gallery-item-p2'));
    await fireEvent.press(screen.getByTestId('selection-delete'));

    expect(await screen.findByText('1개만 처리됐고 1개는 그대로 남아 있어요')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('selection-count').props.children).toBe('1개 선택'));
    expect(screen.queryByTestId('gallery-item-p1')).toBeNull();
    expect(screen.getByTestId('select-check-p2')).toBeTruthy();
  });

  test('작업이 진행되는 동안 다시 눌러도 중복 실행하지 않는다', async () => {
    await renderWithPhotos();
    let resolveMutation: (value: unknown) => void = () => {};
    mockRunMediaMutation.mockImplementation(() => new Promise((resolve) => (resolveMutation = resolve)));
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    // fireEvent.press는 onPress가 돌려준 Promise가 끝날 때까지 기다리므로, 끝나지 않는 작업은 await하지 않고 시작만 한다.
    const firstPress = fireEvent.press(screen.getByTestId('selection-delete'));
    await waitFor(() => expect(mockRunMediaMutation).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('selection-delete').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('selection-move').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('selection-delete'));
    expect(mockRunMediaMutation).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveMutation({
        items: [galleryItem('p2', 'b.jpg', 200), galleryItem('p3', 'c.jpg', 300)],
        summary: { removedIds: ['p1'], remainingIds: [] },
        error: null,
      });
    });
    await firstPress;
  });

  test('선택이 0개면 이동·삭제 버튼이 비활성이다', async () => {
    await renderWithPhotos();
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('gallery-item-p1'));
    expect(screen.getByTestId('selection-count').props.children).toBe('0개 선택');
    expect(screen.getByTestId('selection-delete').props.accessibilityState.disabled).toBe(true);
    expect(screen.getByTestId('selection-move').props.accessibilityState.disabled).toBe(true);
  });

  test('이동: 대상 앨범 목록에서 현재 앨범을 빼고 보여주고, 고르면 그 앨범으로 이동을 실행한다', async () => {
    await renderWithPhotos();
    settingStore['album_thumbnail_cache'] = JSON.stringify([
      { id: 'device-album-1', title: '여행 사진', thumbnailUri: 'x' },
      { id: 'device-album-2', title: '가족', thumbnailUri: 'y' },
    ]);
    mockRunMediaMutation.mockResolvedValue({
      items: [galleryItem('p2', 'b.jpg', 200), galleryItem('p3', 'c.jpg', 300)],
      summary: { removedIds: ['p1'], remainingIds: [] },
      error: null,
    });
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-move'));

    expect(await screen.findByTestId('move-target-device-album-2')).toBeTruthy();
    expect(screen.queryByTestId('move-target-device-album-1')).toBeNull();

    await fireEvent.press(screen.getByTestId('move-target-device-album-2'));
    expect(mockRunMediaMutation).toHaveBeenCalledWith('device-album-1', ['p1'], {
      kind: 'move',
      targetAlbumId: 'device-album-2',
    });
    await waitFor(() => expect(screen.queryByTestId('selection-bar')).toBeNull());
    expect(screen.queryByTestId('gallery-item-p1')).toBeNull();
  });

  test('새 폴더: 이름을 입력해 만들고 이동을 실행한다(현재 앨범과 같은 이름은 막는다)', async () => {
    await renderWithPhotos();
    settingStore['album_thumbnail_cache'] = JSON.stringify([
      { id: 'device-album-1', title: '여행 사진', thumbnailUri: 'x' },
      { id: 'device-album-2', title: '가족', thumbnailUri: 'y' },
    ]);
    mockRunMediaMutation.mockResolvedValue({
      items: [galleryItem('p2', 'b.jpg', 200), galleryItem('p3', 'c.jpg', 300)],
      summary: { removedIds: ['p1'], remainingIds: [] },
      error: null,
    });
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-move'));
    await screen.findByTestId('move-target-device-album-2');
    await fireEvent.press(screen.getByTestId('move-target-new-folder'));

    expect(screen.getByTestId('new-folder-confirm').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('new-folder-input'), '여행 사진');
    expect(screen.getByTestId('new-folder-error')).toBeTruthy();
    expect(screen.getByTestId('new-folder-confirm').props.accessibilityState.disabled).toBe(true);
    await fireEvent.changeText(screen.getByTestId('new-folder-input'), 'a.b');
    expect(screen.getByTestId('new-folder-error')).toBeTruthy();

    await fireEvent.changeText(screen.getByTestId('new-folder-input'), '  가족 여행  ');
    expect(screen.queryByTestId('new-folder-error')).toBeNull();
    await fireEvent.press(screen.getByTestId('new-folder-confirm'));

    expect(mockRunMediaMutation).toHaveBeenCalledWith('device-album-1', ['p1'], {
      kind: 'moveToNew',
      folderName: '가족 여행',
    });
    await waitFor(() => expect(screen.queryByTestId('selection-bar')).toBeNull());
  });

  test('새 폴더 단계에서 뒤로를 누르면 앨범 목록으로 돌아가고 이동은 실행되지 않는다', async () => {
    await renderWithPhotos();
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-move'));
    await fireEvent.press(await screen.findByTestId('move-target-new-folder'));
    await fireEvent.press(screen.getByTestId('new-folder-back'));
    expect(screen.getByTestId('move-target-new-folder')).toBeTruthy();
    expect(mockRunMediaMutation).not.toHaveBeenCalled();
  });

  test('이동 대상이 없으면 안내를 보여준다', async () => {
    await renderWithPhotos();
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    await fireEvent.press(screen.getByTestId('selection-move'));
    expect(await screen.findByTestId('move-target-empty')).toBeTruthy();
  });

  test('선택 모드에서도 banner-ad는 루트 View의 마지막 자식이다', async () => {
    await renderWithPhotos();
    await fireEvent(screen.getByTestId('gallery-item-p1'), 'longPress');
    expect(isBannerLastChildOfRoot(screen.toJSON() as any)).toBe(true);
  });
});
