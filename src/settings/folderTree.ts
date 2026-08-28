/**
 * asset.getUri()가 반환하는 경로 문자열에서 마지막 세그먼트(파일명)를 잘라 폴더 경로를 얻는다.
 * 사진 자산(AlbumListScreen)과 기기 오디오 자산(DeviceMusicPickerModal) 모두 이 방식으로
 * 폴더 경로를 도출한다 — 두 자산 모두 expo-media-library의 같은 Asset 클래스를 쓴다.
 */
export function getFolderPath(uri: string): string {
  const lastSlash = uri.lastIndexOf('/');
  return lastSlash === -1 ? uri : uri.slice(0, lastSlash);
}

export interface FolderTreeNode {
  path: string;
  label: string;
  itemIds: string[];
  children: FolderTreeNode[];
}

interface TrieNode {
  segment: string;
  itemIds: string[];
  children: Map<string, TrieNode>;
}

function createTrieNode(segment: string): TrieNode {
  return { segment, itemIds: [], children: new Map() };
}

export function buildFolderTree(items: readonly { id: string; folderPath: string }[]): FolderTreeNode[] {
  const root = createTrieNode('');
  for (const item of items) {
    if (!item.folderPath) continue;
    // 세그먼트를 필터링하지 않고 그대로 보존해야(빈 문자열 포함) join('/')으로 원본
    // folderPath 문자열과 정확히 동일한 path를 복원할 수 있다(예: "file:///a" 형태의
    // 스킴 프리픽스, 연속 슬래시). 필터링하면 경로 비교 시 원본과 어긋난다.
    const segments = item.folderPath.split('/');
    let node = root;
    for (const segment of segments) {
      let child = node.children.get(segment);
      if (!child) {
        child = createTrieNode(segment);
        node.children.set(segment, child);
      }
      node = child;
    }
    node.itemIds.push(item.id);
  }
  return [...root.children.values()].map((child) => collapseNode(child, null));
}

function collapseNode(node: TrieNode, parentPath: string | null): FolderTreeNode {
  const segments = [node.segment];
  let current = node;
  let path = joinPath(parentPath, node.segment);

  // leaf 항목이 없으면서 자식이 정확히 하나뿐인 체인은 한 줄로 병합 표시한다.
  while (current.itemIds.length === 0 && current.children.size === 1) {
    const [onlyChild] = [...current.children.values()];
    segments.push(onlyChild.segment);
    path = joinPath(path, onlyChild.segment);
    current = onlyChild;
  }

  return {
    path,
    label: segments.join('/'),
    itemIds: current.itemIds,
    children: [...current.children.values()].map((child) => collapseNode(child, path)),
  };
}

// parentPath가 null이면 아직 경로가 시작되지 않은 최초 호출(root 바로 아래)이라
// segment를 그대로 반환한다. 빈 문자열('')은 "선행 슬래시로 생긴 빈 세그먼트가 이미
// 반영된 상태"를 뜻하는 유효한 값이라 null과 구분해야 한다.
function joinPath(parentPath: string | null, segment: string): string {
  return parentPath === null ? segment : `${parentPath}/${segment}`;
}

export interface FlattenedFolderRow {
  node: FolderTreeNode;
  depth: number;
}

export function flattenFolderTree(
  nodes: readonly FolderTreeNode[],
  collapsedPaths: ReadonlySet<string>,
  depth = 0
): FlattenedFolderRow[] {
  const rows: FlattenedFolderRow[] = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.children.length > 0 && !collapsedPaths.has(node.path)) {
      rows.push(...flattenFolderTree(node.children, collapsedPaths, depth + 1));
    }
  }
  return rows;
}

export function searchFolderTree(nodes: readonly FolderTreeNode[], query: string): FolderTreeNode[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const results: FolderTreeNode[] = [];
  function walk(list: readonly FolderTreeNode[]) {
    for (const node of list) {
      if (node.label.toLowerCase().includes(normalized)) results.push(node);
      walk(node.children);
    }
  }
  walk(nodes);
  return results;
}
