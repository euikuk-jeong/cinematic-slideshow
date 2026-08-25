import {
  addHiddenPath,
  buildFolderTree,
  findHidingAncestor,
  flattenFolderTree,
  isPathHidden,
  migrateHiddenAlbumIdsToPaths,
  parseHiddenFolderPaths,
  removeHiddenPath,
  searchFolderTree,
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

describe('buildFolderTree', () => {
  test('앨범 하나면 leaf 노드 하나', () => {
    const tree = buildFolderTree([{ id: '1', folderPath: '/a/b' }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ path: '/a/b', label: '/a/b', albumIds: ['1'], children: [] });
  });

  test('형제 앨범 2개는 분기 노드 아래 각각 leaf로 나뉜다', () => {
    const tree = buildFolderTree([
      { id: '1', folderPath: '/a/camera' },
      { id: '2', folderPath: '/a/screenshots' },
    ]);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.path).toBe('/a');
    expect(root.albumIds).toEqual([]);
    expect(root.children.map((c) => c.path).sort()).toEqual(['/a/camera', '/a/screenshots']);
  });

  test('자식이 하나뿐인 체인은 한 노드로 병합된다', () => {
    const tree = buildFolderTree([{ id: '1', folderPath: '/a/android/data/com.kakao.talk/files/img' }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      path: '/a/android/data/com.kakao.talk/files/img',
      label: '/a/android/data/com.kakao.talk/files/img',
      albumIds: ['1'],
    });
  });

  test('공통 루트는 축약되고 분기 지점부터 갈라진다', () => {
    const tree = buildFolderTree([
      { id: '1', folderPath: '/a/android/data/com.kakao.talk/files' },
      { id: '2', folderPath: '/a/android/data/com.facebook.orca/files' },
    ]);
    expect(tree).toHaveLength(1);
    const commonRoot = tree[0];
    expect(commonRoot.path).toBe('/a/android/data');
    expect(commonRoot.albumIds).toEqual([]);
    expect(commonRoot.children.map((c) => c.path).sort()).toEqual([
      '/a/android/data/com.facebook.orca/files',
      '/a/android/data/com.kakao.talk/files',
    ]);
  });

  test('folderPath가 빈 문자열인 앨범은 트리에서 제외된다', () => {
    const tree = buildFolderTree([{ id: '1', folderPath: '' }]);
    expect(tree).toEqual([]);
  });
});

describe('flattenFolderTree', () => {
  const tree = buildFolderTree([
    { id: '1', folderPath: '/a/camera' },
    { id: '2', folderPath: '/a/screenshots' },
  ]);

  test('펼침 상태(빈 collapsed set)면 모든 노드가 순서대로 나온다', () => {
    const rows = flattenFolderTree(tree, new Set());
    expect(rows.map((r) => [r.node.path, r.depth])).toEqual([
      ['/a', 0],
      ['/a/camera', 1],
      ['/a/screenshots', 1],
    ]);
  });

  test('접힌 노드의 자식은 목록에서 빠진다', () => {
    const rows = flattenFolderTree(tree, new Set(['/a']));
    expect(rows.map((r) => r.node.path)).toEqual(['/a']);
  });
});

describe('searchFolderTree', () => {
  const tree = buildFolderTree([
    { id: '1', folderPath: '/a/DCIM/Camera' },
    { id: '2', folderPath: '/a/Pictures/Screenshots' },
  ]);

  test('빈 검색어면 결과 없음', () => {
    expect(searchFolderTree(tree, '')).toEqual([]);
  });

  test('대소문자 무시하고 라벨에 부분일치하는 노드를 깊이 상관없이 찾는다', () => {
    const results = searchFolderTree(tree, 'camera');
    expect(results.map((n) => n.path)).toEqual(['/a/DCIM/Camera']);
  });

  test('매치 없으면 빈 배열', () => {
    expect(searchFolderTree(tree, 'zzz')).toEqual([]);
  });
});
