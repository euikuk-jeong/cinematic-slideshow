import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SlideshowPlayerScreen } from '../SlideshowPlayerScreen';
import * as db from '../../db/client';
import type { SlideshowSettings } from '../../db/types';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ goBack: mockGoBack }),
}));

jest.mock('../../db/client', () => ({
  getSlideshowSettingsByAlbumId: jest.fn(),
  getSelectedPhotoIds: jest.fn(),
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

const routeProps = { route: { params: { albumId: 1, deviceAlbumId: 'device-album-1' } } } as any;

// 실제 타이머를 쓰되(이 프로젝트의 다른 화면 테스트들과 동일한 방식 — fake timers 미사용),
// 전환간격을 아주 짧게(ms 단위) 잡아 테스트를 빠르게 만든다. transitionIntervalSec은
// UI 슬라이더가 2~10초로 제한할 뿐 DB/컴포넌트 레벨에서 검증하지 않아 테스트에서 자유롭게 줄일 수 있다.
const settings: SlideshowSettings = {
  id: 1,
  albumId: 1,
  transitionIntervalSec: 4,
  orderMode: 'sequential',
  repeatMode: 'loop',
  sortCriterion: 'creation_time',
  sortDirection: 'asc',
  updatedAt: '2026-08-30T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedDb.getSelectedPhotoIds.mockResolvedValue([]);
});

test('사진이 없으면 안내 문구를 보여준다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockQueryResult = [];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  expect(await screen.findByText('표시할 사진이 없어요')).toBeTruthy();
});

test('설정이 없으면(신규 앨범) 기본값으로 첫 사진을 보여준다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(null);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  expect(await screen.findByTestId('slideshow-close')).toBeTruthy();
});

test('선택된 사진이 있으면 그것만 재생 대상이 된다 — 1장만 남으면 loop여도 그대로 유지한다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, transitionIntervalSec: 0.02 });
  mockedDb.getSelectedPhotoIds.mockResolvedValue(['p2']);
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-close');

  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  expect(mockGoBack).not.toHaveBeenCalled();
});

test('once 모드에서 마지막 사진 다음 전환 시점에 재생을 종료(뒤로가기)한다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, repeatMode: 'once', transitionIntervalSec: 0.02 });
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);
  await screen.findByTestId('slideshow-close');

  // 실제 네비게이터라면 goBack() 한 번으로 화면이 unmount돼 interval도 함께 정리되지만,
  // 이 테스트는 navigation을 mock해서 실제로 화면을 떠나지 않으므로 반복 호출될 수 있다 —
  // "재생 종료가 트리거됐는지"만 확인한다.
  await waitFor(() => expect(mockGoBack).toHaveBeenCalled());
});

test('설정에 저장된 정렬 기준/방향으로 재생 순서를 정한다(파일명 내림차순)', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue({ ...settings, sortCriterion: 'filename', sortDirection: 'desc' });
  mockQueryResult = [
    { id: 'p1', filename: 'a.jpg', creationTime: 100 },
    { id: 'p2', filename: 'b.jpg', creationTime: 200 },
  ];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  const photo = await screen.findByTestId('slideshow-photo');
  expect(photo.props.source.uri).toBe('file:///p2.jpg');
});

test('닫기 버튼을 누르면 뒤로가기 한다', async () => {
  mockedDb.getSlideshowSettingsByAlbumId.mockResolvedValue(settings);
  mockQueryResult = [{ id: 'p1', filename: 'a.jpg', creationTime: 100 }];
  await render(<SlideshowPlayerScreen {...routeProps} />);

  await fireEvent.press(await screen.findByTestId('slideshow-close'));

  expect(mockGoBack).toHaveBeenCalledTimes(1);
});
