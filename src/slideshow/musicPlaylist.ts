import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';
import type { MusicTrack } from '../db/types';

/**
 * source_value(BundledMusicTrack.id)로 번들 음원 파일(require 결과)을 찾는다. 앨범 설정에서
 * 고른 번들 곡이 이후 목록에서 제거된 경우(id 불일치) null을 반환 — 그 트랙만 재생목록에서
 * 건너뛴다.
 */
export function findBundledMusicFile(sourceValue: string): number | null {
  const track = BUNDLED_MUSIC_TRACKS.find((t) => t.id === sourceValue);
  return track ? track.file : null;
}

/**
 * 재생 화면 하단 좌측 토스트("현재 재생 중")에 쓸 커버 이미지 소스 — 번들 트랙은 카탈로그의
 * 정적 커버(require 결과, number)를, 기기 트랙은 DB에 저장된 coverUri(ID3에서 추출한 파일
 * 경로)를 쓴다. AlbumSettingsScreen의 getCoverSource와 동일한 로직(그쪽은 아직 재생목록에
 * 추가하기 전 단계용 SelectedMusic 타입이라 별도 함수로 존재).
 */
export function resolveMusicCoverSource(
  track: Pick<MusicTrack, 'sourceType' | 'sourceValue' | 'coverUri'>
): string | number | null {
  if (track.sourceType === 'bundled') {
    return BUNDLED_MUSIC_TRACKS.find((t) => t.id === track.sourceValue)?.cover ?? null;
  }
  return track.coverUri;
}

/**
 * 토스트에 표시할 한 줄 텍스트 — "제목 · 아티스트"(아티스트 있을 때) 또는 제목만.
 * title이 없으면(태그를 못 읽은 기기 음악) sourceValue로 대체 — AlbumSettingsScreen 목록의
 * `item.title ?? item.sourceValue` 폴백과 동일 패턴.
 */
export function formatMusicTrackLabel(track: Pick<MusicTrack, 'title' | 'artist' | 'sourceValue'>): string {
  const title = track.title ?? track.sourceValue;
  return track.artist ? `${title} · ${track.artist}` : title;
}
