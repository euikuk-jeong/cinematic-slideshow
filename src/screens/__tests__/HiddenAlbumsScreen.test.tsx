import { fireEvent, render, screen } from '@testing-library/react-native';

import { HiddenAlbumsScreen } from '../HiddenAlbumsScreen';
import { getAppSetting, setAppSetting } from '../../db/client';
import { notifyHiddenAlbumIdsChanged } from '../../settings/hiddenAlbums';

jest.mock('../../db/client', () => ({
  getAppSetting: jest.fn().mockResolvedValue(null),
  setAppSetting: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../settings/hiddenAlbums', () => ({
  ...jest.requireActual('../../settings/hiddenAlbums'),
  notifyHiddenAlbumIdsChanged: jest.fn(),
}));
jest.mock('expo-media-library', () => ({
  Album: Object.assign(
    jest.fn().mockImplementation((id: string) => ({ id })),
    { getAll: jest.fn().mockResolvedValue([]) }
  ),
  Query: jest.fn().mockImplementation(() => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: jest.fn().mockResolvedValue([]),
  })),
  AssetField: { MEDIA_TYPE: 'mediaType' },
  MediaType: { IMAGE: 'image' },
}));

const mockedGetAppSetting = getAppSetting as jest.MockedFunction<typeof getAppSetting>;
const mockedSetAppSetting = setAppSetting as jest.MockedFunction<typeof setAppSetting>;
const mockedNotify = notifyHiddenAlbumIdsChanged as jest.MockedFunction<typeof notifyHiddenAlbumIdsChanged>;

function mockAlbumHasPhotos(hasPhoto: boolean) {
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Query.mockImplementationOnce(() => ({
    album: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: jest.fn().mockResolvedValue(hasPhoto ? [{ id: 'asset-1' }] : []),
  }));
}

beforeEach(() => {
  mockedGetAppSetting.mockResolvedValue(null);
  mockedSetAppSetting.mockClear();
  mockedNotify.mockClear();
});

test('사진이 있는 기기 앨범 목록을 이름순으로 보여준다', async () => {
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumHasPhotos(true);
  mockAlbumHasPhotos(true);
  await render(<HiddenAlbumsScreen />);

  expect(await screen.findByText('가족')).toBeTruthy();
  expect(screen.getByText('여행 사진')).toBeTruthy();
});

test('사진이 한 장도 없는 앨범은 목록에서 제외된다', async () => {
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('Notifications') },
  ]);
  mockAlbumHasPhotos(true);
  mockAlbumHasPhotos(false);
  await render(<HiddenAlbumsScreen />);

  expect(await screen.findByText('여행 사진')).toBeTruthy();
  expect(screen.queryByText('Notifications')).toBeNull();
});

test('기본값은 모두 표시(스위치 on) 상태다', async () => {
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumHasPhotos(true);
  await render(<HiddenAlbumsScreen />);
  await screen.findByText('여행 사진');

  expect(screen.getByTestId('hidden-album-switch-1').props.value).toBe(true);
});

test('이미 숨겨진 앨범은 스위치가 off로 표시된다', async () => {
  mockedGetAppSetting.mockResolvedValue(JSON.stringify(['1']));
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumHasPhotos(true);
  await render(<HiddenAlbumsScreen />);
  await screen.findByText('여행 사진');

  expect(screen.getByTestId('hidden-album-switch-1').props.value).toBe(false);
});

test('스위치를 끄면 숨김 목록에 저장되고 변경을 알린다', async () => {
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumHasPhotos(true);
  await render(<HiddenAlbumsScreen />);
  await screen.findByText('여행 사진');

  await fireEvent(screen.getByTestId('hidden-album-switch-1'), 'valueChange', false);

  expect(mockedSetAppSetting).toHaveBeenCalledWith('album_list_hidden_ids', JSON.stringify(['1']));
  expect(mockedNotify).toHaveBeenCalled();
  expect(screen.getByTestId('hidden-album-switch-1').props.value).toBe(false);
});

test('검색어를 입력하면 제목에 부분일치하는 앨범만 보여준다', async () => {
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([
    { id: '1', getTitle: () => Promise.resolve('여행 사진') },
    { id: '2', getTitle: () => Promise.resolve('가족') },
  ]);
  mockAlbumHasPhotos(true);
  mockAlbumHasPhotos(true);
  await render(<HiddenAlbumsScreen />);
  await screen.findByText('가족');

  await fireEvent.changeText(screen.getByTestId('hidden-albums-search-input'), '여행');

  expect(screen.getByText('여행 사진')).toBeTruthy();
  expect(screen.queryByText('가족')).toBeNull();
});

test('검색 결과가 없으면 전용 안내 문구를 보여준다', async () => {
  const mediaLibrary = jest.requireMock('expo-media-library');
  mediaLibrary.Album.getAll.mockResolvedValueOnce([{ id: '1', getTitle: () => Promise.resolve('여행 사진') }]);
  mockAlbumHasPhotos(true);
  await render(<HiddenAlbumsScreen />);
  await screen.findByText('여행 사진');

  await fireEvent.changeText(screen.getByTestId('hidden-albums-search-input'), '존재하지않음');

  expect(screen.getByText('검색 결과가 없어요')).toBeTruthy();
});
