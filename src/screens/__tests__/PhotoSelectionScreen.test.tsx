import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { PhotoSelectionScreen } from '../PhotoSelectionScreen';
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

jest.mock('expo-media-library', () => ({
  Album: jest.fn().mockImplementation((id: string) => ({ id })),
  Query: jest.fn().mockImplementation(() => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
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
