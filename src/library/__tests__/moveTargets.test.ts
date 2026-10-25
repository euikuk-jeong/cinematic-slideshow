import { blockedTopDirectory, parseCachedAlbums, parseMoveTargets, selectMoveTargets } from '../moveTargets';

const cache = JSON.stringify([
  { id: '3', title: 'Zebra', thumbnailUri: 'x' },
  { id: '1', title: 'Camera', thumbnailUri: 'y' },
  { id: '2', title: 'Download', thumbnailUri: 'z' },
]);

describe('parseMoveTargets', () => {
  it('현재 앨범을 제외하고 제목순으로 정렬한다', () => {
    expect(parseMoveTargets(cache, '2')).toEqual([
      { id: '1', title: 'Camera' },
      { id: '3', title: 'Zebra' },
    ]);
  });

  it('캐시가 없으면 빈 목록', () => {
    expect(parseMoveTargets(null, '1')).toEqual([]);
  });

  it('JSON이 아니면 경고를 남기고 빈 목록', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseMoveTargets('not json', '1')).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('배열이 아니거나 id/title이 문자열이 아닌 항목은 건너뛴다', () => {
    expect(parseMoveTargets('{"a":1}', '1')).toEqual([]);
    const mixed = JSON.stringify([{ id: 5, title: 'x' }, { id: '6' }, null, { id: '7', title: 'ok' }]);
    expect(parseMoveTargets(mixed, '1')).toEqual([{ id: '7', title: 'ok' }]);
  });
});

describe('parseCachedAlbums / selectMoveTargets', () => {
  it('parseCachedAlbums는 현재 앨범을 거르지 않고 모든 앨범을 돌려준다(새 폴더 중복 검사용)', () => {
    expect(parseCachedAlbums(cache).map((a) => a.id)).toEqual(['3', '1', '2']);
  });

  it('selectMoveTargets는 현재 앨범을 빼고 제목순으로 정렬한다', () => {
    expect(selectMoveTargets(parseCachedAlbums(cache), '1').map((a) => a.title)).toEqual(['Download', 'Zebra']);
  });
});

describe('blockedTopDirectory', () => {
  it('DCIM·Pictures·Movies(대소문자 무시)는 막지 않는다', () => {
    expect(blockedTopDirectory('file:///storage/emulated/0/DCIM/Camera')).toBeNull();
    expect(blockedTopDirectory('file:///storage/emulated/0/Pictures/가족')).toBeNull();
    expect(blockedTopDirectory('/storage/emulated/0/movies/trip')).toBeNull();
    expect(blockedTopDirectory('/sdcard/Pictures/x')).toBeNull();
  });

  it('그 밖의 최상위 폴더는 그 이름을 돌려준다(실기기: _MyData)', () => {
    expect(blockedTopDirectory('file:///storage/emulated/0/_MyData/Photo/_Private_2026')).toBe('_MyData');
    expect(blockedTopDirectory('file:///storage/emulated/0/Download/x')).toBe('Download');
    expect(blockedTopDirectory('file:///storage/emulated/10/Android/media/com.a.b/x')).toBe('Android');
  });

  it('경로가 없거나 해석할 수 없으면 막지 않는다', () => {
    expect(blockedTopDirectory(undefined)).toBeNull();
    expect(blockedTopDirectory('')).toBeNull();
    expect(blockedTopDirectory('content://media/external/images/1')).toBeNull();
    expect(blockedTopDirectory('file:///storage/ABCD-1234/DCIM/x')).toBeNull();
  });
});

describe('parseCachedAlbums folderPath', () => {
  it('문자열 folderPath만 보존한다', () => {
    const json = JSON.stringify([
      { id: '1', title: 'a', folderPath: 'file:///x' },
      { id: '2', title: 'b', folderPath: 5 },
    ]);
    expect(parseCachedAlbums(json)).toEqual([
      { id: '1', title: 'a', folderPath: 'file:///x' },
      { id: '2', title: 'b' },
    ]);
  });
});
