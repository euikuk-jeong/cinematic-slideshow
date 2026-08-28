import {
  addHiddenPath,
  findHidingAncestor,
  isPathHidden,
  migrateHiddenAlbumIdsToPaths,
  parseHiddenFolderPaths,
  removeHiddenPath,
} from '../hiddenFolders';

describe('parseHiddenFolderPaths', () => {
  test('null이면 빈 배열', () => {
    expect(parseHiddenFolderPaths(null)).toEqual([]);
  });

  test('잘못된 JSON이면 빈 배열', () => {
    expect(parseHiddenFolderPaths('not json')).toEqual([]);
  });

  test('문자열이 아닌 원소는 걸러낸다', () => {
    expect(parseHiddenFolderPaths(JSON.stringify(['/a', 1, null, '/b']))).toEqual(['/a', '/b']);
  });
});

describe('isPathHidden / findHidingAncestor', () => {
  test('정확히 일치하면 숨김', () => {
    expect(isPathHidden('/a/b', ['/a/b'])).toBe(true);
    expect(findHidingAncestor('/a/b', ['/a/b'])).toBe('/a/b');
  });

  test('하위 경로면 숨김', () => {
    expect(isPathHidden('/a/b/c', ['/a/b'])).toBe(true);
    expect(findHidingAncestor('/a/b/c', ['/a/b'])).toBe('/a/b');
  });

  test('경로 접두사만 같고 실제 하위가 아니면 오탐하지 않는다', () => {
    expect(isPathHidden('/a/bc', ['/a/b'])).toBe(false);
    expect(findHidingAncestor('/a/bc', ['/a/b'])).toBeNull();
  });

  test('무관한 경로는 숨기지 않는다', () => {
    expect(isPathHidden('/x/y', ['/a/b'])).toBe(false);
  });

  test('빈 hidden 목록이면 항상 표시', () => {
    expect(isPathHidden('/a/b', [])).toBe(false);
  });
});

describe('addHiddenPath / removeHiddenPath', () => {
  test('추가하면 목록에 들어간다', () => {
    expect(addHiddenPath([], '/a')).toEqual(['/a']);
  });

  test('추가 시 이미 하위로 포함되는 기존 항목은 정리된다', () => {
    expect(addHiddenPath(['/a/b', '/a/c'], '/a')).toEqual(['/a']);
  });

  test('추가 시 무관한 기존 항목은 유지된다', () => {
    expect(addHiddenPath(['/x/y'], '/a')).toEqual(['/x/y', '/a']);
  });

  test('제거하면 정확히 일치하는 항목만 빠진다', () => {
    expect(removeHiddenPath(['/a', '/a/b'], '/a')).toEqual(['/a/b']);
  });

  test('존재하지 않는 경로 제거는 no-op', () => {
    expect(removeHiddenPath(['/a'], '/z')).toEqual(['/a']);
  });
});

describe('migrateHiddenAlbumIdsToPaths', () => {
  const albums = [
    { id: '1', folderPath: '/a/camera' },
    { id: '2', folderPath: '/a/screenshots' },
  ];

  test('id가 매칭되면 해당 경로로 변환된다', () => {
    expect(migrateHiddenAlbumIdsToPaths(['2'], albums)).toEqual(['/a/screenshots']);
  });

  test('매칭 안 되는 id(삭제된 앨범)는 무시된다', () => {
    expect(migrateHiddenAlbumIdsToPaths(['1', '999'], albums)).toEqual(['/a/camera']);
  });

  test('중복 id는 한 번만 반영된다', () => {
    expect(migrateHiddenAlbumIdsToPaths(['1', '1'], albums)).toEqual(['/a/camera']);
  });

  test('빈 목록이면 빈 배열', () => {
    expect(migrateHiddenAlbumIdsToPaths([], albums)).toEqual([]);
  });
});
