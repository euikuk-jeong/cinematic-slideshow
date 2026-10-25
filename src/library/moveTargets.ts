export interface MoveTarget {
  id: string;
  title: string;
}

/**
 * 앨범 목록 화면이 저장해 둔 앨범 캐시(`album_thumbnail_cache`)에서 id·제목을 뽑는다.
 * 그 캐시는 사진·영상이 있는 앨범만 담고 있어서, 알림음/벨소리 같은 오디오 전용 폴더가 자연히 빠진다.
 * 형식이 맞지 않는 값은 빈 목록으로 취급한다.
 */
export function parseCachedAlbums(cacheJson: string | null): MoveTarget[] {
  if (!cacheJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cacheJson);
  } catch (e) {
    console.warn('[moveTargets] album cache is not valid JSON', e);
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const albums: MoveTarget[] = [];
  for (const entry of parsed) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as MoveTarget).id === 'string' &&
      typeof (entry as MoveTarget).title === 'string'
    ) {
      albums.push({ id: (entry as MoveTarget).id, title: (entry as MoveTarget).title });
    }
  }
  return albums;
}

/** 현재 앨범을 제외하고 제목순으로 정렬한다. */
export function selectMoveTargets(albums: readonly MoveTarget[], currentDeviceAlbumId: string): MoveTarget[] {
  return albums.filter((album) => album.id !== currentDeviceAlbumId).sort((a, b) => a.title.localeCompare(b.title));
}

export function parseMoveTargets(cacheJson: string | null, currentDeviceAlbumId: string): MoveTarget[] {
  return selectMoveTargets(parseCachedAlbums(cacheJson), currentDeviceAlbumId);
}
