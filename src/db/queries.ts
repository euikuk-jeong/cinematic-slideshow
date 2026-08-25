import type {
  Album,
  AlbumRow,
  AppSettingRow,
  MusicTrack,
  MusicTrackRow,
  MusicSourceType,
  OrderMode,
  RepeatMode,
  SlideshowSettings,
  SlideshowSettingsRow,
} from './types';

export const INSERT_ALBUM_SQL = `
  INSERT INTO albums (device_album_id, display_name)
  VALUES (?, ?)
`;

export const SELECT_ALBUM_BY_ID_SQL = `
  SELECT * FROM albums WHERE id = ?
`;

export const SELECT_ALBUM_BY_DEVICE_ID_SQL = `
  SELECT * FROM albums WHERE device_album_id = ?
`;

export const SELECT_ALL_ALBUMS_SQL = `
  SELECT * FROM albums
`;

export const UPDATE_ALBUM_REFERENCE_VALIDITY_SQL = `
  UPDATE albums SET is_reference_valid = ? WHERE id = ?
`;

export const DELETE_ALBUM_SQL = `
  DELETE FROM albums WHERE id = ?
`;

export const INSERT_MUSIC_TRACK_SQL = `
  INSERT INTO music_tracks (source_type, source_value, title)
  VALUES (?, ?, ?)
`;

export const SELECT_MUSIC_TRACK_BY_ID_SQL = `
  SELECT * FROM music_tracks WHERE id = ?
`;

export const SELECT_MUSIC_TRACK_BY_SOURCE_SQL = `
  SELECT * FROM music_tracks WHERE source_type = ? AND source_value = ?
`;

export const DELETE_MUSIC_TRACK_SQL = `
  DELETE FROM music_tracks WHERE id = ?
`;

export const UPSERT_MUSIC_TRACK_SQL = `
  INSERT INTO music_tracks (source_type, source_value, title) VALUES (?, ?, ?)
  ON CONFLICT (source_type, source_value) DO UPDATE SET title = excluded.title
`;

export const INSERT_SLIDESHOW_SETTINGS_SQL = `
  INSERT INTO slideshow_settings
    (album_id, transition_interval_sec, order_mode, repeat_mode, music_track_id)
  VALUES (?, ?, ?, ?, ?)
`;

export const SELECT_SETTINGS_BY_ALBUM_ID_SQL = `
  SELECT * FROM slideshow_settings WHERE album_id = ?
`;

export const UPDATE_SLIDESHOW_SETTINGS_SQL = `
  UPDATE slideshow_settings
  SET transition_interval_sec = ?,
      order_mode = ?,
      repeat_mode = ?,
      music_track_id = ?,
      updated_at = datetime('now')
  WHERE album_id = ?
`;

export const UPSERT_APP_SETTING_SQL = `
  INSERT INTO app_settings (key, value) VALUES (?, ?)
  ON CONFLICT (key) DO UPDATE SET value = excluded.value
`;

export const SELECT_APP_SETTING_SQL = `
  SELECT * FROM app_settings WHERE key = ?
`;

export function buildInsertAlbumParams(deviceAlbumId: string, displayName: string): [string, string] {
  return [deviceAlbumId, displayName];
}

export function buildInsertMusicTrackParams(
  sourceType: MusicSourceType,
  sourceValue: string,
  title: string | null
): [MusicSourceType, string, string | null] {
  return [sourceType, sourceValue, title];
}

export const buildUpsertMusicTrackParams = buildInsertMusicTrackParams;

export function buildInsertSlideshowSettingsParams(
  albumId: number,
  transitionIntervalSec: number,
  orderMode: OrderMode,
  repeatMode: RepeatMode,
  musicTrackId: number | null
): [number, number, OrderMode, RepeatMode, number | null] {
  return [albumId, transitionIntervalSec, orderMode, repeatMode, musicTrackId];
}

export function mapAlbumRow(row: AlbumRow): Album {
  return {
    id: row.id,
    deviceAlbumId: row.device_album_id,
    displayName: row.display_name,
    isReferenceValid: row.is_reference_valid === 1,
    createdAt: row.created_at,
  };
}

export function mapMusicTrackRow(row: MusicTrackRow): MusicTrack {
  return {
    id: row.id,
    sourceType: row.source_type,
    sourceValue: row.source_value,
    title: row.title,
    createdAt: row.created_at,
  };
}

export function mapSlideshowSettingsRow(row: SlideshowSettingsRow): SlideshowSettings {
  return {
    id: row.id,
    albumId: row.album_id,
    transitionIntervalSec: row.transition_interval_sec,
    orderMode: row.order_mode,
    repeatMode: row.repeat_mode,
    musicTrackId: row.music_track_id,
    updatedAt: row.updated_at,
  };
}

export function mapAppSettingRow(row: AppSettingRow): { key: string; value: string } {
  return { key: row.key, value: row.value };
}
