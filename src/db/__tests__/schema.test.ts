import { DatabaseSync } from 'node:sqlite';

import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from '../schema';
import {
  buildInsertAlbumParams,
  buildInsertMusicTrackParams,
  buildInsertSlideshowSettingsParams,
  DELETE_ALBUM_SQL,
  DELETE_MUSIC_TRACK_SQL,
  INSERT_ALBUM_SQL,
  INSERT_MUSIC_TRACK_SQL,
  INSERT_SLIDESHOW_SETTINGS_SQL,
  mapAlbumRow,
  mapSlideshowSettingsRow,
  SELECT_ALBUM_BY_ID_SQL,
  SELECT_SETTINGS_BY_ALBUM_ID_SQL,
  UPDATE_ALBUM_REFERENCE_VALIDITY_SQL,
} from '../queries';
import type { AlbumRow, SlideshowSettingsRow } from '../types';

function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  for (const statement of SCHEMA_STATEMENTS) {
    db.exec(statement);
  }
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}

function insertAlbum(db: DatabaseSync, deviceAlbumId: string, displayName: string): AlbumRow {
  const stmt = db.prepare(INSERT_ALBUM_SQL);
  const result = stmt.run(...buildInsertAlbumParams(deviceAlbumId, displayName));
  return db.prepare(SELECT_ALBUM_BY_ID_SQL).get(result.lastInsertRowid) as unknown as AlbumRow;
}

describe('schema migration', () => {
  it('creates all four tables and sets user_version', () => {
    const db = createDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row: any) => row.name);
    expect(tables).toEqual(['albums', 'app_settings', 'music_tracks', 'slideshow_settings']);

    const version = db.prepare('PRAGMA user_version').get() as any;
    expect(version.user_version).toBe(SCHEMA_VERSION);
  });

  it('is idempotent (CREATE TABLE IF NOT EXISTS)', () => {
    const db = createDb();
    expect(() => {
      for (const statement of SCHEMA_STATEMENTS) db.exec(statement);
    }).not.toThrow();
  });
});

describe('albums', () => {
  it('inserts and reads back an album with default reference validity', () => {
    const db = createDb();
    const row = insertAlbum(db, 'device-album-1', 'Camera');
    const album = mapAlbumRow(row);

    expect(album.deviceAlbumId).toBe('device-album-1');
    expect(album.displayName).toBe('Camera');
    expect(album.isReferenceValid).toBe(true);
  });

  it('rejects duplicate device_album_id', () => {
    const db = createDb();
    insertAlbum(db, 'device-album-1', 'Camera');

    expect(() => insertAlbum(db, 'device-album-1', 'Camera (dup)')).toThrow(/UNIQUE/);
  });

  it('can mark a reference invalid and back to valid', () => {
    const db = createDb();
    const row = insertAlbum(db, 'device-album-1', 'Camera');

    db.prepare(UPDATE_ALBUM_REFERENCE_VALIDITY_SQL).run(0, row.id);
    let updated = db.prepare(SELECT_ALBUM_BY_ID_SQL).get(row.id) as unknown as AlbumRow;
    expect(mapAlbumRow(updated).isReferenceValid).toBe(false);

    db.prepare(UPDATE_ALBUM_REFERENCE_VALIDITY_SQL).run(1, row.id);
    updated = db.prepare(SELECT_ALBUM_BY_ID_SQL).get(row.id) as unknown as AlbumRow;
    expect(mapAlbumRow(updated).isReferenceValid).toBe(true);
  });
});

describe('slideshow_settings', () => {
  it('inserts settings referencing an existing album', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');

    const stmt = db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL);
    stmt.run(...buildInsertSlideshowSettingsParams(album.id, 5, 'random', 'once', null));

    const settingsRow = db
      .prepare(SELECT_SETTINGS_BY_ALBUM_ID_SQL)
      .get(album.id) as unknown as SlideshowSettingsRow;
    const settings = mapSlideshowSettingsRow(settingsRow);

    expect(settings.transitionIntervalSec).toBe(5);
    expect(settings.orderMode).toBe('random');
    expect(settings.repeatMode).toBe('once');
    expect(settings.musicTrackId).toBeNull();
  });

  it('rejects settings for a non-existent album (foreign key)', () => {
    const db = createDb();
    const stmt = db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL);

    expect(() => stmt.run(...buildInsertSlideshowSettingsParams(9999, 4, 'sequential', 'loop', null))).toThrow(
      /FOREIGN KEY/
    );
  });

  it('rejects a second settings row for the same album (1:1)', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const stmt = db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL);
    stmt.run(...buildInsertSlideshowSettingsParams(album.id, 4, 'sequential', 'loop', null));

    expect(() => stmt.run(...buildInsertSlideshowSettingsParams(album.id, 4, 'sequential', 'loop', null))).toThrow(
      /UNIQUE/
    );
  });

  it('rejects an invalid order_mode value', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const stmt = db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL);

    expect(() =>
      stmt.run(album.id, 4, 'shuffle-ish', 'loop', null)
    ).toThrow(/CHECK/);
  });

  it('deletes settings when the parent album is deleted (cascade)', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL).run(
      ...buildInsertSlideshowSettingsParams(album.id, 4, 'sequential', 'loop', null)
    );

    db.prepare(DELETE_ALBUM_SQL).run(album.id);

    const remaining = db.prepare(SELECT_SETTINGS_BY_ALBUM_ID_SQL).get(album.id);
    expect(remaining).toBeUndefined();
  });

  it('sets music_track_id to NULL when the linked track is deleted', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const trackResult = db
      .prepare(INSERT_MUSIC_TRACK_SQL)
      .run(...buildInsertMusicTrackParams('bundled', 'calm', 'Calm Piano'));
    db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL).run(
      ...buildInsertSlideshowSettingsParams(album.id, 4, 'sequential', 'loop', trackResult.lastInsertRowid as number)
    );

    db.prepare(DELETE_MUSIC_TRACK_SQL).run(trackResult.lastInsertRowid);

    const settingsRow = db
      .prepare(SELECT_SETTINGS_BY_ALBUM_ID_SQL)
      .get(album.id) as unknown as SlideshowSettingsRow;
    expect(settingsRow.music_track_id).toBeNull();
  });
});

describe('music_tracks', () => {
  it('rejects an invalid source_type', () => {
    const db = createDb();
    const stmt = db.prepare(INSERT_MUSIC_TRACK_SQL);
    expect(() => stmt.run('cloud', 'some-uri', null)).toThrow(/CHECK/);
  });

  it('rejects duplicate (source_type, source_value) pairs', () => {
    const db = createDb();
    const stmt = db.prepare(INSERT_MUSIC_TRACK_SQL);
    stmt.run(...buildInsertMusicTrackParams('bundled', 'calm', 'Calm Piano'));
    expect(() => stmt.run(...buildInsertMusicTrackParams('bundled', 'calm', 'Calm Piano (dup)'))).toThrow(
      /UNIQUE/
    );
  });
});

describe('app_settings', () => {
  it('upserts a key/value pair', () => {
    const db = createDb();
    const upsert = db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value`
    );
    upsert.run('permission_rationale_seen', 'true');
    upsert.run('permission_rationale_seen', 'false');

    const row = db.prepare('SELECT * FROM app_settings WHERE key = ?').get('permission_rationale_seen') as any;
    expect(row.value).toBe('false');
  });
});
