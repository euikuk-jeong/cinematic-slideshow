import { useEffect, useState } from 'react';
import { useAudioPlaylist, type AudioSource } from 'expo-audio';
import * as MediaLibrary from 'expo-media-library';

import { getMusicTracksBySettingsId } from '../db/client';
import type { MusicTrack } from '../db/types';
import { findBundledMusicFile } from './musicPlaylist';

async function resolveMusicSource(track: MusicTrack): Promise<AudioSource | null> {
  if (track.sourceType === 'bundled') {
    return findBundledMusicFile(track.sourceValue);
  }
  try {
    const uri = await new MediaLibrary.Asset(track.sourceValue).getUri();
    return { uri };
  } catch {
    // 삭제된 기기 음원 등 — 이 트랙만 재생목록에서 건너뛴다(resolvePhotoUri와 동일 방침).
    return null;
  }
}

export interface SlideshowMusicControls {
  pauseMusic: () => void;
  resumeMusic: () => void;
}

/**
 * slideshowSettingsId가 null이면(설정 row 없음 — 표시할 사진이 없는 경우 포함) 재생하지 않는다.
 * 재생목록은 항상 loop:'all' — 사진 슬라이드 진행과 무관하게 화면이 떠 있는 동안 계속 순환한다.
 * 화면 unmount 시 정리는 useAudioPlaylist가 자동으로 처리한다(useKeepAwake와 동일 패턴).
 * pauseMusic/resumeMusic은 툴바의 일시정지/재개 버튼과 연동하기 위한 것 — 사진 전환이
 * 멈춰도 음악은 계속 나가는 것을 막는다.
 */
export function useSlideshowMusic(slideshowSettingsId: number | null): SlideshowMusicControls {
  const [sources, setSources] = useState<AudioSource[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (slideshowSettingsId === null) {
      setSources([]);
      return;
    }
    (async () => {
      const tracks = await getMusicTracksBySettingsId(slideshowSettingsId);
      const resolved: AudioSource[] = [];
      for (const track of tracks) {
        const source = await resolveMusicSource(track);
        if (source !== null) resolved.push(source);
      }
      if (!cancelled) setSources(resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [slideshowSettingsId]);

  const playlist = useAudioPlaylist({ sources, loop: 'all' });

  useEffect(() => {
    if (sources.length > 0) playlist.play();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, playlist]);

  return {
    pauseMusic: () => playlist.pause(),
    resumeMusic: () => {
      if (sources.length > 0) playlist.play();
    },
  };
}
