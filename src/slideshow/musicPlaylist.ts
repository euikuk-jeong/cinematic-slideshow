import { BUNDLED_MUSIC_TRACKS } from '../../assets/music/bundled';

/**
 * source_value(BundledMusicTrack.id)로 번들 음원 파일(require 결과)을 찾는다. 앨범 설정에서
 * 고른 번들 곡이 이후 목록에서 제거된 경우(id 불일치) null을 반환 — 그 트랙만 재생목록에서
 * 건너뛴다.
 */
export function findBundledMusicFile(sourceValue: string): number | null {
  const track = BUNDLED_MUSIC_TRACKS.find((t) => t.id === sourceValue);
  return track ? track.file : null;
}
