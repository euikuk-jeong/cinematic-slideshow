export type AlbumSortCriterion = 'system' | 'title' | 'path' | 'photo_count' | 'modified' | 'captured';
export type AlbumSortDirection = 'asc' | 'desc';

export interface SortableAlbum {
  id: string;
  title: string;
  folderPath: string;
  /** 앨범 대표(가장 최근 촬영) 항목의 파일 수정시각(ms). */
  modifiedAt: number | null;
  /**
   * 앨범 대표 항목의 촬영일시(ms) — MediaStore DATE_TAKEN(스캔 시 EXIF 촬영일로 채워짐).
   * 값이 없거나(구버전 캐시 포함) 기기가 못 채웠으면 modifiedAt으로 대체한다(albumCapturedAt).
   */
  capturedAt?: number | null;
}

export function isAlbumSortCriterion(value: string | null): value is AlbumSortCriterion {
  return (
    value === 'system' ||
    value === 'title' ||
    value === 'path' ||
    value === 'photo_count' ||
    value === 'modified' ||
    value === 'captured'
  );
}

export function isAlbumSortDirection(value: string | null): value is AlbumSortDirection {
  return value === 'asc' || value === 'desc';
}

/** 촬영일시가 없으면 파일 수정시각으로 대체한 앨범의 "촬영일". */
export function albumCapturedAt(album: SortableAlbum): number | null {
  return album.capturedAt ?? album.modifiedAt ?? null;
}

// 값이 없는 앨범은 방향과 무관하게 항상 뒤로 보낸다(photoSort.comparePhotos와 같은 규칙).
function compareNullableTime(a: number | null, b: number | null, dir: number): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return dir * (a - b);
}

export function sortAlbums<T extends SortableAlbum>(
  albums: readonly T[],
  criterion: AlbumSortCriterion,
  direction: AlbumSortDirection,
  photoCounts: Readonly<Record<string, number>> | null
): T[] {
  const sorted = [...albums];
  const dir = direction === 'asc' ? 1 : -1;
  switch (criterion) {
    case 'system':
      break;
    case 'title':
      sorted.sort((a, b) => dir * a.title.localeCompare(b.title));
      break;
    case 'path':
      sorted.sort((a, b) => dir * a.folderPath.localeCompare(b.folderPath));
      break;
    case 'modified':
      sorted.sort((a, b) => compareNullableTime(a.modifiedAt, b.modifiedAt, dir));
      break;
    case 'captured':
      sorted.sort((a, b) => compareNullableTime(albumCapturedAt(a), albumCapturedAt(b), dir));
      break;
    case 'photo_count':
      // 사진 개수는 지연 계산이라 아직 없으면 시스템 순서를 유지한다.
      if (photoCounts) {
        sorted.sort((a, b) => dir * ((photoCounts[a.id] ?? 0) - (photoCounts[b.id] ?? 0)));
      }
      break;
  }
  return sorted;
}

export type AlbumDateBasis = 'modified' | 'captured';

/** 날짜별 보기의 묶음 기준: 정렬 기준이 "촬영일"일 때만 촬영일, 그 외에는 수정일. */
export function albumDateBasis(criterion: AlbumSortCriterion): AlbumDateBasis {
  return criterion === 'captured' ? 'captured' : 'modified';
}

export interface AlbumMonthFormatter {
  unknownDate: string;
  formatMonth: (year: number, month: number) => string;
}

export interface AlbumDateSection<T> {
  key: string;
  label: string;
  items: T[];
}

const UNKNOWN_MONTH_KEY = 'unknown';

function monthKeyFor(time: number | null): string {
  if (time === null) return UNKNOWN_MONTH_KEY;
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 앨범을 월 단위로 묶는다(앨범은 수십~수백 개라 일 단위로는 섹션마다 한두 개뿐). 섹션은 최신 월이
 * 먼저, 날짜를 알 수 없는 앨범은 맨 뒤 — 각 섹션 내부는 입력 순서(=현재 정렬)를 그대로 보존한다.
 */
export function groupAlbumsByMonth<T extends SortableAlbum>(
  albums: readonly T[],
  basis: AlbumDateBasis,
  formatter: AlbumMonthFormatter
): AlbumDateSection<T>[] {
  const map = new Map<string, T[]>();
  for (const album of albums) {
    const time = basis === 'captured' ? albumCapturedAt(album) : album.modifiedAt;
    const key = monthKeyFor(time);
    const list = map.get(key);
    if (list) list.push(album);
    else map.set(key, [album]);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === UNKNOWN_MONTH_KEY) return 1;
    if (b === UNKNOWN_MONTH_KEY) return -1;
    return b.localeCompare(a);
  });
  return keys.map((key) => {
    if (key === UNKNOWN_MONTH_KEY) return { key, label: formatter.unknownDate, items: map.get(key)! };
    const [year, month] = key.split('-').map(Number);
    return { key, label: formatter.formatMonth(year, month), items: map.get(key)! };
  });
}
