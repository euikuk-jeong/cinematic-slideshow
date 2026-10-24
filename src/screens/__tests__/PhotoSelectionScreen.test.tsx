import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PhotoSelectionScreen } from '../PhotoSelectionScreen';
import { isBannerLastChildOfRoot } from '../../ads/bannerPlacement';
import * as db from '../../db/client';

jest.mock('../../db/client', () => ({
  getSelectedPhotoIds: jest.fn(),
  addSelectedPhoto: jest.fn(),
  removeSelectedPhoto: jest.fn(),
  setSelectedPhotoIds: jest.fn(),
}));

interface FakeAssetMetadata {
  id: string;
  filename: string | null;
  creationTime: number | null;
}

let mockQueryResult: FakeAssetMetadata[] = [];

// 슬라이드쇼 대상(사진)에 영상이 번지지 않는지 고정하려고 eq(필드, 값) 호출을 기록한다.
const mockMediaTypeEqCalls: unknown[][] = [];

jest.mock('expo-media-library', () => ({
  Album: jest.fn().mockImplementation((id: string) => ({ id })),
  Query: jest.fn().mockImplementation(() => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn(function (this: unknown, ...args: unknown[]) {
      mockMediaTypeEqCalls.push(args);
      return this;
    }),
    exeForMetadata: jest.fn().mockImplementation(() => Promise.resolve(mockQueryResult)),
  })),
  Asset: jest.fn().mockImplementation((id: string) => ({ getUri: jest.fn().mockResolvedValue(`file:///${id}.jpg`) })),
  AssetField: { MEDIA_TYPE: 'mediaType' },
  MediaType: { IMAGE: 'image' },
}));

const mockedDb = db as jest.Mocked<typeof db>;

const routeProps = {
  route: { params: { albumId: 1, deviceAlbumId: 'device-album-1', displayName: '여행 사진' } },
} as any;

beforeEach(() => {
  jest.clearAllMocks();
  mockMediaTypeEqCalls.length = 0;
  mockedDb.getSelectedPhotoIds.mockResolvedValue([]);
  mockedDb.setSelectedPhotoIds.mockResolvedValue(undefined);
  mockedDb.addSelectedPhoto.mockResolvedValue(undefined);
  mockedDb.removeSelectedPhoto.mockResolvedValue(undefined);
});

test('사진이 없으면 안내 문구를 보여준다', async () => {
  mockQueryResult = [];
  await render(<PhotoSelectionScreen {...routeProps} />);
  expect(await screen.findByText('사진이 없어요')).toBeTruthy();
});

test('선택된 사진이 없으면 "전체 사진 재생"으로 표시된다', async () => {
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<PhotoSelectionScreen {...routeProps} />);
  expect(await screen.findByText('전체 사진 재생 (2장)')).toBeTruthy();
});

test('사진을 탭하면 선택되고 addSelectedPhoto가 호출된다', async () => {
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<PhotoSelectionScreen {...routeProps} />);

  await screen.findByTestId('photo-item-p1');
  await fireEvent.press(screen.getByTestId('photo-item-p1'));

  expect(mockedDb.addSelectedPhoto).toHaveBeenCalledWith(1, 'p1');
  expect(await screen.findByText('1장 선택됨')).toBeTruthy();
});

test('선택된 사진을 다시 탭하면 해제되고 removeSelectedPhoto가 호출된다', async () => {
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  mockedDb.getSelectedPhotoIds.mockResolvedValue(['p1']);
  await render(<PhotoSelectionScreen {...routeProps} />);

  expect(await screen.findByText('1장 선택됨')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('photo-item-p1'));

  expect(mockedDb.removeSelectedPhoto).toHaveBeenCalledWith(1, 'p1');
  expect(await screen.findByText('전체 사진 재생 (1장)')).toBeTruthy();
});

test('"전체 선택"을 누르면 모든 사진이 선택되고 setSelectedPhotoIds가 호출된다', async () => {
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<PhotoSelectionScreen {...routeProps} />);
  await screen.findByText('전체 사진 재생 (2장)');

  await fireEvent.press(screen.getByTestId('photo-select-all'));

  expect(mockedDb.setSelectedPhotoIds).toHaveBeenCalledWith(1, ['p1', 'p2']);
  expect(await screen.findByText('2장 선택됨')).toBeTruthy();
});

test('"전체 해제"를 누르면 선택이 비워진다', async () => {
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  mockedDb.getSelectedPhotoIds.mockResolvedValue(['p1']);
  await render(<PhotoSelectionScreen {...routeProps} />);
  await screen.findByText('1장 선택됨');

  await fireEvent.press(screen.getByTestId('photo-deselect-all'));

  expect(mockedDb.setSelectedPhotoIds).toHaveBeenCalledWith(1, []);
  expect(await screen.findByText('전체 사진 재생 (1장)')).toBeTruthy();
});

test('리스트 보기에서 파일명 정렬 기준을 바꾸면 순서가 바뀐다', async () => {
  mockQueryResult = [
    { id: 'p1', filename: 'banana.jpg', creationTime: 200 },
    { id: 'p2', filename: 'apple.jpg', creationTime: 100 },
  ];
  await render(<PhotoSelectionScreen {...routeProps} />);
  await fireEvent.press(screen.getByTestId('photo-view-mode-list'));

  // 기본 정렬은 촬영시간 내림차순 — p1(200)이 먼저 온다.
  let items = screen.getAllByTestId(/^photo-item-/);
  expect(items.map((el) => el.props.testID)).toEqual(['photo-item-p1', 'photo-item-p2']);

  await fireEvent.press(screen.getByTestId('photo-sort-criterion-filename'));
  await fireEvent.press(screen.getByTestId('photo-sort-direction-asc'));

  // 파일명 오름차순 — apple(p2)이 banana(p1)보다 먼저.
  await waitFor(() => {
    items = screen.getAllByTestId(/^photo-item-/);
    expect(items.map((el) => el.props.testID)).toEqual(['photo-item-p2', 'photo-item-p1']);
  });
});

test('날짜별 보기에서 날짜 섹션 헤더가 표시된다', async () => {
  const d = new Date(2026, 7, 30, 10, 0).getTime();
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: d }];
  await render(<PhotoSelectionScreen {...routeProps} />);

  await fireEvent.press(screen.getByTestId('photo-view-mode-date'));

  expect(await screen.findByText('2026년 8월 30일')).toBeTruthy();
});

// FR-AD: 배너 광고는 화면 맨 아래(루트 View의 마지막 자식)에 붙는다 — 로딩/빈/정상 모두 동일.
test.each([
  ['빈 앨범', []],
  ['사진이 있는 앨범', [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }]],
])('banner-ad가 루트 View의 마지막 자식이다 (%s)', async (_label, photos) => {
  mockQueryResult = photos as FakeAssetMetadata[];
  await render(<PhotoSelectionScreen {...routeProps} />);
  await waitFor(() => expect(screen.getByTestId('banner-ad')).toBeTruthy());
  expect(isBannerLastChildOfRoot(screen.toJSON() as any)).toBe(true);
});

// FR-VD5: 사진 선택 화면은 영상을 보여주지 않는다 — 사진(IMAGE)만 조회한다.
test('사진(IMAGE)만 조회한다', async () => {
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<PhotoSelectionScreen {...routeProps} />);
  await screen.findByTestId('photo-item-p1');
  expect(mockMediaTypeEqCalls).toEqual([['mediaType', 'image']]);
});
