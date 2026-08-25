export const HIDDEN_FOLDER_PATHS_STORAGE_KEY = 'album_list_hidden_folder_paths';
export const LEGACY_HIDDEN_ALBUM_IDS_KEY = 'album_list_hidden_ids';

export function parseHiddenFolderPaths(raw: string | null): string[] {
  return parseStringArray(raw);
}

export function parseLegacyHiddenAlbumIds(raw: string | null): string[] {
  return parseStringArray(raw);
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((value): value is string => typeof value === 'string');
}

export function isPathHidden(folderPath: string, hiddenPaths: readonly string[]): boolean {
  return findHidingAncestor(folderPath, hiddenPaths) !== null;
}

export function findHidingAncestor(path: string, hiddenPaths: readonly string[]): string | null {
  return hiddenPaths.find((hidden) => path === hidden || path.startsWith(`${hidden}/`)) ?? null;
}

export function addHiddenPath(hiddenPaths: readonly string[], path: string): string[] {
  const kept = hiddenPaths.filter((p) => p !== path && !p.startsWith(`${path}/`));
  return [...kept, path];
}

export function removeHiddenPath(hiddenPaths: readonly string[], path: string): string[] {
  return hiddenPaths.filter((p) => p !== path);
}

export function migrateHiddenAlbumIdsToPaths(
  legacyHiddenIds: readonly string[],
  albums: readonly { id: string; folderPath: string }[]
): string[] {
  const idToPath = new Map(albums.map((album) => [album.id, album.folderPath]));
  const paths = new Set<string>();
  for (const id of legacyHiddenIds) {
    const path = idToPath.get(id);
    if (path) paths.add(path);
  }
  return [...paths];
}

export interface FolderTreeNode {
  path: string;
  label: string;
  albumIds: string[];
  children: FolderTreeNode[];
}

interface TrieNode {
  segment: string;
  albumIds: string[];
  children: Map<string, TrieNode>;
}

function createTrieNode(segment: string): TrieNode {
  return { segment, albumIds: [], children: new Map() };
}

export function buildFolderTree(albums: readonly { id: string; folderPath: string }[]): FolderTreeNode[] {
  const root = createTrieNode('');
  for (const album of albums) {
    if (!album.folderPath) continue;
    // 세그먼트를 필터링하지 않고 그대로 보존해야(빈 문자열 포함) join('/')으로 원본
    // folderPath 문자열과 정확히 동일한 path를 복원할 수 있다(예: "file:///a" 형태의
    // 스킴 프리픽스, 연속 슬래시). 필터링하면 isPathHidden 비교 시 원본과 어긋난다.
    const segments = album.folderPath.split('/');
    let node = root;
    for (const segment of segments) {
      let child = node.children.get(segment);
      if (!child) {
        child = createTrieNode(segment);
        node.children.set(segment, child);
      }
      node = child;
    }
    node.albumIds.push(album.id);
  }
  return [...root.children.values()].map((child) => collapseNode(child, null));
}

function collapseNode(node: TrieNode, parentPath: string | null): FolderTreeNode {
  const segments = [node.segment];
  let current = node;
  let path = joinPath(parentPath, node.segment);

  // 앨범 leaf가 아니면서 자식이 정확히 하나뿐인 체인은 한 줄로 병합 표시한다.
  while (current.albumIds.length === 0 && current.children.size === 1) {
    const [onlyChild] = [...current.children.values()];
    segments.push(onlyChild.segment);
    path = joinPath(path, onlyChild.segment);
    current = onlyChild;
  }

  return {
    path,
    label: segments.join('/'),
    albumIds: current.albumIds,
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

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * HiddenAlbumsScreen에서 토글 저장 직후 호출 — AlbumListScreen이 native-stack에서
 * unmount 없이 백그라운드에 남아있으므로, focus 이벤트 대신 이 알림으로 재조회시킨다.
 */
export function notifyHiddenFolderPathsChanged(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToHiddenFolderPathsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
