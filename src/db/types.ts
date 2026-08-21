export type OrderMode = 'sequential' | 'random';
export type RepeatMode = 'once' | 'loop';
export type MusicSourceType = 'device' | 'bundled';

export interface AlbumRow {
  id: number;
  device_album_id: string;
  display_name: string;
  is_reference_valid: 0 | 1;
  created_at: string;
}

export interface SlideshowSettingsRow {
  id: number;
  album_id: number;
  transition_interval_sec: number;
  order_mode: OrderMode;
  repeat_mode: RepeatMode;
  music_track_id: number | null;
  updated_at: string;
}

export interface MusicTrackRow {
  id: number;
  source_type: MusicSourceType;
  source_value: string;
  title: string | null;
  created_at: string;
}

export interface AppSettingRow {
  key: string;
  value: string;
}

export interface Album {
  id: number;
  deviceAlbumId: string;
  displayName: string;
  isReferenceValid: boolean;
  createdAt: string;
}

export interface SlideshowSettings {
  id: number;
  albumId: number;
  transitionIntervalSec: number;
  orderMode: OrderMode;
  repeatMode: RepeatMode;
  musicTrackId: number | null;
  updatedAt: string;
}

export interface MusicTrack {
  id: number;
  sourceType: MusicSourceType;
  sourceValue: string;
  title: string | null;
  createdAt: string;
}
