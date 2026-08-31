import { useEffect, useRef, useState } from 'react';
import { useAudioPlaylist, useAudioPlaylistStatus, type AudioSource } from 'expo-audio';
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
  /** 사용자가 ♫ 버튼으로 켜둔 상태인지 — 사진 일시정지/재개와는 독립적이다. */
  musicOn: boolean;
  toggleMusicOn: () => void;
  /** 슬라이드쇼 종료(once 모드 마지막 사진) 시점에 호출 — 음악도 완전히 멈춘다. */
  stopMusic: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  currentTrack: MusicTrack | null;
  trackCount: number;
  /** 트랙이 바뀔 때마다(최초 재생 포함) 증가 — 화면이 이 값 변화를 보고 "재생 정보" 토스트를 띄운다. */
  trackStartSeq: number;
}

/**
 * slideshowSettingsId가 null이면(설정 row 없음 — 표시할 사진이 없는 경우 포함) 재생하지 않는다.
 * 재생목록은 항상 loop:'all' — 사진 슬라이드 진행과 무관하게 화면이 떠 있는 동안 계속 순환한다.
 * 화면 unmount 시 정리는 useAudioPlaylist가 자동으로 처리한다(useKeepAwake와 동일 패턴).
 *
 * 사진 일시정지/재개와 음악 재생은 서로 독립이다(LumisShow 웹 버전과 동일 — 원본 소스
 * 확인 결과 pause 버튼은 photo 타이머만 건드리고 audio는 건드리지 않음). musicOn 토글(♫
 * 버튼)만이 음악 재생 여부를 결정한다.
 */
export function useSlideshowMusic(slideshowSettingsId: number | null): SlideshowMusicControls {
  const [sources, setSources] = useState<AudioSource[]>([]);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [musicOn, setMusicOn] = useState(true);
  const [trackStartSeq, setTrackStartSeq] = useState(0);
  const lastIndexRef = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (slideshowSettingsId === null) {
      setSources([]);
      setTracks([]);
      return;
    }
    (async () => {
      const rows = await getMusicTracksBySettingsId(slideshowSettingsId);
      const resolvedSources: AudioSource[] = [];
      const resolvedTracks: MusicTrack[] = [];
      for (const track of rows) {
        const source = await resolveMusicSource(track);
        if (source !== null) {
          resolvedSources.push(source);
          resolvedTracks.push(track);
        }
      }
      if (!cancelled) {
        setSources(resolvedSources);
        setTracks(resolvedTracks);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slideshowSettingsId]);

  const playlist = useAudioPlaylist({ sources, loop: 'all' });
  const status = useAudioPlaylistStatus(playlist);

  // playlist.pause()/play()/next()/previous()는 expo-audio의 native shared object 호출이라,
  // 그 사이 재생목록(sources)이 바뀌어 native 객체가 교체·해제된 뒤에도 호출되면(예: 예약된
  // setTimeout 콜백이 오래된 playlist를 클로저로 들고 있는 경우) "Cannot use shared object
  // that was already released" 예외로 화면 전체가 죽는다 — 실기기에서 실제로 재현됨(once
  // 모드 종료 시 stopMusic() 호출). 호출 시점의 playlist가 이미 해제됐다면 조용히 무시.
  function safeCall(fn: () => void) {
    try {
      fn();
    } catch {
      // 이미 해제된 재생목록 — 더 할 수 있는 게 없다.
    }
  }

  // 새 재생목록이 준비되면 musicOn 상태를 따라 자동재생한다(꺼둔 상태면 재생하지 않음).
  useEffect(() => {
    if (sources.length > 0 && musicOn) safeCall(() => playlist.play());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources, playlist]);

  // 트랙 인덱스가 바뀔 때마다(자동 순환·수동 이전/다음곡 모두) trackStartSeq를 올려 화면이
  // "재생 정보" 토스트를 다시 띄우게 한다. lastIndexRef가 null인 첫 호출은 재생목록이
  // 로드되기 전 기본값(0)과 우연히 같아지는 것을 막기 위한 가드.
  useEffect(() => {
    if (sources.length === 0) return;
    if (lastIndexRef.current === status.currentIndex) return;
    lastIndexRef.current = status.currentIndex;
    setTrackStartSeq((n) => n + 1);
  }, [status.currentIndex, sources.length]);

  return {
    musicOn,
    toggleMusicOn: () => {
      const next = !musicOn;
      setMusicOn(next);
      if (sources.length > 0) {
        if (next) {
          safeCall(() => playlist.play());
          setTrackStartSeq((n) => n + 1);
        } else {
          safeCall(() => playlist.pause());
        }
      }
    },
    stopMusic: () => {
      setMusicOn(false);
      safeCall(() => playlist.pause());
    },
    nextTrack: () => safeCall(() => playlist.next()),
    previousTrack: () => safeCall(() => playlist.previous()),
    currentTrack: tracks[status.currentIndex] ?? null,
    trackCount: sources.length,
    trackStartSeq,
  };
}
