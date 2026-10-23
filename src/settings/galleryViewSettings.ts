import type { PhotoSortCriterion, PhotoSortDirection } from '../photos/photoSort';
import type { GridColumnRange } from './albumGridZoom';

export type GalleryViewMode = 'grid' | 'date';

export const DEFAULT_GALLERY_SORT_CRITERION: PhotoSortCriterion = 'creation_time';
export const DEFAULT_GALLERY_SORT_DIRECTION: PhotoSortDirection = 'desc';
export const DEFAULT_GALLERY_VIEW_MODE: GalleryViewMode = 'grid';

export const MIN_GALLERY_COLUMNS = 2;
export const MAX_GALLERY_COLUMNS = 6;
export const DEFAULT_GALLERY_COLUMNS = 3;
export const GALLERY_COLUMN_RANGE: GridColumnRange = { min: MIN_GALLERY_COLUMNS, max: MAX_GALLERY_COLUMNS };

export const GALLERY_SORT_CRITERION_STORAGE_KEY = 'gallery_sort_criterion';
export const GALLERY_SORT_DIRECTION_STORAGE_KEY = 'gallery_sort_direction';
export const GALLERY_VIEW_MODE_STORAGE_KEY = 'gallery_view_mode';
export const GALLERY_GRID_COLUMNS_STORAGE_KEY = 'gallery_grid_columns';
export const GALLERY_VIDEO_BANNER_DISMISSED_STORAGE_KEY = 'gallery_video_banner_dismissed';

/** 영상 접근 안내 배너를 사용자가 닫았는지(기본: 닫지 않음 = 안내를 보여준다). */
export function parseVideoBannerDismissed(raw: string | null): boolean {
  return raw === '1';
}

export function parseGallerySortCriterion(raw: string | null): PhotoSortCriterion {
  return raw === 'filename' || raw === 'creation_time' ? raw : DEFAULT_GALLERY_SORT_CRITERION;
}

export function parseGallerySortDirection(raw: string | null): PhotoSortDirection {
  return raw === 'asc' || raw === 'desc' ? raw : DEFAULT_GALLERY_SORT_DIRECTION;
}

// 리스트형은 v1 범위 밖이라 저장돼 있어도(이후 버전과의 호환) 그리드로 폴백한다.
export function parseGalleryViewMode(raw: string | null): GalleryViewMode {
  return raw === 'date' || raw === 'grid' ? raw : DEFAULT_GALLERY_VIEW_MODE;
}

export function parseGalleryColumns(raw: string | null): number {
  if (!raw) return DEFAULT_GALLERY_COLUMNS;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) return DEFAULT_GALLERY_COLUMNS;
  return Math.min(MAX_GALLERY_COLUMNS, Math.max(MIN_GALLERY_COLUMNS, parsed));
}
