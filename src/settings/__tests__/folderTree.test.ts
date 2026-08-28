import { buildFolderTree, flattenFolderTree, getFolderPath, searchFolderTree } from '../folderTree';

describe('getFolderPath', () => {
  test('마지막 슬래시 앞까지가 폴더 경로', () => {
    expect(getFolderPath('/a/b/song.mp3')).toBe('/a/b');
  });

  test('슬래시가 없으면 원본 그대로', () => {
    expect(getFolderPath('song.mp3')).toBe('song.mp3');
  });
});

describe('buildFolderTree', () => {
  test('항목 하나면 leaf 노드 하나', () => {
    const tree = buildFolderTree([{ id: '1', folderPath: '/a/b' }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({ path: '/a/b', label: '/a/b', itemIds: ['1'], children: [] });
  });

  test('형제 항목 2개는 분기 노드 아래 각각 leaf로 나뉜다', () => {
    const tree = buildFolderTree([
      { id: '1', folderPath: '/a/camera' },
      { id: '2', folderPath: '/a/screenshots' },
    ]);
    expect(tree).toHaveLength(1);
    const root = tree[0];
    expect(root.path).toBe('/a');
    expect(root.itemIds).toEqual([]);
    expect(root.children.map((c) => c.path).sort()).toEqual(['/a/camera', '/a/screenshots']);
  });

  test('자식이 하나뿐인 체인은 한 노드로 병합된다', () => {
    const tree = buildFolderTree([{ id: '1', folderPath: '/a/android/data/com.kakao.talk/files/img' }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]).toMatchObject({
      path: '/a/android/data/com.kakao.talk/files/img',
      label: '/a/android/data/com.kakao.talk/files/img',
      itemIds: ['1'],
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
    expect(commonRoot.itemIds).toEqual([]);
    expect(commonRoot.children.map((c) => c.path).sort()).toEqual([
      '/a/android/data/com.facebook.orca/files',
      '/a/android/data/com.kakao.talk/files',
    ]);
  });

  test('folderPath가 빈 문자열인 항목은 트리에서 제외된다', () => {
    const tree = buildFolderTree([{ id: '1', folderPath: '' }]);
    expect(tree).toEqual([]);
  });

  test('같은 폴더에 파일과 하위 폴더가 함께 있으면 itemIds와 children이 모두 채워진다', () => {
    const tree = buildFolderTree([
      { id: '1', folderPath: '/a' },
      { id: '2', folderPath: '/a/sub' },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].path).toBe('/a');
    expect(tree[0].itemIds).toEqual(['1']);
    expect(tree[0].children.map((c) => c.path)).toEqual(['/a/sub']);
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
