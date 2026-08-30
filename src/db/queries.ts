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

export const INSERT_SLIDESHOW_MUSIC_TRACK_SQL = `
  INSERT INTO slideshow_music_tracks (slideshow_settings_id, music_track_id, order_index)
  VALUES (?, ?, ?)
`;

export const SELECT_MUSIC_TRACKS_BY_SETTINGS_ID_SQL = `
  SELECT mt.* FROM slideshow_music_tracks smt
  JOIN music_tracks mt ON mt.id = smt.music_track_id
  WHERE smt.slideshow_settings_id = ?
  ORDER BY smt.order_index
`;

export const DELETE_SLIDESHOW_MUSIC_TRACKS_BY_SETTINGS_ID_SQL = `
  DELETE FROM slideshow_music_tracks WHERE slideshow_settings_id = ?
`;

export function buildInsertSlideshowMusicTrackParams(
  slideshowSettingsId: number,
  musicTrackId: number,
  orderIndex: number
): [number, number, number] {
  return [slideshowSettingsId, musicTrackId, orderIndex];
}

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

export const UPDATE_ALBUM_DISPLAY_NAME_SQL = `
  UPDATE albums SET display_name = ? WHERE id = ?
`;

export const DELETE_ALBUM_SQL = `
  DELETE FROM albums WHERE id = ?
`;

export const INSERT_MUSIC_TRACK_SQL = `
  INSERT INTO music_tracks (source_type, source_value, title, artist, cover_uri)
  VALUES (?, ?, ?, ?, ?)
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

// artist/cover_uri는 COALESCE로 기존 값을 지키고, excluded 쪽에 실제 값이 있을 때만
// 덮어쓴다 — persist()가 음악과 무관한 설정 변경(간격 슬라이더 등)에도 매번 모든 트랙에
// upsert를 재호출하는데, 그때 아직 태그 파싱 전이라 artist/cover_uri가 null이면 이미
// 저장돼 있던 값을 null로 지워버리는 걸 막기 위함.
export const UPSERT_MUSIC_TRACK_SQL = `
  INSERT INTO music_tracks (source_type, source_value, title, artist, cover_uri) VALUES (?, ?, ?, ?, ?)
  ON CONFLICT (source_type, source_value) DO UPDATE SET
    title = excluded.title,
    artist = COALESCE(excluded.artist, music_tracks.artist),
    cover_uri = COALESCE(excluded.cover_uri, music_tracks.cover_uri)
`;

export const INSERT_SLIDESHOW_SETTINGS_SQL = `
  INSERT INTO slideshow_settings
    (album_id, transition_interval_sec, order_mode, repeat_mode)
  VALUES (?, ?, ?, ?)
`;

export const SELECT_SETTINGS_BY_ALBUM_ID_SQL = `
  SELECT * FROM slideshow_settings WHERE album_id = ?
`;

export const UPDATE_SLIDESHOW_SETTINGS_SQL = `
  UPDATE slideshow_settings
  SET transition_interval_sec = ?,
      order_mode = ?,
      repeat_mode = ?,
      updated_at = datetime('now')
  WHERE album_id = ?
`;

export const INSERT_OR_IGNORE_SELECTED_PHOTO_SQL = `
  INSERT OR IGNORE INTO album_selected_photos (album_id, device_asset_id) VALUES (?, ?)
`;

export const DELETE_SELECTED_PHOTO_SQL = `
  DELETE FROM album_selected_photos WHERE album_id = ? AND device_asset_id = ?
`;

export const DELETE_SELECTED_PHOTOS_BY_ALBUM_ID_SQL = `
  DELETE FROM album_selected_photos WHERE album_id = ?
`;

export const SELECT_SELECTED_PHOTO_IDS_BY_ALBUM_ID_SQL = `
  SELECT device_asset_id FROM album_selected_photos WHERE album_id = ?
`;

export const SELECT_SELECTED_PHOTO_COUNT_BY_ALBUM_ID_SQL = `
  SELECT COUNT(*) as count FROM album_selected_photos WHERE album_id = ?
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
  title: string | null,
  artist: string | null,
  coverUri: string | null
): [MusicSourceType, string, string | null, string | null, string | null] {
  return [sourceType, sourceValue, title, artist, coverUri];
}

export const buildUpsertMusicTrackParams = buildInsertMusicTrackParams;

export function buildInsertSlideshowSettingsParams(
  albumId: number,
  transitionIntervalSec: number,
  orderMode: OrderMode,
  repeatMode: RepeatMode
): [number, number, OrderMode, RepeatMode] {
  return [albumId, transitionIntervalSec, orderMode, repeatMode];
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
    artist: row.artist,
    coverUri: row.cover_uri,
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
    updatedAt: row.updated_at,
  };
}

export function mapAppSettingRow(row: AppSettingRow): { key: string; value: string } {
  return { key: row.key, value: row.value };
}
