import { isTrashButtonVisible } from '../trashButton';

let mockAvailable = true;
const mockListTrash = jest.fn();
jest.mock('../mediaTrash', () => ({
  isTrashAvailable: () => mockAvailable,
  listTrash: () => mockListTrash(),
}));
const mockGetAppSetting = jest.fn();
jest.mock('../../db/client', () => ({ getAppSetting: (key: string) => mockGetAppSetting(key) }));

beforeEach(() => {
  jest.clearAllMocks();
  mockAvailable = true;
  mockGetAppSetting.mockResolvedValue(null);
  mockListTrash.mockResolvedValue([]);
});

describe('isTrashButtonVisible', () => {
  it('휴지통을 쓸 수 없는 환경이면 숨긴다', async () => {
    mockAvailable = false;
    await expect(isTrashButtonVisible()).resolves.toBe(false);
    expect(mockGetAppSetting).not.toHaveBeenCalled();
  });

  it('켜져 있으면(기본) 비어 있어도 보이고, 휴지통 목록은 조회하지 않는다', async () => {
    await expect(isTrashButtonVisible()).resolves.toBe(true);
    expect(mockGetAppSetting).toHaveBeenCalledWith('trash_enabled');
    expect(mockListTrash).not.toHaveBeenCalled();
  });

  it('끄고 휴지통이 비어 있으면 숨긴다', async () => {
    mockGetAppSetting.mockResolvedValue('0');
    await expect(isTrashButtonVisible()).resolves.toBe(false);
  });

  it('끄더라도 휴지통에 항목이 남아 있으면 보인다(복원·영구 삭제할 길)', async () => {
    mockGetAppSetting.mockResolvedValue('0');
    mockListTrash.mockResolvedValue([{ id: 'a' }]);
    await expect(isTrashButtonVisible()).resolves.toBe(true);
  });

  it('설정이나 목록을 읽지 못하면 보인다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetAppSetting.mockRejectedValue(new Error('db down'));
    await expect(isTrashButtonVisible()).resolves.toBe(true);

    mockGetAppSetting.mockResolvedValue('0');
    mockListTrash.mockRejectedValue(new Error('query failed'));
    await expect(isTrashButtonVisible()).resolves.toBe(true);
    warn.mockRestore();
  });
});
