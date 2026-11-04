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

/** 배경음악 기본 볼륨. 앱에 볼륨 설정이 따로 없어 재생 시 기본값(최대)을 기준으로 삼는다. */
export const MUSIC_BASE_VOLUME = 1;
/**
 * once 모드 종료 시 음악을 끄는 대신 기본 볼륨의 이 비율(약 -20dB)까지 줄여 계속 재생한다.
 * 처음엔 50%였으나(약 -6dB) 실기기에서 "조금 줄어든 정도"로만 들려 10%로 낮춤(2026-11-04 사용자 지시).
 */
export const ENDED_MUSIC_VOLUME_RATIO = 0.1;
/** 종료 시 볼륨을 줄이는 시간 — 끝났다는 느낌이 나도록 천천히 줄인다. */
export const MUSIC_END_FADE_OUT_MS = 10000;
/** 종료 상태에서 벗어날 때(이전 버튼 등) 원래 볼륨으로 되돌리는 시간 — 다시 감상하는 중이라 빨리 돌아온다. */
export const MUSIC_RESTORE_FADE_MS = 1500;

/**
 * from에서 to로 durationMs 동안 페이드할 때 elapsedMs 시점의 볼륨(0~1로 고정).
 * 볼륨(선형 gain)을 일정한 양씩 바꾸면 귀에는 처음엔 거의 그대로이다가 끝에서 뚝 떨어지는 것처럼
 * 들리므로(1→0.1에서 0.2→0.1 구간만 -6dB), dB가 일정하게 변하도록 지수 보간한다. 한쪽이 0이면
 * 로그 보간이 불가해 선형으로 대체한다.
 */
export function fadeVolumeAt(from: number, to: number, elapsedMs: number, durationMs: number): number {
  const progress = durationMs <= 0 ? 1 : Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  const clampedFrom = Math.min(Math.max(from, 0), 1);
  const clampedTo = Math.min(Math.max(to, 0), 1);
  if (progress >= 1) return clampedTo;
  if (clampedFrom <= 0 || clampedTo <= 0) {
    return clampedFrom + (clampedTo - clampedFrom) * progress;
  }
  return clampedFrom * Math.pow(clampedTo / clampedFrom, progress);
}
