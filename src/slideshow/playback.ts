import { sortPhotos, type PhotoMetadata, type PhotoSortCriterion, type PhotoSortDirection } from '../photos/photoSort';
import type { OrderMode, RepeatMode } from '../db/types';

function defaultShuffle<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * selectedIds가 비어있으면(= album_selected_photos에 커스텀 선택이 없으면) 앨범 전체를,
 * 있으면 그 사진들만 재생 대상으로 삼는다(CLAUDE.md 재생 화면 규칙). 기준 순서는
 * sortCriterion/sortDirection(기본 촬영시간 오름차순) — 순차 모드는 그대로, 랜덤 모드는
 * 섞기 전 기준일 뿐이라 이 순서를 섞어버리므로 결과에 영향이 없다.
 */
export function buildPlaybackSequence(
  photos: readonly PhotoMetadata[],
  selectedIds: ReadonlySet<string>,
  orderMode: OrderMode,
  sortCriterion: PhotoSortCriterion,
  sortDirection: PhotoSortDirection,
  shuffle: (items: readonly PhotoMetadata[]) => PhotoMetadata[] = defaultShuffle
): PhotoMetadata[] {
  const base = sortPhotos(photos, sortCriterion, sortDirection);
  const filtered = selectedIds.size === 0 ? base : base.filter((photo) => selectedIds.has(photo.id));
  return orderMode === 'random' ? shuffle(filtered) : filtered;
}

/**
 * 마지막 사진 다음이면 반복 모드에 따라 0(loop)으로 돌아가거나 null(once — 재생 종료)을
 * 반환한다.
 */
export function nextPlaybackIndex(currentIndex: number, length: number, repeatMode: RepeatMode): number | null {
  if (length === 0) return null;
  const next = currentIndex + 1;
  if (next < length) return next;
  return repeatMode === 'loop' ? 0 : null;
}
