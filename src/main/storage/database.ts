import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { DataPaths } from '../infrastructure/data-paths';

export class PaperForgeDatabase {
  readonly connection: DatabaseSync;

  constructor(paths: DataPaths, filename = 'paperforge.db') {
    this.connection = new DatabaseSync(join(paths.database, filename));
    this.connection.exec('PRAGMA journal_mode = WAL');
    this.connection.exec('PRAGMA foreign_keys = ON');
    this.connection.exec('PRAGMA synchronous = FULL');
    this.connection.exec('PRAGMA secure_delete = ON');
    this.migrate();
  }

  close(): void {
    this.connection.close();
  }

  private migrate(): void {
    this.connection.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        normalized_username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        key_salt TEXT NOT NULL,
        wrapped_data_key TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('LIVE', 'HISTORICAL')),
        reporting_currency TEXT NOT NULL,
        simulation_timestamp TEXT NOT NULL,
        encrypted_state TEXT NOT NULL,
        integrity_hash TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS games_user_updated ON games(user_id, updated_at DESC);
      CREATE TABLE IF NOT EXISTS saves (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        simulation_timestamp TEXT NOT NULL,
        encrypted_state TEXT NOT NULL,
        integrity_hash TEXT NOT NULL,
        revision INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS saves_game_created ON saves(game_id, created_at DESC);
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        instrument_id TEXT NOT NULL,
        symbol TEXT NOT NULL,
        asset_class TEXT NOT NULL,
        exchange_id TEXT NOT NULL,
        side TEXT NOT NULL,
        simulation_timestamp TEXT NOT NULL,
        encrypted_payload TEXT NOT NULL,
        integrity_hash TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS trades_game_time ON trades(game_id, simulation_timestamp DESC);
      CREATE TABLE IF NOT EXISTS settings (
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        setting_key TEXT NOT NULL,
        encrypted_value TEXT NOT NULL,
        integrity_hash TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(user_id, setting_key)
      );
      CREATE TABLE IF NOT EXISTS market_cache (
        cache_key TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        payload TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS market_cache_expiry ON market_cache(expires_at);
    `);
  }
}
