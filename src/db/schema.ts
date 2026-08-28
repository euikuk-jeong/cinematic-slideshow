export interface Migration {
  readonly version: number;
  readonly statements: readonly string[];
}

// v1: 최초 스키마(베이스라인). 이후 스키마 변경은 새 버전 항목을 이 배열 끝에 추가한다
// (예: { version: 2, statements: ['ALTER TABLE albums ADD COLUMN ...'] }).
// 기존 버전의 statements는 배포 후 절대 수정하지 않는다 — 이미 그 버전을 거친 기기의
// migration 이력과 어긋나게 된다.
export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS albums (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        device_album_id TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL,
        is_reference_valid INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS music_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_type TEXT NOT NULL CHECK (source_type IN ('device', 'bundled')),
        source_value TEXT NOT NULL,
        title TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (source_type, source_value)
      )`,
      `CREATE TABLE IF NOT EXISTS slideshow_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_id INTEGER NOT NULL UNIQUE REFERENCES albums (id) ON DELETE CASCADE,
        transition_interval_sec REAL NOT NULL DEFAULT 4,
        order_mode TEXT NOT NULL DEFAULT 'sequential' CHECK (order_mode IN ('sequential', 'random')),
        repeat_mode TEXT NOT NULL DEFAULT 'loop' CHECK (repeat_mode IN ('once', 'loop')),
        music_track_id INTEGER REFERENCES music_tracks (id) ON DELETE SET NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
    ],
  },
  {
    // 배경음악 다중 선택+순서 지정: slideshow_settings.music_track_id 단일 FK를
    // slideshow_music_tracks(join table, order_index)로 대체. 구버전 SQLite에서도
    // 동작하도록 ALTER TABLE ... DROP COLUMN 대신 rename-recreate 방식을 쓴다.
    // 순서 고정: slideshow_settings를 먼저 rename해야 한다 — SQLite 3.25+는
    // RENAME TO 시 다른 테이블의 REFERENCES를 새 이름으로 따라가게 재작성하므로,
    // join 테이블을 먼저 만들면 rename 이후 끊어진 참조를 갖게 된다.
    version: 2,
    statements: [
      `ALTER TABLE slideshow_settings RENAME TO slideshow_settings_old`,
      `CREATE TABLE slideshow_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        album_id INTEGER NOT NULL UNIQUE REFERENCES albums (id) ON DELETE CASCADE,
        transition_interval_sec REAL NOT NULL DEFAULT 4,
        order_mode TEXT NOT NULL DEFAULT 'sequential' CHECK (order_mode IN ('sequential', 'random')),
        repeat_mode TEXT NOT NULL DEFAULT 'loop' CHECK (repeat_mode IN ('once', 'loop')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `INSERT INTO slideshow_settings (id, album_id, transition_interval_sec, order_mode, repeat_mode, updated_at)
       SELECT id, album_id, transition_interval_sec, order_mode, repeat_mode, updated_at FROM slideshow_settings_old`,
      `CREATE TABLE slideshow_music_tracks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slideshow_settings_id INTEGER NOT NULL REFERENCES slideshow_settings (id) ON DELETE CASCADE,
        music_track_id INTEGER NOT NULL REFERENCES music_tracks (id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        UNIQUE (slideshow_settings_id, order_index),
        UNIQUE (slideshow_settings_id, music_track_id)
      )`,
      `INSERT INTO slideshow_music_tracks (slideshow_settings_id, music_track_id, order_index)
       SELECT id, music_track_id, 0 FROM slideshow_settings_old WHERE music_track_id IS NOT NULL`,
      `DROP TABLE slideshow_settings_old`,
    ],
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * currentVersion 이후에 적용해야 할 migration들을 버전 오름차순으로 반환한다(순수).
 * migrations 인자는 테스트에서 실제 MIGRATIONS와 무관하게 동작을 검증하기 위한 주입 지점.
 */
export function getPendingMigrations(
  currentVersion: number,
  migrations: readonly Migration[] = MIGRATIONS
): readonly Migration[] {
  return migrations.filter((m) => m.version > currentVersion).sort((a, b) => a.version - b.version);
}
