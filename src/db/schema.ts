export const SCHEMA_VERSION = 1;

export const SCHEMA_STATEMENTS: readonly string[] = [
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
];
