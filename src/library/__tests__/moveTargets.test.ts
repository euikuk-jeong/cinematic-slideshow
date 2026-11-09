import {
  blockedTopDirectory,
  filterMoveTargets,
  moveTargetPath,
  parseCachedAlbums,
  parseMoveTargets,
  selectMoveTargets,
} from '../moveTargets';

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

describe('filterMoveTargets', () => {
  const targets = [
    { id: '1', title: 'Family Trip' },
    { id: '2', title: '가족 여행' },
    { id: '3', title: 'Camera' },
  ];

  it('제목 부분일치로 거르고 대소문자를 무시한다', () => {
    expect(filterMoveTargets(targets, 'FAM').map((t) => t.id)).toEqual(['1']);
    expect(filterMoveTargets(targets, '여행').map((t) => t.id)).toEqual(['2']);
  });

  it('앞뒤 공백만 있는 검색어는 전체를 돌려준다', () => {
    expect(filterMoveTargets(targets, '   ')).toEqual(targets);
  });

  it('조합형(NFD)으로 저장된 한글 제목도 찾는다', () => {
    const nfd = [{ id: '9', title: '가족 여행'.normalize('NFD') }];
    expect(filterMoveTargets(nfd, '여행').map((t) => t.id)).toEqual(['9']);
  });

  it('일치하는 앨범이 없으면 빈 목록', () => {
    expect(filterMoveTargets(targets, 'zzz')).toEqual([]);
  });

  describe('경로 검색', () => {
    const cameras = [
      { id: 'dcim', title: 'Camera', folderPath: 'file:///storage/emulated/0/DCIM/Camera' },
      { id: 'pictures', title: 'Camera', folderPath: 'file:///storage/emulated/0/Pictures/Camera' },
      { id: 'unknown', title: 'Camera' },
    ];

    it('표시 경로로 같은 제목의 앨범을 구분해 찾는다', () => {
      expect(filterMoveTargets(cameras, 'pictures').map((t) => t.id)).toEqual(['pictures']);
      expect(filterMoveTargets(cameras, 'dcim/cam').map((t) => t.id)).toEqual(['dcim']);
    });

    it('화면에 보이지 않는 저장소 루트로는 찾지 않는다', () => {
      expect(filterMoveTargets(cameras, 'emulated')).toEqual([]);
      expect(filterMoveTargets(cameras, 'storage')).toEqual([]);
    });

    it('인코딩된 경로도 디코딩된 글자로 찾는다', () => {
      const encoded = [
        { id: '1', title: 'Trip', folderPath: `file:///storage/emulated/0/Pictures/${encodeURIComponent('가족 여행')}` },
      ];
      expect(filterMoveTargets(encoded, '가족 여행').map((t) => t.id)).toEqual(['1']);
    });

    it('경로를 모르는 앨범은 제목으로만 찾는다', () => {
      expect(filterMoveTargets(cameras, 'camera').map((t) => t.id)).toEqual(['dcim', 'pictures', 'unknown']);
    });
  });
});

describe('moveTargetPath', () => {
  it('저장소 루트를 뺀 경로를 돌려준다', () => {
    expect(moveTargetPath({ id: '1', title: 'C', folderPath: 'file:///storage/emulated/0/DCIM/Camera' })).toBe(
      '/DCIM/Camera'
    );
  });

  it('경로가 없거나 비어 있으면 null', () => {
    expect(moveTargetPath({ id: '1', title: 'C' })).toBeNull();
    expect(moveTargetPath({ id: '1', title: 'C', folderPath: '' })).toBeNull();
  });
});
