import { subscribeToAlbumContentsChanged } from '../../library/albumContentsEvents';
import { runMediaMutation } from '../mediaMutations';

const mockAssetDelete = jest.fn();
const mockAlbumAdd = jest.fn();
const mockAlbumCtor = jest.fn();
jest.mock('expo-media-library', () => ({
  Asset: Object.assign(
    jest.fn().mockImplementation((id: string) => ({ id })),
    { delete: (assets: unknown[]) => mockAssetDelete(assets) }
  ),
  Album: jest.fn().mockImplementation((id: string) => {
    mockAlbumCtor(id);
    return { add: (assets: unknown[]) => mockAlbumAdd(assets) };
  }),
}));

const mockQueryAlbumItems = jest.fn();
jest.mock('../queryAlbumItems', () => ({ queryAlbumItems: (id: string) => mockQueryAlbumItems(id) }));

const mockGetAlbumByDeviceId = jest.fn();
const mockRemoveSelectedPhotos = jest.fn();
jest.mock('../../db/client', () => ({
  getAlbumByDeviceId: (id: string) => mockGetAlbumByDeviceId(id),
  removeSelectedPhotos: (albumId: number, ids: string[]) => mockRemoveSelectedPhotos(albumId, ids),
}));

const mockInvalidate = jest.fn();
jest.mock('../usePhotoUri', () => ({ invalidatePhotoUris: (ids: string[]) => mockInvalidate(ids) }));

function item(id: string) {
  return { id };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAssetDelete.mockResolvedValue(undefined);
  mockAlbumAdd.mockResolvedValue(undefined);
  mockGetAlbumByDeviceId.mockResolvedValue({ id: 7 });
  mockRemoveSelectedPhotos.mockResolvedValue(undefined);
});

describe('runMediaMutation delete', () => {
  it('Asset.delete를 호출하고, 재조회에서 사라진 id를 removed로 돌려준다', async () => {
    mockQueryAlbumItems.mockResolvedValue([item('c')]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'delete' });
    expect(mockAssetDelete).toHaveBeenCalledWith([{ id: 'a' }, { id: 'b' }]);
    expect(result.summary).toEqual({ removedIds: ['a', 'b'], remainingIds: [] });
    expect(result.items).toEqual([item('c')]);
    expect(result.error).toBeNull();
  });

  it('사라진 id의 선택 기록을 지우고 URI 캐시를 비운다', async () => {
    mockQueryAlbumItems.mockResolvedValue([]);
    await runMediaMutation('dev1', ['a'], { kind: 'delete' });
    expect(mockGetAlbumByDeviceId).toHaveBeenCalledWith('dev1');
    expect(mockRemoveSelectedPhotos).toHaveBeenCalledWith(7, ['a']);
    expect(mockInvalidate).toHaveBeenCalledWith(['a']);
  });

  it('사용자 취소(예외)면 error를 돌려주고 항목은 모두 remaining이며 선택 기록은 건드리지 않는다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAssetDelete.mockRejectedValue(new Error('user did not grant'));
    mockQueryAlbumItems.mockResolvedValue([item('a'), item('b')]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'delete' });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.summary.removedIds).toEqual([]);
    expect(result.summary.remainingIds).toEqual(['a', 'b']);
    expect(mockRemoveSelectedPhotos).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('예외가 났어도 재조회에서 실제로 사라졌으면 그만큼은 성공으로 센다(일부 성공)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAssetDelete.mockRejectedValue(new Error('partial'));
    mockQueryAlbumItems.mockResolvedValue([item('b')]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'delete' });
    expect(result.summary).toEqual({ removedIds: ['a'], remainingIds: ['b'] });
    warn.mockRestore();
  });

  it('앨범 row가 아직 없으면(설정 화면 미진입) 선택 기록 정리를 건너뛴다', async () => {
    mockGetAlbumByDeviceId.mockResolvedValue(null);
    mockQueryAlbumItems.mockResolvedValue([]);
    await runMediaMutation('dev1', ['a'], { kind: 'delete' });
    expect(mockRemoveSelectedPhotos).not.toHaveBeenCalled();
  });

  it('선택 기록 정리가 실패해도 작업 결과는 그대로 돌려준다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockRemoveSelectedPhotos.mockRejectedValue(new Error('db'));
    mockQueryAlbumItems.mockResolvedValue([]);
    const result = await runMediaMutation('dev1', ['a'], { kind: 'delete' });
    expect(result.summary.removedIds).toEqual(['a']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('runMediaMutation 앨범 목록 갱신 알림', () => {
  it('항목이 실제로 사라졌으면 알린다', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToAlbumContentsChanged(listener);
    mockQueryAlbumItems.mockResolvedValue([]);
    await runMediaMutation('dev1', ['a'], { kind: 'delete' });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('아무것도 사라지지 않았으면(취소/실패) 알리지 않는다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const listener = jest.fn();
    const unsubscribe = subscribeToAlbumContentsChanged(listener);
    mockAssetDelete.mockRejectedValue(new Error('cancelled'));
    mockQueryAlbumItems.mockResolvedValue([item('a')]);
    await runMediaMutation('dev1', ['a'], { kind: 'delete' });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
    warn.mockRestore();
  });
});

describe('runMediaMutation move', () => {
  it('대상 앨범의 add를 호출한다', async () => {
    mockQueryAlbumItems.mockResolvedValue([]);
    const result = await runMediaMutation('dev1', ['a'], { kind: 'move', targetAlbumId: 'dev2' });
    expect(mockAlbumCtor).toHaveBeenCalledWith('dev2');
    expect(mockAlbumAdd).toHaveBeenCalledWith([{ id: 'a' }]);
    expect(mockAssetDelete).not.toHaveBeenCalled();
    expect(result.summary.removedIds).toEqual(['a']);
  });

  it('재조회에 실패하면 예외를 그대로 올린다(성공으로 오인하지 않는다)', async () => {
    mockQueryAlbumItems.mockRejectedValue(new Error('query'));
    await expect(runMediaMutation('dev1', ['a'], { kind: 'delete' })).rejects.toThrow('query');
  });
});
