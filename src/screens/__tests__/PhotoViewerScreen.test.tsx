import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

import { PhotoViewerScreen } from '../PhotoViewerScreen';
import * as db from '../../db/client';
import { clearPhotoUriCache } from '../../photos/usePhotoUri';

jest.mock('../../db/client', () => ({
  getAlbumByDeviceId: jest.fn(),
  insertAlbum: jest.fn(),
  upsertSlideshowSettings: jest.fn(),
}));

interface FakeMeta {
  id: string;
  filename: string | null;
  mediaType: 'image' | 'video';
  width: number | null;
  height: number | null;
  duration: number | null;
  creationTime: number | null;
  modificationTime: number | null;
}

let mockQueryResult: FakeMeta[] = [];
let mockQueryImpl: (() => Promise<FakeMeta[]>) | null = null;
const mockGetUri = jest.fn();

jest.mock('expo-media-library', () => ({
  Album: jest.fn().mockImplementation((id: string) => ({ id })),
  Query: jest.fn().mockImplementation(() => {
    const q = {
      album: jest.fn().mockReturnThis(),
      within: jest.fn().mockReturnThis(),
      exeForMetadata: () => (mockQueryImpl ? mockQueryImpl() : Promise.resolve(mockQueryResult)),
    };
    return q;
  }),
  Asset: jest.fn().mockImplementation((id: string) => ({ getUri: () => mockGetUri(id) })),
  AssetField: { MEDIA_TYPE: 'mediaType' },
  MediaType: { IMAGE: 'image', VIDEO: 'video' },
}));

const mockGoBack = jest.fn();
const mockSetOptions = jest.fn();

function img(id: string, creationTime: number, extra: Partial<FakeMeta> = {}): FakeMeta {
  return { id, filename: `${id}.jpg`, mediaType: 'image', width: 4000, height: 3000, duration: null, creationTime, modificationTime: 1, ...extra };
}

function props(overrides: Record<string, unknown> = {}) {
  return {
    route: {
      params: {
        deviceAlbumId: 'album-1',
        displayName: '여행 사진',
        initialAssetId: 'p3',
        sortCriterion: 'creation_time',
        sortDirection: 'asc',
        viewMode: 'grid',
        ...overrides,
      },
    },
    navigation: { goBack: mockGoBack, setOptions: mockSetOptions },
  } as any;
}

// asc 정렬 시 p1..p5 순서
const fiveItems = () => ['p1', 'p2', 'p3', 'p4', 'p5'].map((id, i) => img(id, (i + 1) * 100));

beforeEach(() => {
  jest.clearAllMocks();
  clearPhotoUriCache();
  mockQueryImpl = null;
  mockQueryResult = fiveItems();
  mockGetUri.mockImplementation((id: string) => Promise.resolve(`file:///${id}.jpg`));
});

function pageIds(): string[] {
  return screen
    .queryAllByTestId(/^viewer-page-(?!error|retry)/)
    .map((n) => n.props.testID.replace('viewer-page-', ''));
}

async function swipeTo(pageIndex: number) {
  await fireEvent(screen.getByTestId('viewer-pager'), 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: pageIndex * 750 } },
  });
}

describe('페이징', () => {
  test('initialAssetId 위치로 열리고 N/총수를 표시한다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    expect(await screen.findByTestId('viewer-position')).toHaveTextContent('3 / 5');
    expect(screen.getByTestId('viewer-title')).toHaveTextContent('p3.jpg');
  });

  test('스와이프로 다음/이전 항목으로 이동하고 양 끝에서 멈춘다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    await screen.findByTestId('viewer-position');
    await swipeTo(3);
    expect(screen.getByTestId('viewer-position')).toHaveTextContent('4 / 5');
    await swipeTo(4);
    expect(screen.getByTestId('viewer-position')).toHaveTextContent('5 / 5');
    await swipeTo(99);
    expect(screen.getByTestId('viewer-position')).toHaveTextContent('5 / 5');
    await swipeTo(0);
    expect(screen.getByTestId('viewer-position')).toHaveTextContent('1 / 5');
    await swipeTo(-3);
    expect(screen.getByTestId('viewer-position')).toHaveTextContent('1 / 5');
  });

  test('날짜별 보기 + 촬영시간 오름차순이면 화면에 표시된 순서(섹션 최신 날짜 먼저)를 따른다', async () => {
    const d = (day: number, h: number) => new Date(2026, 9, day, h).getTime();
    mockQueryResult = [img('a', d(1, 9)), img('b', d(1, 10)), img('c', d(2, 9))];
    await render(<PhotoViewerScreen {...props({ initialAssetId: 'c', viewMode: 'date' })} />);
    expect(await screen.findByTestId('viewer-position')).toHaveTextContent('1 / 3'); // 날짜별: c(10/2)가 먼저
    await swipeTo(1);
    expect(screen.getByTestId('viewer-title')).toHaveTextContent('a.jpg');
  });

  test('현재 ±2장만 실제 페이지로 마운트하고 나머지는 빈 자리다', async () => {
    mockQueryResult = Array.from({ length: 12 }, (_, i) => img(`m${i}`, (i + 1) * 100));
    await render(<PhotoViewerScreen {...props({ initialAssetId: 'm6' })} />);
    await screen.findByTestId('viewer-position');
    // 현재(m6) ±2 = m4..m8 만 실제 페이지. (jest의 VirtualizedList는 initialScrollIndex 앞쪽을
    // 그리지 않으므로 "범위 안에 있다"와 "범위 밖은 하나도 없다"로 단언한다.)
    await waitFor(() => expect(pageIds()).toContain('m6'));
    const inWindow = (ids: string[], allowed: string[]) => ids.every((id) => allowed.includes(id));
    expect(inWindow(pageIds(), ['m4', 'm5', 'm6', 'm7', 'm8'])).toBe(true);
    await swipeTo(8);
    await waitFor(() => expect(pageIds()).toContain('m8'));
    expect(inWindow(pageIds(), ['m6', 'm7', 'm8', 'm9', 'm10'])).toBe(true);
    expect(pageIds()).not.toContain('m4');
  });

  test('항목이 없으면 안내를 보여주고 크래시하지 않는다', async () => {
    mockQueryResult = [];
    await render(<PhotoViewerScreen {...props()} />);
    expect(await screen.findByText('표시할 사진이 없습니다')).toBeTruthy();
  });

  test('initialAssetId가 목록에 없으면 처음부터 열리고 안내를 표시한다', async () => {
    await render(<PhotoViewerScreen {...props({ initialAssetId: 'gone' })} />);
    expect(await screen.findByTestId('viewer-position')).toHaveTextContent('1 / 5');
    expect(screen.getByTestId('viewer-not-found-notice')).toBeTruthy();
  });

  test('사진·영상 혼합 시 영상 페이지는 사진 뷰와 구분된다', async () => {
    mockQueryResult = [img('p1', 100), { ...img('v1', 200), mediaType: 'video', duration: 5000 }];
    await render(<PhotoViewerScreen {...props({ initialAssetId: 'v1' })} />);
    expect(await screen.findByText('영상 재생 준비 중')).toBeTruthy();
  });
});

describe('uri 사전 조회', () => {
  test('현재 장을 먼저 조회하고, 끝난 뒤에 이웃(±2)을 미리 조회한다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    await screen.findByTestId('viewer-position');
    await waitFor(() => expect(mockGetUri.mock.calls.length).toBeGreaterThanOrEqual(3));
    expect(mockGetUri.mock.calls[0][0]).toBe('p3');
    const requested = mockGetUri.mock.calls.map((c) => c[0] as string);
    expect(requested.every((id) => ['p1', 'p2', 'p3', 'p4', 'p5'].includes(id))).toBe(true);
    expect(requested).toContain('p4');
    expect(requested).toContain('p5');
  });
});

describe('크롬', () => {
  test('진입 시 크롬(상단/하단 바)이 표시된다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    expect(await screen.findByTestId('viewer-top-bar')).toBeTruthy();
    expect(screen.getByTestId('viewer-bottom-bar')).toBeTruthy();
    expect(screen.getByTestId('viewer-back')).toBeTruthy();
    expect(screen.getByTestId('viewer-info-button')).toBeTruthy();
  });

  test('슬라이드쇼 버튼은 뷰어 크롬에 없다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    await screen.findByTestId('viewer-top-bar');
    expect(screen.queryByText('슬라이드쇼')).toBeNull();
  });

  test('한 번 탭하면 크롬이 숨고 시스템 바도 숨는다, 다시 탭하면 복귀한다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    await screen.findByTestId('viewer-top-bar');
    await waitFor(() => expect(screen.getByTestId('viewer-p3-image')).toBeTruthy());

    await act(async () => {
    fireGestureHandler(getByGestureTestId('viewer-p3-single-tap'), [{ state: 5 }]);
  });
    await waitFor(() => expect(screen.queryByTestId('viewer-top-bar')).toBeNull());
    expect(screen.queryByTestId('viewer-bottom-bar')).toBeNull();
    expect(mockSetOptions).toHaveBeenLastCalledWith(expect.objectContaining({ navigationBarHidden: true }));

    await act(async () => {
    fireGestureHandler(getByGestureTestId('viewer-p3-single-tap'), [{ state: 5 }]);
  });
    await waitFor(() => expect(screen.getByTestId('viewer-top-bar')).toBeTruthy());
    expect(mockSetOptions).toHaveBeenLastCalledWith(expect.objectContaining({ navigationBarHidden: false }));
  });

  test('뒤로가기 버튼은 goBack을 호출한다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    await fireEvent.press(await screen.findByTestId('viewer-back'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  test('크롬 버튼에는 접근성 라벨이 있다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    expect((await screen.findByTestId('viewer-back')).props.accessibilityLabel).toBe('뒤로');
    expect(screen.getByTestId('viewer-info-button').props.accessibilityLabel).toBe('정보');
  });

  test('파일명이 없으면 앨범명을 제목으로 쓴다', async () => {
    mockQueryResult = [img('p1', 100, { filename: null })];
    await render(<PhotoViewerScreen {...props({ initialAssetId: 'p1' })} />);
    expect(await screen.findByTestId('viewer-title')).toHaveTextContent('여행 사진');
  });
});

describe('확대 중 페이징', () => {
  test('확대하면 페이저 스크롤이 잠기고, 1배로 돌아오면 다시 풀린다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    await screen.findByTestId('viewer-p3-image');
    expect(screen.getByTestId('viewer-pager').props.scrollEnabled).toBe(true);

    await act(async () => {
    fireGestureHandler(getByGestureTestId('viewer-p3-double-tap'), [{ state: 5, x: 375, y: 600 }]);
  });
    await waitFor(() => expect(screen.getByTestId('viewer-pager').props.scrollEnabled).toBe(false));

    await act(async () => {
    fireGestureHandler(getByGestureTestId('viewer-p3-double-tap'), [{ state: 5, x: 375, y: 600 }]);
  });
    await waitFor(() => expect(screen.getByTestId('viewer-pager').props.scrollEnabled).toBe(true));
  });
});

describe('정보 시트', () => {
  test('열면 파일명·촬영일시·해상도가 보이고 파일 크기/경로/GPS 행은 없다', async () => {
    mockQueryResult = [img('p1', new Date(2026, 9, 3, 7, 5).getTime())];
    await render(<PhotoViewerScreen {...props({ initialAssetId: 'p1' })} />);
    await fireEvent.press(await screen.findByTestId('viewer-info-button'));
    expect(screen.getByTestId('viewer-info-filename')).toHaveTextContent('p1.jpg');
    expect(screen.getByTestId('viewer-info-captureTime')).toHaveTextContent('2026-10-03 07:05');
    expect(screen.getByTestId('viewer-info-resolution')).toHaveTextContent('4000 × 3000');
    expect(screen.queryByTestId('viewer-info-size')).toBeNull();
    expect(screen.queryByTestId('viewer-info-path')).toBeNull();
    expect(screen.queryByTestId('viewer-info-duration')).toBeNull();
  });

  test('값이 없으면 -로 표시한다', async () => {
    mockQueryResult = [{ ...img('p1', 0), filename: null, creationTime: null, width: null, height: null }];
    await render(<PhotoViewerScreen {...props({ initialAssetId: 'p1' })} />);
    await fireEvent.press(await screen.findByTestId('viewer-info-button'));
    expect(screen.getByTestId('viewer-info-filename')).toHaveTextContent('-');
    expect(screen.getByTestId('viewer-info-captureTime')).toHaveTextContent('-');
    expect(screen.getByTestId('viewer-info-resolution')).toHaveTextContent('-');
  });

  test('영상이면 길이 행이 추가되고, 닫으면 시트가 사라지며 현재 페이지는 유지된다', async () => {
    mockQueryResult = [img('p0', 50), { ...img('v1', 100), mediaType: 'video', duration: 65000 }];
    await render(<PhotoViewerScreen {...props({ initialAssetId: 'v1' })} />);
    await fireEvent.press(await screen.findByTestId('viewer-info-button'));
    expect(screen.getByTestId('viewer-info-duration')).toHaveTextContent('1:05');
    await fireEvent.press(screen.getByTestId('viewer-info-close'));
    await waitFor(() => expect(screen.queryByTestId('viewer-info-filename')).toBeNull());
    expect(screen.getByTestId('viewer-position')).toHaveTextContent('2 / 2');
  });
});

describe('오류 처리', () => {
  test('uri 조회 실패(삭제된 asset)는 해당 페이지에 안내를 보이고 다른 페이지는 정상이다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetUri.mockImplementation((id: string) => (id === 'p3' ? Promise.reject(new Error('gone')) : Promise.resolve(`file:///${id}.jpg`)));
    await render(<PhotoViewerScreen {...props()} />);
    expect(await screen.findByTestId('viewer-page-error-p3')).toBeTruthy();
    expect(screen.getByText('이 항목을 찾을 수 없어요 (삭제되었을 수 있어요)')).toBeTruthy();
    await swipeTo(3);
    expect(screen.getByTestId('viewer-position')).toHaveTextContent('4 / 5');
    warn.mockRestore();
  });

  test('이미지 로드 실패 시 오류 플레이스홀더와 재시도 버튼이 보이고, 재시도하면 복구된다', async () => {
    await render(<PhotoViewerScreen {...props()} />);
    const image = await screen.findByTestId('viewer-p3-image');
    await fireEvent(image, 'error');
    expect(await screen.findByTestId('viewer-page-error-p3')).toBeTruthy();
    expect(screen.getByText('사진을 표시하지 못했어요')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('viewer-page-retry-p3'));
    expect(await screen.findByTestId('viewer-p3-image')).toBeTruthy();
    expect(screen.queryByTestId('viewer-page-error-p3')).toBeNull();
  });

  test('앨범 조회가 실패하면 안내와 재시도를 보이고 console.warn으로 드러난다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockQueryImpl = () => Promise.reject(new Error('boom'));
    await render(<PhotoViewerScreen {...props()} />);
    expect(await screen.findByTestId('viewer-load-retry')).toBeTruthy();
    expect(warn).toHaveBeenCalled();
    mockQueryImpl = null;
    await fireEvent.press(screen.getByTestId('viewer-load-retry'));
    expect(await screen.findByTestId('viewer-position')).toBeTruthy();
    warn.mockRestore();
  });

  test('로딩 중 언마운트해도 예외가 없다', async () => {
    let resolveQuery: (rows: FakeMeta[]) => void = () => {};
    mockQueryImpl = () => new Promise((r) => (resolveQuery = r));
    const view = await render(<PhotoViewerScreen {...props()} />);
    await view.unmount();
    resolveQuery(fiveItems());
    await Promise.resolve();
  });
});

describe('광고·부수효과 없음', () => {
  test.each([['정상'], ['정보 시트 열림']])('%s 상태에서 배너 광고가 없다', async (label) => {
    await render(<PhotoViewerScreen {...props()} />);
    await screen.findByTestId('viewer-top-bar');
    if (label === '정보 시트 열림') await fireEvent.press(screen.getByTestId('viewer-info-button'));
    expect(screen.queryByTestId('banner-ad')).toBeNull();
  });

  test('오류 상태에서도 배너 광고가 없다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockQueryImpl = () => Promise.reject(new Error('x'));
    await render(<PhotoViewerScreen {...props()} />);
    await screen.findByTestId('viewer-load-retry');
    expect(screen.queryByTestId('banner-ad')).toBeNull();
    warn.mockRestore();
  });

  test('albums row를 만들지 않는다', async () => {
    const mocked = db as jest.Mocked<typeof db>;
    await render(<PhotoViewerScreen {...props()} />);
    await screen.findByTestId('viewer-position');
    await fireEvent.press(screen.getByTestId('viewer-info-button'));
    expect(mocked.getAlbumByDeviceId).not.toHaveBeenCalled();
    expect(mocked.insertAlbum).not.toHaveBeenCalled();
    expect(mocked.upsertSlideshowSettings).not.toHaveBeenCalled();
  });
});
