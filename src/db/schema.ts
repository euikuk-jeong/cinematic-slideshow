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
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

// 하위 호환: 기존 테스트/코드에서 "전체 스키마를 한 번에 적용"할 때 사용(신규 설치 경로).
export const SCHEMA_STATEMENTS: readonly string[] = MIGRATIONS.flatMap((m) => m.statements);

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
