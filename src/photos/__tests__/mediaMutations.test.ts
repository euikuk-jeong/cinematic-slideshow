import { subscribeToAlbumContentsChanged } from '../../library/albumContentsEvents';
import { movesToTrash, runAlbumsMutation, runMediaMutation } from '../mediaMutations';

const mockAssetDelete = jest.fn();
const mockAlbumAdd = jest.fn();
const mockAlbumCtor = jest.fn();
const mockAlbumCreate = jest.fn();
const mockAssetCreate = jest.fn();
const mockIsTrashAvailable = jest.fn(() => false);
const mockMoveToTrash = jest.fn();
jest.mock('../mediaTrash', () => ({
  isTrashAvailable: () => mockIsTrashAvailable(),
  moveToTrash: (ids: string[]) => mockMoveToTrash(ids),
}));
const mockGetUri = jest.fn();
const mockTransferFiles = jest.fn();
jest.mock('../fileMover', () => ({
  transferFiles: (...args: unknown[]) => mockTransferFiles(...args),
}));
jest.mock('expo-media-library', () => ({
  Asset: Object.assign(
    // getUri는 열거 불가로 달아 둔다 — 기존 테스트가 toHaveBeenCalledWith([{ id }])로 비교한다.
    jest.fn().mockImplementation((id: string) =>
      Object.defineProperty({ id }, 'getUri', { value: () => mockGetUri(id), enumerable: false })
    ),
    {
      delete: (assets: unknown[]) => mockAssetDelete(assets),
      create: (path: string, album: unknown) => mockAssetCreate(path, album),
    }
  ),
  Album: Object.assign(
    jest.fn().mockImplementation((id: string) => {
      mockAlbumCtor(id);
      return { add: (assets: unknown[]) => mockAlbumAdd(assets) };
    }),
    { create: (name: string, assets: unknown[], move: boolean) => mockAlbumCreate(name, assets, move) }
  ),
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

describe('runMediaMutation moveToNew', () => {
  beforeEach(() => {
    mockAlbumCreate.mockResolvedValue({ id: 'new-album' });
  });

  it('Album.create를 이름·자산·이동(복사 아님)으로 호출하고 기존 앨범 add는 쓰지 않는다', async () => {
    mockQueryAlbumItems.mockResolvedValue([]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'moveToNew', folderName: '여행 2024' });
    expect(mockAlbumCreate).toHaveBeenCalledWith('여행 2024', [{ id: 'a' }, { id: 'b' }], true);
    expect(mockAlbumCtor).not.toHaveBeenCalled();
    expect(mockAlbumAdd).not.toHaveBeenCalled();
    expect(result.summary).toEqual({ removedIds: ['a', 'b'], remainingIds: [] });
  });

  it('성공하면 앨범 목록 갱신을 알리고 선택 기록을 정리한다', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToAlbumContentsChanged(listener);
    mockQueryAlbumItems.mockResolvedValue([]);
    await runMediaMutation('dev1', ['a'], { kind: 'moveToNew', folderName: 'New' });
    expect(listener).toHaveBeenCalledTimes(1);
    expect(mockRemoveSelectedPhotos).toHaveBeenCalledWith(7, ['a']);
    unsubscribe();
  });

  it('네이티브가 던져도(이름 거부·취소) error로 돌려주고 항목은 그대로 남는다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAlbumCreate.mockRejectedValue(new Error('Invalid relative path'));
    mockQueryAlbumItems.mockResolvedValue([item('a')]);
    const result = await runMediaMutation('dev1', ['a'], { kind: 'moveToNew', folderName: 'x' });
    expect(result.error).toBeInstanceOf(Error);
    expect(result.summary).toEqual({ removedIds: [], remainingIds: ['a'] });
    expect(mockRemoveSelectedPhotos).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('runMediaMutation moveDirect', () => {
  beforeEach(() => {
    mockTransferFiles.mockResolvedValue([]);
    mockGetUri.mockImplementation((id: string) => Promise.resolve(`file:///storage/emulated/0/DCIM/Camera/${id}.jpg`));
  });

  it('각 항목의 파일 경로를 찾아 목적 폴더로 직접 이동(move=true)시킨다', async () => {
    mockQueryAlbumItems.mockResolvedValue([]);
    const result = await runMediaMutation('dev1', ['a', 'b'], {
      kind: 'moveDirect',
      destinationDir: '/storage/emulated/0/_MyData/Photo',
    });
    expect(mockTransferFiles).toHaveBeenCalledWith(
      ['/storage/emulated/0/DCIM/Camera/a.jpg', '/storage/emulated/0/DCIM/Camera/b.jpg'],
      '/storage/emulated/0/_MyData/Photo',
      true
    );
    expect(mockAlbumCreate).not.toHaveBeenCalled();
    expect(mockAlbumAdd).not.toHaveBeenCalled();
    expect(result.summary).toEqual({ removedIds: ['a', 'b'], remainingIds: [] });
    expect(result.error).toBeNull();
  });

  it('파일 경로를 알 수 없는 항목(content://)이 있으면 옮기지 않고 error로 돌려준다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetUri.mockResolvedValue('content://media/external/images/media/1');
    mockQueryAlbumItems.mockResolvedValue([item('a')]);
    const result = await runMediaMutation('dev1', ['a'], { kind: 'moveDirect', destinationDir: '/x' });
    expect(mockTransferFiles).not.toHaveBeenCalled();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.summary.remainingIds).toEqual(['a']);
    warn.mockRestore();
  });

  it('일부 항목이 실패하면 첫 오류를 error로 돌려주고 옮겨진 만큼은 성공으로 센다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockTransferFiles.mockResolvedValue([
      { source: 'a', destination: 'x/a', ok: true, error: null },
      { source: 'b', destination: null, ok: false, error: 'Could not remove the original file after copying' },
    ]);
    mockQueryAlbumItems.mockResolvedValue([item('b')]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'moveDirect', destinationDir: '/x' });
    expect(result.error).toEqual(new Error('Could not remove the original file after copying'));
    expect(result.summary).toEqual({ removedIds: ['a'], remainingIds: ['b'] });
    warn.mockRestore();
  });

  it('네이티브 모듈이 던지면(권한 없음 등) error로 돌려준다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockTransferFiles.mockRejectedValue(new Error('All files access is not granted'));
    mockQueryAlbumItems.mockResolvedValue([item('a')]);
    const result = await runMediaMutation('dev1', ['a'], { kind: 'moveDirect', destinationDir: '/x' });
    expect(result.error).toEqual(new Error('All files access is not granted'));
    warn.mockRestore();
  });
});

describe('runMediaMutation copy', () => {
  beforeEach(() => {
    mockAlbumCreate.mockResolvedValue({ id: 'new-album' });
    mockAssetCreate.mockResolvedValue({ id: 'copied' });
    mockTransferFiles.mockResolvedValue([]);
    mockGetUri.mockImplementation((id: string) => Promise.resolve(`file:///storage/emulated/0/DCIM/Camera/${id}.jpg`));
  });

  it('copy(기존 앨범): 한글·공백 파일명도 getUri()의 인코딩된 URI 그대로 넘긴다', async () => {
    mockGetUri.mockResolvedValue('file:///storage/emulated/0/DCIM/Camera/%EC%97%AC%ED%96%89%20a.jpg');
    mockQueryAlbumItems.mockResolvedValue([item('a')]);
    await runMediaMutation('dev1', ['a'], { kind: 'copy', targetAlbumId: 'dev2' });
    expect(mockAssetCreate.mock.calls[0][0]).toBe('file:///storage/emulated/0/DCIM/Camera/%EC%97%AC%ED%96%89%20a.jpg');
  });

  it('copyToNew: Album.create를 이동 아님(false)으로 호출하고, 원본이 남아 있어도 사본을 만든 항목을 성공으로 센다', async () => {
    mockQueryAlbumItems.mockResolvedValue([item('a'), item('b')]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'copyToNew', folderName: '여행' });
    expect(mockAlbumCreate).toHaveBeenCalledWith('여행', [{ id: 'a' }, { id: 'b' }], false);
    expect(result.summary).toEqual({ removedIds: ['a', 'b'], remainingIds: [] });
    expect(result.error).toBeNull();
  });

  it('copyToNew가 던지면 사본이 없다고 보고 error를 돌려준다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAlbumCreate.mockRejectedValue(new Error('boom'));
    mockQueryAlbumItems.mockResolvedValue([item('a')]);
    const result = await runMediaMutation('dev1', ['a'], { kind: 'copyToNew', folderName: 'x' });
    expect(result.summary).toEqual({ removedIds: [], remainingIds: ['a'] });
    expect(result.error).toEqual(new Error('boom'));
    warn.mockRestore();
  });

  it('copy(기존 앨범): 항목마다 원본 파일 경로로 Asset.create를 부르고 대상 앨범을 넘긴다', async () => {
    mockQueryAlbumItems.mockResolvedValue([item('a'), item('b')]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'copy', targetAlbumId: 'dev2' });
    expect(mockAssetCreate).toHaveBeenCalledTimes(2);
    // 스킴 없는 경로는 네이티브에서 "No content provider"로 실패한다 — getUri()의 file:// URI를 그대로 넘긴다.
    expect(mockAssetCreate.mock.calls[0][0]).toBe('file:///storage/emulated/0/DCIM/Camera/a.jpg');
    expect(mockAlbumCtor).toHaveBeenCalledWith('dev2');
    expect(mockAlbumAdd).not.toHaveBeenCalled();
    expect(result.summary).toEqual({ removedIds: ['a', 'b'], remainingIds: [] });
  });

  it('copy: 일부 항목이 실패해도 나머지는 계속 복사하고 일부 성공으로 센다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockAssetCreate.mockResolvedValueOnce({ id: 'ok' }).mockRejectedValueOnce(new Error('disk full'));
    mockQueryAlbumItems.mockResolvedValue([item('a'), item('b')]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'copy', targetAlbumId: 'dev2' });
    expect(result.summary).toEqual({ removedIds: ['a'], remainingIds: ['b'] });
    expect(result.error).toEqual(new Error('disk full'));
    warn.mockRestore();
  });

  it('copyDirect: 네이티브에 move=false로 요청하고 항목별 성공 여부로 센다', async () => {
    mockTransferFiles.mockResolvedValue([
      { source: 'x', destination: 'y', ok: true, error: null },
      { source: 'x2', destination: null, ok: false, error: 'Source file not found' },
    ]);
    mockQueryAlbumItems.mockResolvedValue([item('a'), item('b')]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'copyDirect', destinationDir: '/x/y' });
    expect(mockTransferFiles).toHaveBeenCalledWith(
      ['/storage/emulated/0/DCIM/Camera/a.jpg', '/storage/emulated/0/DCIM/Camera/b.jpg'],
      '/x/y',
      false
    );
    expect(result.summary).toEqual({ removedIds: ['a'], remainingIds: ['b'] });
    expect(result.error).toEqual(new Error('Source file not found'));
  });

  it('복사는 선택 기록을 지우지 않고, 사본이 생겼으면 앨범 목록 갱신을 알린다', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToAlbumContentsChanged(listener);
    mockQueryAlbumItems.mockResolvedValue([item('a')]);
    await runMediaMutation('dev1', ['a'], { kind: 'copyToNew', folderName: 'x' });
    expect(mockRemoveSelectedPhotos).not.toHaveBeenCalled();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});

describe('runAlbumsMutation', () => {
  beforeEach(() => {
    mockAlbumCreate.mockResolvedValue({ id: 'new-album' });
    mockTransferFiles.mockResolvedValue([]);
    mockGetUri.mockImplementation((id: string) => Promise.resolve(`file:///storage/emulated/0/DCIM/Camera/${id}.jpg`));
  });

  const albumItems: Record<string, string[]> = { A: ['a1', 'a2'], B: ['b1'] };
  function mockAlbums(after: Record<string, string[]>) {
    let phase: 'before' | 'after' = 'before';
    mockQueryAlbumItems.mockImplementation(async (id: string) => (phase === 'before' ? albumItems : after)[id].map(item));
    return () => {
      phase = 'after';
    };
  }

  it('여러 앨범의 항목을 모아 삭제를 한 번만 요청하고, 비게 된 앨범을 알려준다', async () => {
    const toAfter = mockAlbums({ A: [], B: ['b1'] });
    mockAssetDelete.mockImplementation(async () => toAfter());
    const result = await runAlbumsMutation(['A', 'B'], { kind: 'delete' });
    expect(mockAssetDelete).toHaveBeenCalledTimes(1);
    expect(mockAssetDelete).toHaveBeenCalledWith([{ id: 'a1' }, { id: 'a2' }, { id: 'b1' }]);
    expect(result.summary).toEqual({ removedIds: ['a1', 'a2'], remainingIds: ['b1'] });
    expect(result.emptiedAlbumIds).toEqual(['A']);
  });

  it('앨범이 사라진 id는 각 앨범의 선택 기록에서 지운다', async () => {
    const toAfter = mockAlbums({ A: [], B: [] });
    mockAssetDelete.mockImplementation(async () => toAfter());
    mockGetAlbumByDeviceId.mockImplementation(async (id: string) => ({ id: id === 'A' ? 1 : 2 }));
    await runAlbumsMutation(['A', 'B'], { kind: 'delete' });
    expect(mockRemoveSelectedPhotos).toHaveBeenCalledWith(1, ['a1', 'a2']);
    expect(mockRemoveSelectedPhotos).toHaveBeenCalledWith(2, ['b1']);
  });

  it('이름 변경(새 폴더로 이동)은 앨범의 모든 항목을 Album.create로 옮긴다', async () => {
    const toAfter = mockAlbums({ A: [], B: ['b1'] });
    mockAlbumCreate.mockImplementation(async () => toAfter());
    const result = await runAlbumsMutation(['A'], { kind: 'moveToNew', folderName: '새이름' });
    expect(mockAlbumCreate).toHaveBeenCalledWith('새이름', [{ id: 'a1' }, { id: 'a2' }], true);
    expect(result.emptiedAlbumIds).toEqual(['A']);
  });

  it('복사는 원본 앨범이 남아도 사본 수로 센다(비게 된 앨범 없음, 선택 기록 유지)', async () => {
    mockAlbums(albumItems);
    const result = await runAlbumsMutation(['A', 'B'], { kind: 'copyToNew', folderName: 'x' });
    expect(result.summary).toEqual({ removedIds: ['a1', 'a2', 'b1'], remainingIds: [] });
    expect(result.emptiedAlbumIds).toEqual([]);
    expect(mockRemoveSelectedPhotos).not.toHaveBeenCalled();
  });

  it('항목이 하나도 없으면 아무것도 호출하지 않는다', async () => {
    mockQueryAlbumItems.mockResolvedValue([]);
    const result = await runAlbumsMutation(['A'], { kind: 'delete' });
    expect(mockAssetDelete).not.toHaveBeenCalled();
    expect(result.summary).toEqual({ removedIds: [], remainingIds: [] });
  });
});

describe('runAlbumsMutation keepSelectedPhotos', () => {
  it('이름 변경처럼 호출한 쪽이 선택 기록을 옮길 때는 지우지 않는다', async () => {
    let after = false;
    mockQueryAlbumItems.mockImplementation(async () => (after ? [] : [item('a1')]));
    mockAlbumCreate.mockImplementation(async () => {
      after = true;
    });
    mockGetAlbumByDeviceId.mockResolvedValue({ id: 1 });
    await runAlbumsMutation(['A'], { kind: 'moveToNew', folderName: 'x' }, { keepSelectedPhotos: true });
    expect(mockRemoveSelectedPhotos).not.toHaveBeenCalled();
  });
});

describe('runMediaMutation delete with trash', () => {
  it('휴지통을 쓸 수 있으면 영구 삭제 대신 휴지통으로 보낸다', async () => {
    mockIsTrashAvailable.mockReturnValue(true);
    mockMoveToTrash.mockResolvedValue(true);
    mockQueryAlbumItems.mockResolvedValue([]);
    const result = await runMediaMutation('dev1', ['a', 'b'], { kind: 'delete' });
    expect(mockMoveToTrash).toHaveBeenCalledWith(['a', 'b']);
    expect(mockAssetDelete).not.toHaveBeenCalled();
    expect(result.summary).toEqual({ removedIds: ['a', 'b'], remainingIds: [] });
    expect(movesToTrash({ kind: 'delete' })).toBe(true);
    expect(movesToTrash({ kind: 'move', targetAlbumId: 'x' })).toBe(false);
  });

  it('휴지통 이동을 거절하면 "취소"로 인식되는 오류를 돌려주고 항목은 그대로다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockIsTrashAvailable.mockReturnValue(true);
    mockMoveToTrash.mockResolvedValue(false);
    mockQueryAlbumItems.mockResolvedValue([item('a')]);
    const result = await runMediaMutation('dev1', ['a'], { kind: 'delete' });
    expect(result.summary).toEqual({ removedIds: [], remainingIds: ['a'] });
    expect((result.error as Error).message).toMatch(/didn't grant/);
    warn.mockRestore();
  });

  it('휴지통을 쓸 수 없는 빌드에서는 예전처럼 영구 삭제한다', async () => {
    mockIsTrashAvailable.mockReturnValue(false);
    mockQueryAlbumItems.mockResolvedValue([]);
    await runMediaMutation('dev1', ['a'], { kind: 'delete' });
    expect(mockAssetDelete).toHaveBeenCalled();
    expect(mockMoveToTrash).not.toHaveBeenCalled();
    expect(movesToTrash({ kind: 'delete' })).toBe(false);
  });
});
