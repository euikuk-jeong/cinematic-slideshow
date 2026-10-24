import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';

import { AlbumGalleryScreen } from '../AlbumGalleryScreen';
import { isBannerLastChildOfRoot } from '../../ads/bannerPlacement';
import * as db from '../../db/client';
import { useMediaLibraryPermission } from '../../permissions/useMediaLibraryPermission';
import type { UseMediaLibraryPermissionResult } from '../../permissions/useMediaLibraryPermission';

const mockNavigate = jest.fn();
const mockSetOptions = jest.fn();

// 실제 useFocusEffect는 NavigationContainer의 focus 이벤트에 의존하는데 이 테스트는 네비게이터
// 없이 컴포넌트만 렌더링한다 — mount 시 한 번 포커스된 것처럼 콜백을 실행하고, 테스트에서
// 다시 포커스된 상황을 흉내낼 수 있게 콜백을 캡처한다.
let mockFocusCallback: (() => void | (() => void)) | null = null;
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useFocusEffect: (callback: () => void | (() => void)) => {
    mockFocusCallback = callback;
    require('react').useEffect(callback, [callback]);
  },
}));

jest.mock('../../permissions/useMediaLibraryPermission');

jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn(),
  setAppSetting: jest.fn(),
  // 갤러리는 albums row를 만들지 않는다(FR-N3) — 아래 함수가 호출되면 실패해야 한다.
  getAlbumByDeviceId: jest.fn(),
  insertAlbum: jest.fn(),
  upsertSlideshowSettings: jest.fn(),
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
  settingStore = {};
  mockVideoPermission();
  mockedDb.getAppSetting.mockImplementation(async (key: string) => settingStore[key] ?? null);
  mockedDb.setAppSetting.mockImplementation(async (key: string, value: string) => {
    settingStore[key] = value;
  });
  mockGetUri.mockImplementation((id: string) => Promise.resolve(`file:///${id}.jpg`));
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
    await fireEvent.press(screen.getByTestId('gallery-sort-criterion-filename'));
    await fireEvent.press(screen.getByTestId('gallery-sort-direction-asc'));
    expect(tileOrder()).toEqual(['new', 'mid', 'old', 'nodate']);
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('gallery_sort_criterion', 'filename');
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('gallery_sort_direction', 'asc');
  });

  test('날짜별 보기로 전환하면 섹션 헤더가 보이고 저장된다', async () => {
    const day1 = new Date(2026, 9, 1, 12).getTime();
    const day2 = new Date(2026, 9, 2, 12).getTime();
    mockQueryResult = [img('a', 'a.jpg', day1), img('b', 'b.jpg', day2), img('n', 'n.jpg', null)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-a');
    await fireEvent.press(screen.getByTestId('gallery-view-mode-date'));
    expect(await screen.findByText('2026년 10월 2일')).toBeTruthy();
    expect(screen.getByText('2026년 10월 1일')).toBeTruthy();
    expect(screen.getByText('날짜 없음')).toBeTruthy();
    expect(mockedDb.setAppSetting).toHaveBeenCalledWith('gallery_view_mode', 'date');
    expect(tileOrder()).toEqual(['b', 'a', 'n']);
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
    });
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

describe('슬라이드쇼 버튼(헤더 우측)', () => {
  test('사진이 있으면 활성화되고 탭하면 앨범 설정으로 이동한다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await renderHeaderRight();
    expect(screen.getByTestId('gallery-slideshow-button').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId('gallery-slideshow-button'));
    expect(mockNavigate).toHaveBeenCalledWith('AlbumSettings', { deviceAlbumId: 'device-album-1', displayName: '여행 사진' });
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
    expect(mockNavigate).not.toHaveBeenCalledWith('AlbumSettings', expect.anything());
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
  test('조회·정렬·보기 전환·슬라이드쇼 버튼 탭 중에 album/settings 생성 함수가 호출되지 않는다', async () => {
    mockQueryResult = [img('p1', 'a.jpg', 100)];
    await render(<AlbumGalleryScreen {...routeProps} />);
    await screen.findByTestId('gallery-item-p1');
    await fireEvent.press(screen.getByTestId('gallery-sort-criterion-filename'));
    await fireEvent.press(screen.getByTestId('gallery-view-mode-date'));
    await renderHeaderRight();
    await fireEvent.press(screen.getByTestId('gallery-slideshow-button'));
    expect(mockedDb.getAlbumByDeviceId).not.toHaveBeenCalled();
    expect(mockedDb.insertAlbum).not.toHaveBeenCalled();
    expect(mockedDb.upsertSlideshowSettings).not.toHaveBeenCalled();
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
