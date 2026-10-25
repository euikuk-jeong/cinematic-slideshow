export type PhotoSortCriterion = 'filename' | 'creation_time';
export type PhotoSortDirection = 'asc' | 'desc';

export interface PhotoMetadata {
  id: string;
  filename: string | null;
  creationTime: number | null;
  /** 있으면 날짜별 묶음에서 creationTime이 없는 항목의 날짜 대체값으로 쓴다. */
  modificationTime?: number | null;
}

export interface PhotoDateSection<T extends PhotoMetadata = PhotoMetadata> {
  key: string;
  label: string;
  items: T[];
}

// String.prototype.localeCompare(x, 'ko')를 항목마다 새로 호출하면 매번 ICU Collator를
// 새로 구성해 대량 항목에서 성능 문제를 낳는다(MusicPickerModal.tsx의 실기기 OOM 사례
// 참고) — Collator 인스턴스를 모듈 스코프에서 한 번만 만들어 재사용한다.
// numeric: 숫자 구간은 자릿수가 아니라 값으로 비교한다(img2 < img10).
const koreanCollator = new Intl.Collator('ko', { numeric: true });

/**
 * filename/creationTime은 기기 미디어스토어가 값을 못 주는 경우 null일 수 있다
 * (expo-media-library AssetMetadata 타입 문서 참고) — 정렬 방향과 무관하게 값이 없는
 * 항목은 항상 목록 맨 뒤로 보낸다.
 */
export function comparePhotos(a: PhotoMetadata, b: PhotoMetadata, criterion: PhotoSortCriterion, direction: PhotoSortDirection): number {
  const dir = direction === 'asc' ? 1 : -1;
  if (criterion === 'filename') {
    if (a.filename === null && b.filename === null) return 0;
    if (a.filename === null) return 1;
    if (b.filename === null) return -1;
    return dir * koreanCollator.compare(a.filename, b.filename);
  }
  if (a.creationTime === null && b.creationTime === null) return 0;
  if (a.creationTime === null) return 1;
  if (b.creationTime === null) return -1;
  return dir * (a.creationTime - b.creationTime);
}

export function sortPhotos<T extends PhotoMetadata>(
  items: readonly T[],
  criterion: PhotoSortCriterion,
  direction: PhotoSortDirection
): T[] {
  return [...items].sort((a, b) => comparePhotos(a, b, criterion, direction));
}

const UNKNOWN_DATE_KEY = 'unknown';

function dateKeyFor(item: PhotoMetadata): string {
  const time = item.creationTime ?? item.modificationTime ?? null;
  if (time === null) return UNKNOWN_DATE_KEY;
  const d = new Date(time);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export interface DateSectionLabelFormatter {
  unknownDate: string;
  formatDate: (year: number, month: number, day: number) => string;
}

function dateLabelFor(key: string, formatter: DateSectionLabelFormatter): string {
  if (key === UNKNOWN_DATE_KEY) return formatter.unknownDate;
  const [y, m, d] = key.split('-').map(Number);
  return formatter.formatDate(y, m, d);
}

/**
 * items는 호출 전에 원하는 기준(파일명/촬영시간)으로 이미 정렬돼 있어야 한다 — 이
 * 함수는 각 날짜 구간 내부의 순서를 그 입력 순서 그대로 보존하기만 한다. 날짜 구간
 * 자체는 항상 최신 날짜가 먼저. creationTime이 없으면 modificationTime으로 대체하고, 둘 다
 * 없는 항목만 "날짜 없음"으로 묶여 맨 뒤(앨범 목록 날짜별 보기의 `albumCapturedAt`과 같은 규칙).
 */
export function groupPhotosByDate<T extends PhotoMetadata>(
  items: readonly T[],
  formatter: DateSectionLabelFormatter
): PhotoDateSection<T>[] {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = dateKeyFor(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  const keys = [...map.keys()].sort((a, b) => {
    if (a === UNKNOWN_DATE_KEY) return 1;
    if (b === UNKNOWN_DATE_KEY) return -1;
    return b.localeCompare(a);
  });
  return keys.map((key) => ({ key, label: dateLabelFor(key, formatter), items: map.get(key)! }));
}

export function chunkItems<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}
