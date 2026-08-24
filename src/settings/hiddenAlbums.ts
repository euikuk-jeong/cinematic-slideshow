export const HIDDEN_ALBUM_IDS_STORAGE_KEY = 'album_list_hidden_ids';

export function parseHiddenAlbumIds(raw: string | null): string[] {
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

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * HiddenAlbumsScreen에서 토글 저장 직후 호출 — AlbumListScreen이 native-stack에서
 * unmount 없이 백그라운드에 남아있으므로, focus 이벤트 대신 이 알림으로 재조회시킨다.
 */
export function notifyHiddenAlbumIdsChanged(): void {
  listeners.forEach((listener) => listener());
}

export function subscribeToHiddenAlbumIdsChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
