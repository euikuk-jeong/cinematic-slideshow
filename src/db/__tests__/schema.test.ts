import { DatabaseSync } from 'node:sqlite';

import { getPendingMigrations, MIGRATIONS, SCHEMA_VERSION, type Migration } from '../schema';
import {
  buildInsertAlbumParams,
  buildInsertMusicTrackParams,
  buildInsertSlideshowMusicTrackParams,
  buildInsertSlideshowSettingsParams,
  buildUpsertMusicTrackParams,
  DELETE_ALBUM_SQL,
  DELETE_MUSIC_TRACK_SQL,
  INSERT_ALBUM_SQL,
  INSERT_MUSIC_TRACK_SQL,
  INSERT_SLIDESHOW_MUSIC_TRACK_SQL,
  INSERT_SLIDESHOW_SETTINGS_SQL,
  mapAlbumRow,
  mapSlideshowSettingsRow,
  SELECT_ALBUM_BY_ID_SQL,
  SELECT_MUSIC_TRACK_BY_SOURCE_SQL,
  SELECT_MUSIC_TRACKS_BY_SETTINGS_ID_SQL,
  SELECT_SETTINGS_BY_ALBUM_ID_SQL,
  UPDATE_ALBUM_DISPLAY_NAME_SQL,
  UPDATE_ALBUM_REFERENCE_VALIDITY_SQL,
  UPSERT_MUSIC_TRACK_SQL,
} from '../queries';
import type { AlbumRow, MusicTrackRow, SlideshowSettingsRow } from '../types';

function applyMigrations(db: DatabaseSync, migrations: readonly Migration[] = MIGRATIONS): void {
  for (const migration of getPendingMigrations(0, migrations)) {
    for (const statement of migration.statements) db.exec(statement);
    db.exec(`PRAGMA user_version = ${migration.version}`);
  }
}

function createDb(): DatabaseSync {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  applyMigrations(db);
  return db;
}

function insertAlbum(db: DatabaseSync, deviceAlbumId: string, displayName: string): AlbumRow {
  const stmt = db.prepare(INSERT_ALBUM_SQL);
  const result = stmt.run(...buildInsertAlbumParams(deviceAlbumId, displayName));
  return db.prepare(SELECT_ALBUM_BY_ID_SQL).get(result.lastInsertRowid) as unknown as AlbumRow;
}

describe('schema migration', () => {
  it('creates all five tables and sets user_version', () => {
    const db = createDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row: any) => row.name);
    expect(tables).toEqual(['albums', 'app_settings', 'music_tracks', 'slideshow_music_tracks', 'slideshow_settings']);

    const version = db.prepare('PRAGMA user_version').get() as any;
    expect(version.user_version).toBe(SCHEMA_VERSION);
  });

  it('a fresh db at SCHEMA_VERSION has no pending migrations left', () => {
    expect(getPendingMigrations(SCHEMA_VERSION)).toEqual([]);
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
    stmt.run(...buildInsertSlideshowSettingsParams(album.id, 5, 'random', 'once'));

    const settingsRow = db
      .prepare(SELECT_SETTINGS_BY_ALBUM_ID_SQL)
      .get(album.id) as unknown as SlideshowSettingsRow;
    const settings = mapSlideshowSettingsRow(settingsRow);

    expect(settings.transitionIntervalSec).toBe(5);
    expect(settings.orderMode).toBe('random');
    expect(settings.repeatMode).toBe('once');
  });

  it('rejects settings for a non-existent album (foreign key)', () => {
    const db = createDb();
    const stmt = db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL);

    expect(() => stmt.run(...buildInsertSlideshowSettingsParams(9999, 4, 'sequential', 'loop'))).toThrow(
      /FOREIGN KEY/
    );
  });

  it('rejects a second settings row for the same album (1:1)', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const stmt = db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL);
    stmt.run(...buildInsertSlideshowSettingsParams(album.id, 4, 'sequential', 'loop'));

    expect(() => stmt.run(...buildInsertSlideshowSettingsParams(album.id, 4, 'sequential', 'loop'))).toThrow(
      /UNIQUE/
    );
  });

  it('rejects an invalid order_mode value', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const stmt = db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL);

    expect(() => stmt.run(album.id, 4, 'shuffle-ish', 'loop')).toThrow(/CHECK/);
  });

  it('deletes settings when the parent album is deleted (cascade)', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL).run(...buildInsertSlideshowSettingsParams(album.id, 4, 'sequential', 'loop'));

    db.prepare(DELETE_ALBUM_SQL).run(album.id);

    const remaining = db.prepare(SELECT_SETTINGS_BY_ALBUM_ID_SQL).get(album.id);
    expect(remaining).toBeUndefined();
  });
});

describe('slideshow_music_tracks', () => {
  function insertSettings(db: DatabaseSync, albumId: number): SlideshowSettingsRow {
    db.prepare(INSERT_SLIDESHOW_SETTINGS_SQL).run(...buildInsertSlideshowSettingsParams(albumId, 4, 'sequential', 'loop'));
    return db.prepare(SELECT_SETTINGS_BY_ALBUM_ID_SQL).get(albumId) as unknown as SlideshowSettingsRow;
  }

  function insertTrack(db: DatabaseSync, sourceValue: string): number {
    const result = db.prepare(INSERT_MUSIC_TRACK_SQL).run(...buildInsertMusicTrackParams('bundled', sourceValue, sourceValue));
    return result.lastInsertRowid as number;
  }

  it('reads back a playlist ordered by order_index', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const settings = insertSettings(db, album.id);
    const trackA = insertTrack(db, 'calm');
    const trackB = insertTrack(db, 'upbeat');

    db.prepare(INSERT_SLIDESHOW_MUSIC_TRACK_SQL).run(...buildInsertSlideshowMusicTrackParams(settings.id, trackB, 0));
    db.prepare(INSERT_SLIDESHOW_MUSIC_TRACK_SQL).run(...buildInsertSlideshowMusicTrackParams(settings.id, trackA, 1));

    const rows = db.prepare(SELECT_MUSIC_TRACKS_BY_SETTINGS_ID_SQL).all(settings.id) as unknown as MusicTrackRow[];
    expect(rows.map((r) => r.source_value)).toEqual(['upbeat', 'calm']);
  });

  it('rejects two entries at the same order_index for one settings row', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const settings = insertSettings(db, album.id);
    const trackA = insertTrack(db, 'calm');
    const trackB = insertTrack(db, 'upbeat');
    db.prepare(INSERT_SLIDESHOW_MUSIC_TRACK_SQL).run(...buildInsertSlideshowMusicTrackParams(settings.id, trackA, 0));

    expect(() =>
      db.prepare(INSERT_SLIDESHOW_MUSIC_TRACK_SQL).run(...buildInsertSlideshowMusicTrackParams(settings.id, trackB, 0))
    ).toThrow(/UNIQUE/);
  });

  it('rejects adding the same track twice to one settings row', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const settings = insertSettings(db, album.id);
    const track = insertTrack(db, 'calm');
    db.prepare(INSERT_SLIDESHOW_MUSIC_TRACK_SQL).run(...buildInsertSlideshowMusicTrackParams(settings.id, track, 0));

    expect(() =>
      db.prepare(INSERT_SLIDESHOW_MUSIC_TRACK_SQL).run(...buildInsertSlideshowMusicTrackParams(settings.id, track, 1))
    ).toThrow(/UNIQUE/);
  });

  it('removes a track from every playlist when the track is deleted (cascade), leaving the rest', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const settings = insertSettings(db, album.id);
    const trackA = insertTrack(db, 'calm');
    const trackB = insertTrack(db, 'upbeat');
    db.prepare(INSERT_SLIDESHOW_MUSIC_TRACK_SQL).run(...buildInsertSlideshowMusicTrackParams(settings.id, trackA, 0));
    db.prepare(INSERT_SLIDESHOW_MUSIC_TRACK_SQL).run(...buildInsertSlideshowMusicTrackParams(settings.id, trackB, 1));

    db.prepare(DELETE_MUSIC_TRACK_SQL).run(trackA);

    const rows = db.prepare(SELECT_MUSIC_TRACKS_BY_SETTINGS_ID_SQL).all(settings.id) as unknown as MusicTrackRow[];
    expect(rows.map((r) => r.source_value)).toEqual(['upbeat']);
  });

  it('cascades through slideshow_settings when the album is deleted', () => {
    const db = createDb();
    const album = insertAlbum(db, 'device-album-1', 'Camera');
    const settings = insertSettings(db, album.id);
    const track = insertTrack(db, 'calm');
    db.prepare(INSERT_SLIDESHOW_MUSIC_TRACK_SQL).run(...buildInsertSlideshowMusicTrackParams(settings.id, track, 0));

    db.prepare(DELETE_ALBUM_SQL).run(album.id);

    const rows = db.prepare('SELECT * FROM slideshow_music_tracks WHERE slideshow_settings_id = ?').all(settings.id);
    expect(rows).toHaveLength(0);
  });
});

describe('v2 migration (music_track_id 단일 FK → slideshow_music_tracks join table)', () => {
  it('업그레이드 시 기존 music_track_id를 order_index 0인 재생목록 항목으로 이관하고, 나머지 컬럼과 id를 보존한다', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    applyMigrations(db, MIGRATIONS.filter((m) => m.version === 1));

    const albumResult = db.prepare(INSERT_ALBUM_SQL).run(...buildInsertAlbumParams('device-album-1', 'Camera'));
    const albumId = albumResult.lastInsertRowid as number;
    const trackResult = db
      .prepare(INSERT_MUSIC_TRACK_SQL)
      .run(...buildInsertMusicTrackParams('bundled', 'calm', 'Calm Piano'));
    const trackId = trackResult.lastInsertRowid as number;
    const settingsResult = db
      .prepare(
        `INSERT INTO slideshow_settings (album_id, transition_interval_sec, order_mode, repeat_mode, music_track_id)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(albumId, 6, 'random', 'once', trackId);
    const settingsId = settingsResult.lastInsertRowid as number;

    applyMigrations(db, getPendingMigrations(1));

    const version = db.prepare('PRAGMA user_version').get() as any;
    expect(version.user_version).toBe(SCHEMA_VERSION);

    const settingsRow = db.prepare(SELECT_SETTINGS_BY_ALBUM_ID_SQL).get(albumId) as unknown as SlideshowSettingsRow;
    expect(settingsRow.id).toBe(settingsId);
    expect(settingsRow.transition_interval_sec).toBe(6);
    expect(settingsRow.order_mode).toBe('random');
    expect(settingsRow.repeat_mode).toBe('once');
    expect((settingsRow as any).music_track_id).toBeUndefined();

    const playlist = db.prepare(SELECT_MUSIC_TRACKS_BY_SETTINGS_ID_SQL).all(settingsId) as unknown as MusicTrackRow[];
    expect(playlist).toHaveLength(1);
    expect(playlist[0].id).toBe(trackId);

    const joinRow = db
      .prepare('SELECT order_index FROM slideshow_music_tracks WHERE slideshow_settings_id = ?')
      .get(settingsId) as any;
    expect(joinRow.order_index).toBe(0);
  });

  it('음악이 없던 설정은 이관 후에도 빈 재생목록을 유지한다', () => {
    const db = new DatabaseSync(':memory:');
    db.exec('PRAGMA foreign_keys = ON');
    applyMigrations(db, MIGRATIONS.filter((m) => m.version === 1));

    const albumResult = db.prepare(INSERT_ALBUM_SQL).run(...buildInsertAlbumParams('device-album-1', 'Camera'));
    const albumId = albumResult.lastInsertRowid as number;
    db.prepare(
      `INSERT INTO slideshow_settings (album_id, transition_interval_sec, order_mode, repeat_mode, music_track_id)
       VALUES (?, ?, ?, ?, ?)`
    ).run(albumId, 4, 'sequential', 'loop', null);

    applyMigrations(db, getPendingMigrations(1));

    const settingsRow = db.prepare(SELECT_SETTINGS_BY_ALBUM_ID_SQL).get(albumId) as unknown as SlideshowSettingsRow;
    const playlist = db.prepare(SELECT_MUSIC_TRACKS_BY_SETTINGS_ID_SQL).all(settingsRow.id);
    expect(playlist).toEqual([]);
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
