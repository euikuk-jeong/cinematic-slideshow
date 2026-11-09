import { folderPathToDirectory } from '../photos/directMove';
import { displayPath } from './folderLocation';

export interface MoveTarget {
  id: string;
  title: string;
  /** 앨범 목록이 저장한 폴더 경로(대표 항목의 파일 경로에서 뽑은 것). 구버전 캐시엔 없다. */
  folderPath?: string;
}

// MediaStore는 사진·영상의 최상위 폴더를 이 목록으로 제한한다(그 밖은 `Primary directory X not allowed`로
// 거부 — 실기기에서 `_MyData/…`로 확인). Download/Documents는 사진·영상 컬렉션에선 허용되지 않는다.
const MEDIA_ROOT_DIRECTORIES = ['dcim', 'pictures', 'movies'];

/**
 * 폴더 경로의 최상위 폴더가 사진·영상을 옮길 수 없는 곳이면 그 이름을, 옮길 수 있거나 경로를 해석할 수
 * 없으면 null을 돌려준다(모르는 경우를 막지 않는다 — 막는 건 확실히 거부되는 곳뿐).
 */
export function blockedTopDirectory(folderPath: string | undefined): string | null {
  if (!folderPath) return null;
  const match = /^(?:file:\/\/)?\/(?:storage\/emulated\/\d+|sdcard)\/([^/]+)/.exec(folderPath);
  if (!match) return null;
  return MEDIA_ROOT_DIRECTORIES.includes(match[1].toLowerCase()) ? null : match[1];
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
      const { id, title, folderPath } = entry as MoveTarget;
      albums.push(typeof folderPath === 'string' ? { id, title, folderPath } : { id, title });
    }
  }
  return albums;
}

/** 작업 대상이 들어 있는 앨범(들)을 제외하고 제목순으로 정렬한다. */
export function selectMoveTargets(albums: readonly MoveTarget[], excluded: string | readonly string[]): MoveTarget[] {
  const excludedIds = new Set(typeof excluded === 'string' ? [excluded] : excluded);
  return albums.filter((album) => !excludedIds.has(album.id)).sort((a, b) => a.title.localeCompare(b.title));
}

export function parseMoveTargets(cacheJson: string | null, excluded: string | readonly string[]): MoveTarget[] {
  return selectMoveTargets(parseCachedAlbums(cacheJson), excluded);
}

/** 사용자에게 보여 줄 앨범 폴더 경로(`/Pictures/Camera`). 경로를 모르면(구버전 캐시 등) null. */
export function moveTargetPath(target: MoveTarget): string | null {
  const directory = folderPathToDirectory(target.folderPath);
  return directory ? displayPath(directory) : null;
}

/**
 * 이동·복사 대상 앨범을 제목 또는 표시 경로의 부분일치(대소문자 무시)로 거른다. 검색어가 비어 있으면 그대로 돌려준다.
 * 전체 경로가 아니라 표시 경로로 찾는다 — 전체 경로면 모든 앨범의 `/storage/emulated/0`에 걸려 엉뚱한 결과가 나온다.
 * 한글은 조합형(NFD, 다른 OS에서 복사한 폴더 이름 등)으로 저장돼 있을 수 있어 양쪽을 NFC로 맞춘 뒤 비교한다.
 */
export function filterMoveTargets(targets: readonly MoveTarget[], query: string): MoveTarget[] {
  const needle = normalizeForSearch(query.trim());
  if (!needle) return [...targets];
  return targets.filter(
    (target) =>
      normalizeForSearch(target.title).includes(needle) ||
      normalizeForSearch(moveTargetPath(target) ?? '').includes(needle)
  );
}

function normalizeForSearch(text: string): string {
  return text.normalize('NFC').toLowerCase();
}
