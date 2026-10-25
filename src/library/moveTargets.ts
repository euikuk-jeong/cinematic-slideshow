export interface MoveTarget {
  id: string;
  title: string;
}

/**
 * 앨범 목록 화면이 저장해 둔 앨범 캐시(`album_thumbnail_cache`)에서 이동 대상 후보를 뽑는다.
 * 그 캐시는 사진·영상이 있는 앨범만 담고 있어서, 알림음/벨소리 같은 오디오 전용 폴더가 자연히 빠진다.
 * 현재 앨범은 제외하고 제목순으로 정렬한다. 형식이 맞지 않는 값은 빈 목록으로 취급한다.
 */
export function parseMoveTargets(cacheJson: string | null, currentDeviceAlbumId: string): MoveTarget[] {
  if (!cacheJson) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cacheJson);
  } catch (e) {
    console.warn('[moveTargets] album cache is not valid JSON', e);
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const targets: MoveTarget[] = [];
  for (const entry of parsed) {
    if (
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as MoveTarget).id === 'string' &&
      typeof (entry as MoveTarget).title === 'string' &&
      (entry as MoveTarget).id !== currentDeviceAlbumId
    ) {
      targets.push({ id: (entry as MoveTarget).id, title: (entry as MoveTarget).title });
    }
  }
  return targets.sort((a, b) => a.title.localeCompare(b.title));
}
