import {
  getAlbumByDeviceId,
  getDefaultMusicTracks,
  getSlideshowDefaults,
  getSlideshowSettingsByAlbumId,
  insertAlbum,
  setSlideshowMusicTracks,
  updateAlbumDisplayName,
  upsertMusicTrack,
  upsertSlideshowSettings,
} from '../db/client';
import type { Album, MusicSourceType, OrderMode, RepeatMode } from '../db/types';
import type { PhotoSortCriterion, PhotoSortDirection } from '../photos/photoSort';
import type { SlideshowDefaults } from '../settings/slideshowDefaults';

export interface MusicSelection {
  sourceType: MusicSourceType;
  sourceValue: string;
  title: string | null;
  artist: string | null;
  coverUri: string | null;
}

export interface SlideshowSettingsValues {
  transitionIntervalSec: number;
  orderMode: OrderMode;
  repeatMode: RepeatMode;
  sortCriterion: PhotoSortCriterion;
  sortDirection: PhotoSortDirection;
  selectedMusicList: readonly MusicSelection[];
}

/**
 * 기기 앨범에 대응하는 album row를 찾고, 없으면 만든다. 표시명이 바뀌었으면 갱신한다.
 * 앨범별 설정 화면 진입과 갤러리의 "슬라이드쇼" 바로 재생이 같은 규칙으로 앨범을 준비하도록 공유한다.
 */
export async function findOrCreateAlbum(deviceAlbumId: string, displayName: string): Promise<Album> {
  const existing = await getAlbumByDeviceId(deviceAlbumId);
  if (!existing) return insertAlbum(deviceAlbumId, displayName);
  if (existing.displayName !== displayName) {
    await updateAlbumDisplayName(existing.id, displayName);
    return { ...existing, displayName };
  }
  return existing;
}

/** 설정 row와 재생목록을 함께 저장한다(재생목록은 전체 교체). */
export async function saveSlideshowSettings(albumId: number, values: SlideshowSettingsValues): Promise<void> {
  const settings = await upsertSlideshowSettings(
    albumId,
    values.transitionIntervalSec,
    values.orderMode,
    values.repeatMode,
    values.sortCriterion,
    values.sortDirection
  );
  const musicTrackIds: number[] = [];
  for (const music of values.selectedMusicList) {
    const track = await upsertMusicTrack(music.sourceType, music.sourceValue, music.title, music.artist, music.coverUri);
    musicTrackIds.push(track.id);
  }
  await setSlideshowMusicTracks(settings.id, musicTrackIds);
}

export interface NewAlbumInitialState {
  defaults: SlideshowDefaults;
  defaultMusic: MusicSelection[];
}

/**
 * 설정을 한 번도 저장하지 않은 신규 앨범의 초기값: 앱 설정의 슬라이드쇼 기본값 + 기본 배경음악.
 * 기본 음악 조회가 실패해도 음악 없이 시작한다(설정 화면이 열리지 않는 것보다 낫다).
 */
export async function loadNewAlbumInitialState(): Promise<NewAlbumInitialState> {
  const defaults = await getSlideshowDefaults();
  let defaultMusic: MusicSelection[] = [];
  try {
    defaultMusic = await getDefaultMusicTracks();
  } catch (e) {
    console.warn('[albumSetup] 기본 배경음악 조회 실패, 음악 없이 시작', e);
  }
  return { defaults, defaultMusic };
}

/**
 * 설정 화면을 거치지 않고 바로 재생하기 전에 앨범을 준비한다. 신규 앨범이면 설정 화면이 첫 진입 때
 * 하는 것과 똑같이 기본 배경음악을 이 앨범 재생목록에 저장해 둔다 — 재생 화면은 설정 row가 있어야
 * 음악을 재생하므로, 이걸 빼먹으면 기본 음악을 지정해 둔 사용자가 신규 앨범을 재생할 때 소리가 안 난다.
 */
export async function prepareAlbumForPlayback(deviceAlbumId: string, displayName: string): Promise<Album> {
  const album = await findOrCreateAlbum(deviceAlbumId, displayName);
  const settings = await getSlideshowSettingsByAlbumId(album.id);
  if (settings) return album;
  const { defaults, defaultMusic } = await loadNewAlbumInitialState();
  if (defaultMusic.length > 0) {
    await saveSlideshowSettings(album.id, { ...defaults, selectedMusicList: defaultMusic });
  }
  return album;
}
