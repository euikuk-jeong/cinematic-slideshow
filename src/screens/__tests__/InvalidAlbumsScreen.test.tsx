import { Alert } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { deleteAlbum, getAllAlbums } from '../../db/client';
import type { Album } from '../../db/types';
import { InvalidAlbumsScreen } from '../InvalidAlbumsScreen';

jest.mock('../../db/client', () => ({
  getAllAlbums: jest.fn(),
  deleteAlbum: jest.fn().mockResolvedValue(undefined),
}));

const mockedGetAllAlbums = getAllAlbums as jest.MockedFunction<typeof getAllAlbums>;
const mockedDeleteAlbum = deleteAlbum as jest.MockedFunction<typeof deleteAlbum>;

function album(overrides: Partial<Album> = {}): Album {
  return {
    id: 1,
    deviceAlbumId: 'device-1',
    displayName: '여행 사진',
    isReferenceValid: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mockedGetAllAlbums.mockReset();
  mockedDeleteAlbum.mockReset().mockResolvedValue(undefined);
});

test('무효 앨범이 없으면 안내 문구를 보여준다', async () => {
  mockedGetAllAlbums.mockResolvedValue([album({ id: 1, isReferenceValid: true })]);
  await render(<InvalidAlbumsScreen />);
  expect(await screen.findByText('정리할 앨범이 없어요')).toBeTruthy();
});

test('무효 앨범만 걸러 목록으로 보여준다', async () => {
  mockedGetAllAlbums.mockResolvedValue([
    album({ id: 1, displayName: '유효한 앨범', isReferenceValid: true }),
    album({ id: 2, displayName: '삭제된 앨범', isReferenceValid: false }),
  ]);
  await render(<InvalidAlbumsScreen />);

  expect(await screen.findByText('삭제된 앨범')).toBeTruthy();
  expect(screen.queryByText('유효한 앨범')).toBeNull();
  expect(screen.getByText('기기에서 삭제된 앨범 1개')).toBeTruthy();
});

test('개별 삭제 확인 시 deleteAlbum을 호출하고 목록에서 제거한다', async () => {
  mockedGetAllAlbums.mockResolvedValue([album({ id: 2, displayName: '삭제된 앨범', isReferenceValid: false })]);
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    const confirm = buttons?.find((b) => b.style === 'destructive');
    confirm?.onPress?.();
  });
  await render(<InvalidAlbumsScreen />);
  await screen.findByText('삭제된 앨범');

  await fireEvent.press(screen.getByTestId('invalid-album-delete-2'));

  expect(mockedDeleteAlbum).toHaveBeenCalledWith(2);
  expect(await screen.findByText('정리할 앨범이 없어요')).toBeTruthy();
});

test('모두 삭제 확인 시 전체 앨범을 삭제한다', async () => {
  mockedGetAllAlbums.mockResolvedValue([
    album({ id: 2, displayName: '앨범 A', isReferenceValid: false }),
    album({ id: 3, displayName: '앨범 B', isReferenceValid: false }),
  ]);
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    const confirm = buttons?.find((b) => b.style === 'destructive');
    confirm?.onPress?.();
  });
  await render(<InvalidAlbumsScreen />);
  await screen.findByText('앨범 A');

  await fireEvent.press(screen.getByTestId('invalid-albums-delete-all'));

  expect(mockedDeleteAlbum).toHaveBeenCalledWith(2);
  expect(mockedDeleteAlbum).toHaveBeenCalledWith(3);
  expect(await screen.findByText('정리할 앨범이 없어요')).toBeTruthy();
});

test('삭제 취소 시 deleteAlbum을 호출하지 않는다', async () => {
  mockedGetAllAlbums.mockResolvedValue([album({ id: 2, displayName: '삭제된 앨범', isReferenceValid: false })]);
  jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    const cancel = buttons?.find((b) => b.style === 'cancel');
    cancel?.onPress?.();
  });
  await render(<InvalidAlbumsScreen />);
  await screen.findByText('삭제된 앨범');

  await fireEvent.press(screen.getByTestId('invalid-album-delete-2'));

  expect(mockedDeleteAlbum).not.toHaveBeenCalled();
  expect(screen.getByText('삭제된 앨범')).toBeTruthy();
});
