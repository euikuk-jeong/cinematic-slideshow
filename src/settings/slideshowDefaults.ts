import type { OrderMode, RepeatMode } from '../db/types';
import type { PhotoSortCriterion, PhotoSortDirection } from '../photos/photoSort';

export const TRANSITION_INTERVAL_MIN_SEC = 2;
export const TRANSITION_INTERVAL_MAX_SEC = 10;

// 사용자가 신규앨범 기본값을 한 번도 설정하지 않았을 때 쓰는 built-in 값 — 이전에
// AlbumSettingsScreen/SlideshowPlayerScreen 두 곳에 중복 하드코딩돼 있던 값을 여기로 통합.
export const FALLBACK_TRANSITION_INTERVAL_SEC = 4;
export const FALLBACK_ORDER_MODE: OrderMode = 'sequential';
export const FALLBACK_REPEAT_MODE: RepeatMode = 'loop';
export const FALLBACK_SORT_CRITERION: PhotoSortCriterion = 'creation_time';
export const FALLBACK_SORT_DIRECTION: PhotoSortDirection = 'asc';

export const SLIDESHOW_DEFAULT_TRANSITION_INTERVAL_SEC_KEY = 'slideshow_default_transition_interval_sec';
export const SLIDESHOW_DEFAULT_ORDER_MODE_KEY = 'slideshow_default_order_mode';
export const SLIDESHOW_DEFAULT_REPEAT_MODE_KEY = 'slideshow_default_repeat_mode';
export const SLIDESHOW_DEFAULT_SORT_CRITERION_KEY = 'slideshow_default_sort_criterion';
export const SLIDESHOW_DEFAULT_SORT_DIRECTION_KEY = 'slideshow_default_sort_direction';

export interface SlideshowDefaults {
  transitionIntervalSec: number;
  orderMode: OrderMode;
  repeatMode: RepeatMode;
  sortCriterion: PhotoSortCriterion;
  sortDirection: PhotoSortDirection;
}

export interface RawSlideshowDefaults {
  transitionIntervalSec: string | null;
  orderMode: string | null;
  repeatMode: string | null;
  sortCriterion: string | null;
  sortDirection: string | null;
}

export function parseTransitionIntervalSec(raw: string | null): number {
  const n = raw === null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return FALLBACK_TRANSITION_INTERVAL_SEC;
  return Math.min(TRANSITION_INTERVAL_MAX_SEC, Math.max(TRANSITION_INTERVAL_MIN_SEC, Math.round(n)));
}

export function isOrderMode(raw: string | null): raw is OrderMode {
  return raw === 'sequential' || raw === 'random';
}

export function isRepeatMode(raw: string | null): raw is RepeatMode {
  return raw === 'once' || raw === 'loop';
}

export function isSortCriterion(raw: string | null): raw is PhotoSortCriterion {
  return raw === 'creation_time' || raw === 'filename';
}

export function isSortDirection(raw: string | null): raw is PhotoSortDirection {
  return raw === 'asc' || raw === 'desc';
}

export function resolveSlideshowDefaults(raw: RawSlideshowDefaults): SlideshowDefaults {
  return {
    transitionIntervalSec: parseTransitionIntervalSec(raw.transitionIntervalSec),
    orderMode: isOrderMode(raw.orderMode) ? raw.orderMode : FALLBACK_ORDER_MODE,
    repeatMode: isRepeatMode(raw.repeatMode) ? raw.repeatMode : FALLBACK_REPEAT_MODE,
    sortCriterion: isSortCriterion(raw.sortCriterion) ? raw.sortCriterion : FALLBACK_SORT_CRITERION,
    sortDirection: isSortDirection(raw.sortDirection) ? raw.sortDirection : FALLBACK_SORT_DIRECTION,
  };
}
