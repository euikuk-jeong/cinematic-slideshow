import { DatabaseSync } from 'node:sqlite';

import { getPendingMigrations, MIGRATIONS, SCHEMA_STATEMENTS, SCHEMA_VERSION, type Migration } from '../schema';
import {
  buildInsertAlbumParams,
  buildInsertMusicTrackParams,
  buildInsertSlideshowSettingsParams,
  buildUpsertMusicTrackParams,
  DELETE_ALBUM_SQL,
  DELETE_MUSIC_TRACK_SQL,
  INSERT_ALBUM_SQL,
  INSERT_MUSIC_TRACK_SQL,
  INSERT_SLIDESHOW_SETTINGS_SQL,
  mapAlbumRow,
  mapSlideshowSettingsRow,
  SELECT_ALBUM_BY_ID_SQL,
  SELECT_MUSIC_TRACK_BY_SOURCE_SQL,
  SELECT_SETTINGS_BY_ALBUM_ID_SQL,
  UPDATE_ALBUM_DISPLAY_NAME_SQL,
  UPDATE_ALBUM_REFERENCE_VALIDITY_SQL,
  UPSERT_MUSIC_TRACK_SQL,
} from '../queries';
import type { AlbumRow, MusicTrackRow, SlideshowSettingsRow } from '../types';

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

describe('getPendingMigrations', () => {
  const synthetic: readonly Migration[] = [
    { version: 1, statements: ['CREATE TABLE a (id INTEGER)'] },
    { version: 2, statements: ['ALTER TABLE a ADD COLUMN name TEXT'] },
    { version: 3, statements: ['ALTER TABLE a ADD COLUMN note TEXT'] },
  ];

  it('returns all migrations for a fresh db (version 0)', () => {
    expect(getPendingMigrations(0, synthetic).map((m) => m.version)).toEqual([1, 2, 3]);
  });

  it('returns only migrations newer than the current version', () => {
    expect(getPendingMigrations(1, synthetic).map((m) => m.version)).toEqual([2, 3]);
  });

  it('returns empty when already at the latest version', () => {
    expect(getPendingMigrations(3, synthetic)).toEqual([]);
  });

  it('is stable against out-of-order migration definitions', () => {
    const outOfOrder = [synthetic[2], synthetic[0], synthetic[1]];
    expect(getPendingMigrations(0, outOfOrder).map((m) => m.version)).toEqual([1, 2, 3]);
  });

  it('SCHEMA_VERSION matches the highest MIGRATIONS version', () => {
    expect(SCHEMA_VERSION).toBe(Math.max(...MIGRATIONS.map((m) => m.version)));
  });
});

describe('stepwise migration application (simulates client.ts openAndMigrate)', () => {
  const synthetic: readonly Migration[] = [
    { version: 1, statements: ['CREATE TABLE a (id INTEGER PRIMARY KEY, name TEXT NOT NULL)'] },
    { version: 2, statements: ['ALTER TABLE a ADD COLUMN note TEXT'] },
  ];

  function applyPending(db: DatabaseSync, currentVersion: number): void {
    for (const migration of getPendingMigrations(currentVersion, synthetic)) {
      for (const statement of migration.statements) db.exec(statement);
      db.exec(`PRAGMA user_version = ${migration.version}`);
    }
  }

  it('brings a fresh db straight to the latest version', () => {
    const db = new DatabaseSync(':memory:');
    applyPending(db, 0);

    const version = db.prepare('PRAGMA user_version').get() as any;
    expect(version.user_version).toBe(2);

    const columns = (db.prepare('PRAGMA table_info(a)').all() as any[]).map((c) => c.name);
    expect(columns).toEqual(['id', 'name', 'note']);
  });

  it('applies only the missing migration to a db already at version 1, preserving existing data', () => {
    const db = new DatabaseSync(':memory:');
    db.exec(synthetic[0].statements[0]);
    db.exec('PRAGMA user_version = 1');
    db.prepare('INSERT INTO a (id, name) VALUES (?, ?)').run(1, 'existing-row');

    applyPending(db, 1);

    const row = db.prepare('SELECT * FROM a WHERE id = 1').get() as any;
    expect(row.name).toBe('existing-row');
    expect(row.note).toBeNull();

    const version = db.prepare('PRAGMA user_version').get() as any;
    expect(version.user_version).toBe(2);
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

  it('can update display_name', () => {
    const db = createDb();
    const row = insertAlbum(db, 'device-album-1', 'Camera');

    db.prepare(UPDATE_ALBUM_DISPLAY_NAME_SQL).run('Camera (renamed)', row.id);

    const updated = db.prepare(SELECT_ALBUM_BY_ID_SQL).get(row.id) as unknown as AlbumRow;
    expect(mapAlbumRow(updated).displayName).toBe('Camera (renamed)');
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

  it('upserting the same (source_type, source_value) twice reuses the row instead of throwing', () => {
    const db = createDb();
    const stmt = db.prepare(UPSERT_MUSIC_TRACK_SQL);
    stmt.run(...buildUpsertMusicTrackParams('bundled', 'calm', 'Calm Piano'));
    stmt.run(...buildUpsertMusicTrackParams('bundled', 'calm', 'Calm Piano (renamed)'));

    const rows = db
      .prepare('SELECT * FROM music_tracks WHERE source_type = ? AND source_value = ?')
      .all('bundled', 'calm') as unknown as MusicTrackRow[];
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe('Calm Piano (renamed)');

    const row = db
      .prepare(SELECT_MUSIC_TRACK_BY_SOURCE_SQL)
      .get('bundled', 'calm') as unknown as MusicTrackRow;
    expect(row.title).toBe('Calm Piano (renamed)');
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
