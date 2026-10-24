import { groupPhotosByDate, sortPhotos, type DateSectionLabelFormatter, type PhotoMetadata, type PhotoSortCriterion, type PhotoSortDirection } from './photoSort';

export type GalleryMediaKind = 'image' | 'video';

/** 갤러리에 표시되는 항목. 사진·영상을 하나의 목록으로 다룬다. */
export interface GalleryItem extends PhotoMetadata {
  mediaKind: GalleryMediaKind;
  width: number | null;
  height: number | null;
  /** 영상 길이(밀리초). 사진이면 null. */
  durationMs: number | null;
  modificationTime: number | null;
}

/** expo-media-library의 AssetMetadata 중 갤러리가 쓰는 필드(네이티브 모듈 타입 비의존). */
export interface RawAssetMetadata {
  id: string;
  filename: string | null;
  mediaType: string;
  width: number | null;
  height: number | null;
  duration: number | null;
  creationTime: number | null;
  modificationTime: number | null;
}

/** image/video가 아닌 asset(오디오 등)은 null — 갤러리에 표시하지 않는다. */
export function toGalleryItem(raw: RawAssetMetadata): GalleryItem | null {
  if (raw.mediaType !== 'image' && raw.mediaType !== 'video') return null;
  return {
    id: raw.id,
    filename: raw.filename,
    creationTime: raw.creationTime,
    mediaKind: raw.mediaType,
    width: raw.width,
    height: raw.height,
    durationMs: raw.mediaType === 'video' ? raw.duration : null,
    modificationTime: raw.modificationTime,
  };
}

export type GalleryViewKind = 'grid' | 'list' | 'date';

/**
 * 파일명 부분 일치 검색(대소문자 무시). 검색어가 비어 있으면 전체, 검색어가 있으면 파일명을
 * 알 수 없는(null) 항목은 제외한다.
 */
export function filterByFilename<T extends { filename: string | null }>(items: readonly T[], query: string): T[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [...items];
  return items.filter((item) => item.filename !== null && item.filename.toLowerCase().includes(normalized));
}

/**
 * 갤러리 화면에 표시되는 순서 그대로의 평탄화 목록. 뷰어는 이 순서로 이웃 항목을 넘긴다.
 * 날짜별 보기는 섹션이 항상 최신 날짜 먼저라서, 촬영시간 오름차순이면 sortPhotos 결과와
 * 순서가 달라진다 — 그래서 화면과 뷰어가 같은 함수를 쓴다. 검색어도 같은 이유로 여기서 적용해,
 * 검색 결과에서 연 뷰어의 이전/다음이 화면의 결과 목록과 어긋나지 않게 한다.
 */
export function buildGalleryOrder(
  items: readonly GalleryItem[],
  criterion: PhotoSortCriterion,
  direction: PhotoSortDirection,
  viewMode: GalleryViewKind,
  formatter: DateSectionLabelFormatter,
  searchQuery = ''
): GalleryItem[] {
  const sorted = sortPhotos(filterByFilename(items, searchQuery), criterion, direction);
  if (viewMode !== 'date') return sorted;
  return groupPhotosByDate(sorted, formatter).flatMap((section) => section.items);
}

export function countImages(items: readonly GalleryItem[]): number {
  return items.reduce((n, item) => (item.mediaKind === 'image' ? n + 1 : n), 0);
}

/** 현재 페이지 ±radius 범위의 마운트 대상 인덱스. */
export function mountedIndices(current: number, total: number, radius = 2): number[] {
  if (total <= 0) return [];
  const clamped = Math.min(Math.max(current, 0), total - 1);
  const from = Math.max(0, clamped - radius);
  const to = Math.min(total - 1, clamped + radius);
  const result: number[] = [];
  for (let i = from; i <= to; i++) result.push(i);
  return result;
}

export interface InitialIndexResult {
  index: number;
  /** 요청한 id가 목록에 없어 0으로 폴백했다(그 사이 삭제됨 등). */
  notFound: boolean;
}

export function initialIndex(order: readonly GalleryItem[], assetId: string): InitialIndexResult {
  const index = order.findIndex((item) => item.id === assetId);
  return index === -1 ? { index: 0, notFound: true } : { index, notFound: false };
}
