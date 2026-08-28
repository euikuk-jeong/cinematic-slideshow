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
