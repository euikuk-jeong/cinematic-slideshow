import * as SQLite from 'expo-sqlite';

import { computeReferenceValidityDiff, type ReferenceValidityDiff } from './referenceValidity';
import { getPendingMigrations } from './schema';
import {
  buildInsertAlbumParams,
  buildInsertMusicTrackParams,
  buildInsertSlideshowSettingsParams,
  buildUpsertMusicTrackParams,
  DELETE_ALBUM_SQL,
  INSERT_ALBUM_SQL,
  INSERT_MUSIC_TRACK_SQL,
  INSERT_SLIDESHOW_SETTINGS_SQL,
  mapAlbumRow,
  mapMusicTrackRow,
  mapSlideshowSettingsRow,
  SELECT_ALBUM_BY_DEVICE_ID_SQL,
  SELECT_ALBUM_BY_ID_SQL,
  SELECT_ALL_ALBUMS_SQL,
  SELECT_APP_SETTING_SQL,
  SELECT_MUSIC_TRACK_BY_ID_SQL,
  SELECT_MUSIC_TRACK_BY_SOURCE_SQL,
  SELECT_SETTINGS_BY_ALBUM_ID_SQL,
  UPDATE_ALBUM_REFERENCE_VALIDITY_SQL,
  UPDATE_SLIDESHOW_SETTINGS_SQL,
  UPSERT_APP_SETTING_SQL,
  UPSERT_MUSIC_TRACK_SQL,
} from './queries';
import type {
  Album,
  AlbumRow,
  AppSettingRow,
  MusicSourceType,
  MusicTrack,
  MusicTrackRow,
  OrderMode,
  RepeatMode,
  SlideshowSettings,
  SlideshowSettingsRow,
} from './types';

const DB_NAME = 'cinematic-slideshow.db';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = openAndMigrate();
  }
  return dbPromise;
}

async function openAndMigrate(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const versionRow = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  const currentVersion = versionRow?.user_version ?? 0;

  for (const migration of getPendingMigrations(currentVersion)) {
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const statement of migration.statements) {
        await txn.execAsync(statement);
      }
      await txn.execAsync(`PRAGMA user_version = ${migration.version};`);
    });
  }

  return db;
}

export async function insertAlbum(deviceAlbumId: string, displayName: string): Promise<Album> {
  const db = await getDb();
  const result = await db.runAsync(INSERT_ALBUM_SQL, buildInsertAlbumParams(deviceAlbumId, displayName));
  const row = await db.getFirstAsync<AlbumRow>(SELECT_ALBUM_BY_ID_SQL, [result.lastInsertRowId]);
  if (!row) throw new Error('Failed to read back inserted album');
  return mapAlbumRow(row);
}

export async function getAlbumByDeviceId(deviceAlbumId: string): Promise<Album | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AlbumRow>(SELECT_ALBUM_BY_DEVICE_ID_SQL, [deviceAlbumId]);
  return row ? mapAlbumRow(row) : null;
}

export async function setAlbumReferenceValidity(albumId: number, isValid: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(UPDATE_ALBUM_REFERENCE_VALIDITY_SQL, [isValid ? 1 : 0, albumId]);
}

export async function getAllAlbums(): Promise<Album[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<AlbumRow>(SELECT_ALL_ALBUMS_SQL);
  return rows.map(mapAlbumRow);
}

/**
 * DB에 저장된 앨범들의 is_reference_valid를 현재 기기 앨범 목록 기준으로 갱신한다.
 * 호출 시점(앨범 목록 화면 진입 등)마다 device_album_id 존재 여부를 다시 확인하므로
 * 양방향으로 반영된다 — 사라졌던 폴더가 다시 나타나면 자동으로 valid 복귀.
 */
export async function reconcileAlbumReferenceValidity(
  currentDeviceAlbumIds: readonly string[]
): Promise<ReferenceValidityDiff> {
  const storedAlbums = await getAllAlbums();
  const diff = computeReferenceValidityDiff(storedAlbums, new Set(currentDeviceAlbumIds));

  for (const albumId of diff.toValid) {
    await setAlbumReferenceValidity(albumId, true);
  }
  for (const albumId of diff.toInvalid) {
    await setAlbumReferenceValidity(albumId, false);
  }

  return diff;
}

export async function deleteAlbum(albumId: number): Promise<void> {
  const db = await getDb();
  await db.runAsync(DELETE_ALBUM_SQL, [albumId]);
}

export async function insertMusicTrack(
  sourceType: MusicSourceType,
  sourceValue: string,
  title: string | null
): Promise<MusicTrack> {
  const db = await getDb();
  const result = await db.runAsync(
    INSERT_MUSIC_TRACK_SQL,
    buildInsertMusicTrackParams(sourceType, sourceValue, title)
  );
  const row = await db.getFirstAsync<MusicTrackRow>(SELECT_MUSIC_TRACK_BY_ID_SQL, [result.lastInsertRowId]);
  if (!row) throw new Error('Failed to read back inserted music track');
  return mapMusicTrackRow(row);
}

export async function getMusicTrackById(musicTrackId: number): Promise<MusicTrack | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<MusicTrackRow>(SELECT_MUSIC_TRACK_BY_ID_SQL, [musicTrackId]);
  return row ? mapMusicTrackRow(row) : null;
}

/**
 * (source_type, source_value)가 이미 있으면 title만 갱신하고 그 row를 반환한다.
 * 같은 번들/기기 음악을 여러 번 선택해도 UNIQUE (source_type, source_value) 제약에
 * 걸리지 않도록 하기 위함 — 설정 저장마다 매번 새로 INSERT하면 재선택 시 충돌한다.
 */
export async function upsertMusicTrack(
  sourceType: MusicSourceType,
  sourceValue: string,
  title: string | null
): Promise<MusicTrack> {
  const db = await getDb();
  await db.runAsync(UPSERT_MUSIC_TRACK_SQL, buildUpsertMusicTrackParams(sourceType, sourceValue, title));
  const row = await db.getFirstAsync<MusicTrackRow>(SELECT_MUSIC_TRACK_BY_SOURCE_SQL, [sourceType, sourceValue]);
  if (!row) throw new Error('Failed to read back upserted music track');
  return mapMusicTrackRow(row);
}

export async function upsertSlideshowSettings(
  albumId: number,
  transitionIntervalSec: number,
  orderMode: OrderMode,
  repeatMode: RepeatMode,
  musicTrackId: number | null
): Promise<SlideshowSettings> {
  const db = await getDb();
  const existing = await db.getFirstAsync<SlideshowSettingsRow>(SELECT_SETTINGS_BY_ALBUM_ID_SQL, [albumId]);
  if (existing) {
    await db.runAsync(UPDATE_SLIDESHOW_SETTINGS_SQL, [
      transitionIntervalSec,
      orderMode,
      repeatMode,
      musicTrackId,
      albumId,
    ]);
  } else {
    await db.runAsync(
      INSERT_SLIDESHOW_SETTINGS_SQL,
      buildInsertSlideshowSettingsParams(albumId, transitionIntervalSec, orderMode, repeatMode, musicTrackId)
    );
  }
  const row = await db.getFirstAsync<SlideshowSettingsRow>(SELECT_SETTINGS_BY_ALBUM_ID_SQL, [albumId]);
  if (!row) throw new Error('Failed to read back slideshow settings');
  return mapSlideshowSettingsRow(row);
}

export async function getSlideshowSettingsByAlbumId(albumId: number): Promise<SlideshowSettings | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<SlideshowSettingsRow>(SELECT_SETTINGS_BY_ALBUM_ID_SQL, [albumId]);
  return row ? mapSlideshowSettingsRow(row) : null;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(UPSERT_APP_SETTING_SQL, [key, value]);
}

export async function getAppSetting(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<AppSettingRow>(SELECT_APP_SETTING_SQL, [key]);
  return row ? row.value : null;
}
