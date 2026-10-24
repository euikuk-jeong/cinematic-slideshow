import type { MusicSourceType, OrderMode, RepeatMode } from '../db/types';
import type { PhotoSortCriterion, PhotoSortDirection } from '../photos/photoSort';

export const TRANSITION_INTERVAL_MIN_SEC = 2;
export const TRANSITION_INTERVAL_MAX_SEC = 10;

// 사용자가 신규앨범 기본값을 한 번도 설정하지 않았을 때 쓰는 built-in 값 — 이전에
// AlbumSettingsScreen/SlideshowPlayerScreen 두 곳에 중복 하드코딩돼 있던 값을 여기로 통합.
export const FALLBACK_TRANSITION_INTERVAL_SEC = 5;
export const FALLBACK_ORDER_MODE: OrderMode = 'sequential';
export const FALLBACK_REPEAT_MODE: RepeatMode = 'once';
export const FALLBACK_SORT_CRITERION: PhotoSortCriterion = 'creation_time';
export const FALLBACK_SORT_DIRECTION: PhotoSortDirection = 'asc';

export const SLIDESHOW_DEFAULT_TRANSITION_INTERVAL_SEC_KEY = 'slideshow_default_transition_interval_sec';
export const SLIDESHOW_DEFAULT_ORDER_MODE_KEY = 'slideshow_default_order_mode';
export const SLIDESHOW_DEFAULT_REPEAT_MODE_KEY = 'slideshow_default_repeat_mode';
export const SLIDESHOW_DEFAULT_SORT_CRITERION_KEY = 'slideshow_default_sort_criterion';
export const SLIDESHOW_DEFAULT_SORT_DIRECTION_KEY = 'slideshow_default_sort_direction';

// 신규 앨범 설정의 초기 배경음악 재생목록(JSON 배열). 앱 설정 화면에서 지정하고, 앨범 설정을 처음
// 열 때 그 앨범의 재생목록으로 복사된다 — 이후 앨범별로 자유롭게 바뀐다.
export const SLIDESHOW_DEFAULT_MUSIC_TRACKS_KEY = 'slideshow_default_music_tracks';

export interface DefaultMusicTrack {
  sourceType: MusicSourceType;
  sourceValue: string;
  title: string | null;
  artist: string | null;
  coverUri: string | null;
}

export function defaultMusicTrackKey(track: Pick<DefaultMusicTrack, 'sourceType' | 'sourceValue'>): string {
  return `${track.sourceType}:${track.sourceValue}`;
}

function nullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

// 손상됐거나 알 수 없는 값은 버리고, 같은 트랙이 중복돼 있으면 처음 것만 남긴다 —
// 저장소가 JSON 문자열이라 이전 버전/수동 편집으로 모양이 어긋나도 화면이 죽지 않게 한다.
export function parseDefaultMusicTracks(raw: string | null): DefaultMusicTrack[] {
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const seen = new Set<string>();
  const result: DefaultMusicTrack[] = [];
  for (const entry of parsed) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { sourceType, sourceValue, title, artist, coverUri } = entry as Record<string, unknown>;
    if ((sourceType !== 'bundled' && sourceType !== 'device') || typeof sourceValue !== 'string' || sourceValue === '') {
      continue;
    }
    const track: DefaultMusicTrack = {
      sourceType,
      sourceValue,
      title: nullableString(title),
      artist: nullableString(artist),
      coverUri: nullableString(coverUri),
    };
    const key = defaultMusicTrackKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(track);
  }
  return result;
}

export function serializeDefaultMusicTracks(tracks: readonly DefaultMusicTrack[]): string {
  return JSON.stringify(tracks);
}

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
