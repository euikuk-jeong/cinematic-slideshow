import { captureRenameContext, migrateRenamedAlbum, type RenameContext } from '../renameMigration';

const mockGetAll = jest.fn();
const mockQueryExe = jest.fn();
jest.mock('expo-media-library', () => ({
  Album: { getAll: () => mockGetAll() },
  Query: jest.fn().mockImplementation(() => ({
    album: jest.fn().mockReturnThis(),
    within: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    exe: () => mockQueryExe(),
  })),
  AssetField: { MEDIA_TYPE: 'mediaType' },
  MediaType: { IMAGE: 'image', VIDEO: 'video' },
}));

const mockQueryAlbumItems = jest.fn();
jest.mock('../queryAlbumItems', () => ({ queryAlbumItems: (id: string) => mockQueryAlbumItems(id) }));

const mockMigrateAlbumIdentity = jest.fn();
jest.mock('../../db/client', () => ({
  migrateAlbumIdentity: (...args: unknown[]) => mockMigrateAlbumIdentity(...args),
}));

const item = (id: string, filename: string | null) => ({ id, filename }) as never;
const album = (id: string, title: string) => ({ id, getTitle: () => Promise.resolve(title) });
const assetAt = (uri: string) => ({ getUri: () => Promise.resolve(uri) });

const context: RenameContext = {
  oldDeviceAlbumId: 'old',
  oldItems: [item('1', 'a.jpg'), item('2', 'b.jpg')],
  newTitle: '제주 여행',
  newDirectory: '/storage/emulated/0/Pictures/제주 여행',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockMigrateAlbumIdentity.mockResolvedValue(true);
});

describe('captureRenameContext', () => {
  it('이름을 바꾸기 전 이 앨범의 항목을 기억해 둔다', async () => {
    mockQueryAlbumItems.mockResolvedValue([item('1', 'a.jpg')]);
    const result = await captureRenameContext('old', '새 이름', '/x/새 이름');
    expect(mockQueryAlbumItems).toHaveBeenCalledWith('old');
    expect(result).toEqual({ oldDeviceAlbumId: 'old', oldItems: [item('1', 'a.jpg')], newTitle: '새 이름', newDirectory: '/x/새 이름' });
  });
});

describe('migrateRenamedAlbum', () => {
  it('새 폴더를 경로로 찾아 옛 앨범의 설정을 옮긴다(id가 유지되면 선택 사진도 그대로)', async () => {
    mockGetAll.mockResolvedValue([album('new', '제주 여행')]);
    mockQueryExe.mockResolvedValue([
      assetAt('file:///storage/emulated/0/Pictures/%EC%A0%9C%EC%A3%BC%20%EC%97%AC%ED%96%89/a.jpg'),
    ]);
    mockQueryAlbumItems.mockResolvedValue([item('1', 'a.jpg'), item('2', 'b.jpg')]);

    await expect(migrateRenamedAlbum(context)).resolves.toBe(true);
    expect(mockMigrateAlbumIdentity).toHaveBeenCalledWith('old', 'new', '제주 여행', { '1': '1', '2': '2' });
  });

  it('같은 제목의 다른 폴더와 헷갈리지 않게 대표 항목의 폴더 경로까지 비교한다', async () => {
    mockGetAll.mockResolvedValue([album('other', '제주 여행'), album('new', '제주 여행')]);
    mockQueryExe
      .mockResolvedValueOnce([assetAt('file:///storage/emulated/0/DCIM/%EC%A0%9C%EC%A3%BC%20%EC%97%AC%ED%96%89/z.jpg')])
      .mockResolvedValueOnce([assetAt('file:///storage/emulated/0/Pictures/%EC%A0%9C%EC%A3%BC%20%EC%97%AC%ED%96%89/a.jpg')]);
    mockQueryAlbumItems.mockResolvedValue([item('10', 'a.jpg'), item('11', 'b.jpg')]);

    await migrateRenamedAlbum(context);
    // 파일을 직접 옮겨 id가 바뀐 경우: 파일명으로 선택 사진을 새 id에 대응시킨다.
    expect(mockMigrateAlbumIdentity).toHaveBeenCalledWith('old', 'new', '제주 여행', { '1': '10', '2': '11' });
  });

  it('새 앨범을 찾지 못하면 아무것도 옮기지 않는다', async () => {
    mockGetAll.mockResolvedValue([album('x', '다른 앨범')]);
    await expect(migrateRenamedAlbum(context)).resolves.toBe(false);
    expect(mockMigrateAlbumIdentity).not.toHaveBeenCalled();
  });

  it('찾은 앨범이 옛 앨범과 같으면 옮기지 않는다', async () => {
    mockGetAll.mockResolvedValue([album('old', '제주 여행')]);
    mockQueryExe.mockResolvedValue([assetAt('file:///storage/emulated/0/Pictures/%EC%A0%9C%EC%A3%BC%20%EC%97%AC%ED%96%89/a.jpg')]);
    await expect(migrateRenamedAlbum(context)).resolves.toBe(false);
    expect(mockMigrateAlbumIdentity).not.toHaveBeenCalled();
  });

  it('조회가 실패해도 던지지 않고 false(이름 변경 자체는 유효)', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mockGetAll.mockRejectedValue(new Error('boom'));
    await expect(migrateRenamedAlbum(context)).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
