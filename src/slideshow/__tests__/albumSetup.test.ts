import {
  getAlbumByDeviceId,
  getDefaultMusicTracks,
  getSlideshowDefaults,
  getSlideshowSettingsByAlbumId,
  insertAlbum,
  setSlideshowMusicTracks,
  updateAlbumDisplayName,
  upsertMusicTrack,
  upsertSlideshowSettings,
} from '../../db/client';
import { findOrCreateAlbum, prepareAlbumForPlayback, saveSlideshowSettings } from '../albumSetup';

jest.mock('../../db/client', () => ({
  getAlbumByDeviceId: jest.fn(),
  getDefaultMusicTracks: jest.fn(),
  getSlideshowDefaults: jest.fn(),
  getSlideshowSettingsByAlbumId: jest.fn(),
  insertAlbum: jest.fn(),
  setSlideshowMusicTracks: jest.fn(),
  updateAlbumDisplayName: jest.fn(),
  upsertMusicTrack: jest.fn(),
  upsertSlideshowSettings: jest.fn(),
}));

const album = { id: 7, deviceAlbumId: 'dev-1', displayName: 'Trip' };
const defaults = {
  transitionIntervalSec: 5,
  orderMode: 'sequential',
  repeatMode: 'once',
  sortCriterion: 'creation_time',
  sortDirection: 'asc',
};
const track = { sourceType: 'bundled', sourceValue: 'calm', title: 'Calm', artist: null, coverUri: null };

const mocked = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mocked(getSlideshowDefaults).mockResolvedValue(defaults);
  mocked(getDefaultMusicTracks).mockResolvedValue([]);
  mocked(upsertSlideshowSettings).mockResolvedValue({ id: 99 });
  mocked(upsertMusicTrack).mockResolvedValue({ id: 5 });
  mocked(setSlideshowMusicTracks).mockResolvedValue(undefined);
});

describe('findOrCreateAlbum', () => {
  test('없으면 새로 만든다', async () => {
    mocked(getAlbumByDeviceId).mockResolvedValue(null);
    mocked(insertAlbum).mockResolvedValue(album);
    await expect(findOrCreateAlbum('dev-1', 'Trip')).resolves.toEqual(album);
    expect(insertAlbum).toHaveBeenCalledWith('dev-1', 'Trip');
  });

  test('있으면 그대로 쓰고 새로 만들지 않는다', async () => {
    mocked(getAlbumByDeviceId).mockResolvedValue(album);
    await expect(findOrCreateAlbum('dev-1', 'Trip')).resolves.toEqual(album);
    expect(insertAlbum).not.toHaveBeenCalled();
    expect(updateAlbumDisplayName).not.toHaveBeenCalled();
  });

  test('기기에서 표시명이 바뀌었으면 DB 표시명을 갱신한다', async () => {
    mocked(getAlbumByDeviceId).mockResolvedValue(album);
    await expect(findOrCreateAlbum('dev-1', 'Trip 2026')).resolves.toEqual({ ...album, displayName: 'Trip 2026' });
    expect(updateAlbumDisplayName).toHaveBeenCalledWith(7, 'Trip 2026');
  });
});

describe('saveSlideshowSettings', () => {
  test('설정을 저장한 뒤 재생목록 트랙을 순서대로 upsert하고 연결한다', async () => {
    mocked(upsertMusicTrack).mockResolvedValueOnce({ id: 11 }).mockResolvedValueOnce({ id: 12 });
    await saveSlideshowSettings(7, {
      ...defaults,
      selectedMusicList: [track, { ...track, sourceValue: 'warm' }],
    } as never);
    expect(upsertSlideshowSettings).toHaveBeenCalledWith(7, 5, 'sequential', 'once', 'creation_time', 'asc');
    expect(upsertMusicTrack).toHaveBeenCalledTimes(2);
    expect(setSlideshowMusicTracks).toHaveBeenCalledWith(99, [11, 12]);
  });
});

describe('prepareAlbumForPlayback (갤러리에서 설정 화면을 거치지 않고 바로 재생)', () => {
  test('이미 설정이 있는 앨범은 아무것도 다시 쓰지 않는다', async () => {
    mocked(getAlbumByDeviceId).mockResolvedValue(album);
    mocked(getSlideshowSettingsByAlbumId).mockResolvedValue({ id: 99 });
    await expect(prepareAlbumForPlayback('dev-1', 'Trip')).resolves.toEqual(album);
    expect(upsertSlideshowSettings).not.toHaveBeenCalled();
    expect(setSlideshowMusicTracks).not.toHaveBeenCalled();
  });

  test('신규 앨범 + 기본 음악이 있으면 설정 화면 첫 진입과 같은 DB 호출로 기본값·기본 음악을 저장한다', async () => {
    mocked(getAlbumByDeviceId).mockResolvedValue(null);
    mocked(insertAlbum).mockResolvedValue(album);
    mocked(getSlideshowSettingsByAlbumId).mockResolvedValue(null);
    mocked(getDefaultMusicTracks).mockResolvedValue([track]);
    await prepareAlbumForPlayback('dev-1', 'Trip');
    expect(insertAlbum).toHaveBeenCalledWith('dev-1', 'Trip');
    expect(upsertSlideshowSettings).toHaveBeenCalledWith(7, 5, 'sequential', 'once', 'creation_time', 'asc');
    expect(upsertMusicTrack).toHaveBeenCalledWith('bundled', 'calm', 'Calm', null, null);
    expect(setSlideshowMusicTracks).toHaveBeenCalledWith(99, [5]);
  });

  test('신규 앨범이어도 기본 음악이 없으면 설정 row를 만들지 않는다(설정 화면과 동일)', async () => {
    mocked(getAlbumByDeviceId).mockResolvedValue(null);
    mocked(insertAlbum).mockResolvedValue(album);
    mocked(getSlideshowSettingsByAlbumId).mockResolvedValue(null);
    await prepareAlbumForPlayback('dev-1', 'Trip');
    expect(upsertSlideshowSettings).not.toHaveBeenCalled();
  });

  test('기본 음악 조회가 실패해도 재생을 막지 않는다', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    mocked(getAlbumByDeviceId).mockResolvedValue(album);
    mocked(getSlideshowSettingsByAlbumId).mockResolvedValue(null);
    mocked(getDefaultMusicTracks).mockRejectedValue(new Error('db'));
    await expect(prepareAlbumForPlayback('dev-1', 'Trip')).resolves.toEqual(album);
    expect(upsertSlideshowSettings).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test('앨범 조회/생성이 실패하면 reject한다(호출한 화면이 오류를 안내)', async () => {
    mocked(getAlbumByDeviceId).mockRejectedValue(new Error('db'));
    await expect(prepareAlbumForPlayback('dev-1', 'Trip')).rejects.toThrow('db');
  });
});
