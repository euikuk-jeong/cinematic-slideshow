import { renderHook, waitFor } from '@testing-library/react-native';

import { usePhotoUri } from '../usePhotoUri';

const mockGetUri = jest.fn();
jest.mock('expo-media-library', () => ({
  Asset: jest.fn().mockImplementation((id: string) => ({ getUri: () => mockGetUri(id) })),
}));

beforeEach(() => {
  mockGetUri.mockReset();
});

test('getUri 성공 시 uri를 반환하고 error는 false다', async () => {
  mockGetUri.mockResolvedValue('file:///ok1.jpg');
  const { result } = await renderHook(() => usePhotoUri('ok1'));
  await waitFor(() => expect(result.current.uri).toBe('file:///ok1.jpg'));
  expect(result.current.error).toBe(false);
});

test('getUri가 reject되면 uri는 null, error는 true이고 console.warn으로 드러난다', async () => {
  mockGetUri.mockRejectedValue(new Error('gone'));
  const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  const { result } = await renderHook(() => usePhotoUri('bad1'));
  await waitFor(() => expect(result.current.error).toBe(true));
  expect(result.current.uri).toBeNull();
  expect(warnSpy).toHaveBeenCalled();
  warnSpy.mockRestore();
});

test('같은 id를 다시 마운트하면 캐시를 써서 getUri를 추가 호출하지 않는다', async () => {
  mockGetUri.mockResolvedValue('file:///cached1.jpg');
  const first = await renderHook(() => usePhotoUri('cached1'));
  await waitFor(() => expect(first.result.current.uri).toBe('file:///cached1.jpg'));
  const second = await renderHook(() => usePhotoUri('cached1'));
  expect(second.result.current.uri).toBe('file:///cached1.jpg');
  expect(mockGetUri).toHaveBeenCalledTimes(1);
});

test('modificationTime이 바뀌면 다시 조회한다', async () => {
  mockGetUri.mockResolvedValueOnce('file:///m-old.jpg').mockResolvedValueOnce('file:///m-new.jpg');
  const { result, rerender } = await renderHook(({ mt }: { mt: number }) => usePhotoUri('mod1', mt), {
    initialProps: { mt: 1 },
  });
  await waitFor(() => expect(result.current.uri).toBe('file:///m-old.jpg'));
  await rerender({ mt: 2 });
  await waitFor(() => expect(result.current.uri).toBe('file:///m-new.jpg'));
});

test('id가 바뀌는 중 이전 요청이 늦게 끝나도 새 id의 상태를 덮어쓰지 않는다', async () => {
  let resolveOld: (v: string) => void = () => {};
  mockGetUri.mockImplementation((id: string) =>
    id === 'race-old' ? new Promise<string>((r) => (resolveOld = r)) : Promise.resolve('file:///race-new.jpg')
  );
  const { result, rerender } = await renderHook(({ id }: { id: string }) => usePhotoUri(id), {
    initialProps: { id: 'race-old' },
  });
  await rerender({ id: 'race-new' });
  await waitFor(() => expect(result.current.uri).toBe('file:///race-new.jpg'));
  resolveOld('file:///race-old.jpg');
  await Promise.resolve();
  expect(result.current.uri).toBe('file:///race-new.jpg');
});
