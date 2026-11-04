// 즐겨찾기 앨범 — 앨범 목록 그리드·목록 보기에서 맨 위 묶음으로 보인다.
// 기기 앨범 id가 아니라 폴더의 절대 경로로 저장한다: Android 앨범 id(bucket id)는 폴더 경로에서 나와서 이름을
// 바꾸면 달라지는데, 경로 키면 이름 변경 때 새 경로로 바꿔 주기만 하면 된다(숨김 폴더도 경로 기반).
// 앨범이 지금 목록에 없다고 지우지 않는다 — 영상 권한이 없을 때의 영상 전용 폴더나 숨김 폴더처럼 잠시 안 보이는
// 앨범도 있으므로, 표시할 때 현재 목록과 맞춰 본다.
export const FAVORITE_ALBUM_DIRECTORIES_STORAGE_KEY = 'album_list_favorite_directories';

export function parseFavoriteAlbumDirectories(raw: string | null): string[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    console.warn('[favoriteAlbums] stored favorites are not valid JSON', e);
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return [...new Set(parsed.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0))];
}

export function addFavoriteDirectories(favorites: readonly string[], directories: readonly string[]): string[] {
  return [...new Set([...favorites, ...directories])];
}

export function removeFavoriteDirectories(favorites: readonly string[], directories: readonly string[]): string[] {
  const removed = new Set(directories);
  return favorites.filter((directory) => !removed.has(directory));
}

/** 이름 변경 등으로 폴더 경로가 바뀌면 즐겨찾기도 새 경로로 옮긴다. 즐겨찾기가 아니었으면 그대로 돌려준다. */
export function replaceFavoriteDirectory(favorites: readonly string[], from: string, to: string): string[] {
  if (!favorites.includes(from)) return [...favorites];
  return addFavoriteDirectories(removeFavoriteDirectories(favorites, [from]), [to]);
}

/**
 * 정렬된 앨범을 즐겨찾기와 나머지로 나눈다. 두 묶음 모두 입력 순서(=현재 정렬 순서)를 유지한다.
 * `directoryOf`가 null을 돌려주는(경로를 모르는) 앨범은 즐겨찾기가 될 수 없다.
 */
export function partitionFavoriteAlbums<T>(
  sortedAlbums: readonly T[],
  favorites: readonly string[],
  directoryOf: (album: T) => string | null
): { favorites: T[]; others: T[] } {
  const favoriteSet = new Set(favorites);
  const favoriteAlbums: T[] = [];
  const others: T[] = [];
  for (const album of sortedAlbums) {
    const directory = directoryOf(album);
    if (directory !== null && favoriteSet.has(directory)) favoriteAlbums.push(album);
    else others.push(album);
  }
  return { favorites: favoriteAlbums, others };
}
