import { subscribeToAlbumContentsChanged } from '../../library/albumContentsEvents';

let mockNative: Record<string, jest.Mock> | null = null;
jest.mock('expo-modules-core', () => ({
  ...jest.requireActual('expo-modules-core'),
  requireOptionalNativeModule: () => mockNative,
}));

import { Platform } from 'react-native';

import { deleteFromTrash, isTrashAvailable, listTrash, moveToTrash, restoreFromTrash } from '../mediaTrash';

const originalOS = Platform.OS;
const originalVersion = Platform.Version;

function setPlatform(os: 'android' | 'ios', version: number | string) {
  Platform.OS = os;
  Object.defineProperty(Platform, 'Version', { value: version, configurable: true });
}

beforeEach(() => {
  mockNative = {
    isSupported: jest.fn(() => true),
    setTrashed: jest.fn().mockResolvedValue(true),
    deletePermanently: jest.fn().mockResolvedValue(true),
    listTrashed: jest.fn().mockResolvedValue([]),
  };
  setPlatform('android', 34);
});

afterAll(() => {
  Platform.OS = originalOS;
  Object.defineProperty(Platform, 'Version', { value: originalVersion, configurable: true });
});

describe('isTrashAvailable', () => {
  it('Android 11+ 이고 네이티브 모듈이 지원한다고 하면 true', () => {
    expect(isTrashAvailable()).toBe(true);
  });

  it('모듈이 없는 빌드(예: 구버전 클라이언트)에서는 false', () => {
    mockNative = null;
    expect(isTrashAvailable()).toBe(false);
  });

  it('Android 10 이하·iOS에서는 모듈에 묻지도 않고 false', () => {
    setPlatform('android', 29);
    expect(isTrashAvailable()).toBe(false);
    setPlatform('ios', '17.0');
    expect(isTrashAvailable()).toBe(false);
  });

  it('네이티브가 지원하지 않는다고 하면 false', () => {
    mockNative!.isSupported.mockReturnValue(false);
    expect(isTrashAvailable()).toBe(false);
  });
});

describe('moveToTrash / restoreFromTrash / deleteFromTrash', () => {
  it('휴지통으로 보내기는 trashed=true로 요청하고 승인 여부를 돌려준다', async () => {
    await expect(moveToTrash(['a', 'b'])).resolves.toBe(true);
    expect(mockNative!.setTrashed).toHaveBeenCalledWith(['a', 'b'], true);
    mockNative!.setTrashed.mockResolvedValue(false);
    await expect(moveToTrash(['a'])).resolves.toBe(false);
  });

  it('복원은 trashed=false로 요청하고, 승인되면 앨범 목록 갱신을 알린다', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToAlbumContentsChanged(listener);
    await expect(restoreFromTrash(['a'])).resolves.toBe(true);
    expect(mockNative!.setTrashed).toHaveBeenCalledWith(['a'], false);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('복원·영구 삭제를 취소하면 갱신을 알리지 않는다', async () => {
    const listener = jest.fn();
    const unsubscribe = subscribeToAlbumContentsChanged(listener);
    mockNative!.setTrashed.mockResolvedValue(false);
    mockNative!.deletePermanently.mockResolvedValue(false);
    await restoreFromTrash(['a']);
    await deleteFromTrash(['a']);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('영구 삭제는 deletePermanently로 요청한다', async () => {
    await expect(deleteFromTrash(['a'])).resolves.toBe(true);
    expect(mockNative!.deletePermanently).toHaveBeenCalledWith(['a']);
  });

  it('모듈이 없으면 던진다', async () => {
    mockNative = null;
    await expect(moveToTrash(['a'])).rejects.toThrow(/not available/);
  });
});

describe('listTrash', () => {
  it('유효한 줄만 TrashItem으로 바꾸고 곧 지워질 순서로 정렬한다', async () => {
    mockNative!.listTrashed.mockResolvedValue([
      { id: 'late', expiresAt: 300 },
      { filename: 'no-id' },
      { id: 'soon', expiresAt: 100 },
    ]);
    const items = await listTrash();
    expect(items.map((item) => item.id)).toEqual(['soon', 'late']);
  });
});
