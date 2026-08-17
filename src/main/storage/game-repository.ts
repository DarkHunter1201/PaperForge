import type { DatabaseSync } from 'node:sqlite';
import type { GameMode } from '../../shared/types';

export interface GameRow {
  id: string;
  user_id: string;
  name: string;
  mode: GameMode;
  reporting_currency: string;
  simulation_timestamp: string;
  encrypted_state: string;
  integrity_hash: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface SaveRow {
  id: string;
  game_id: string;
  user_id: string;
  name: string;
  simulation_timestamp: string;
  encrypted_state: string;
  integrity_hash: string;
  revision: number;
  created_at: string;
}

export class GameRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(row: GameRow): void {
    this.database
      .prepare(
        `INSERT INTO games
         (id, user_id, name, mode, reporting_currency, simulation_timestamp, encrypted_state,
          integrity_hash, revision, created_at, updated_at)
         VALUES (@id, @user_id, @name, @mode, @reporting_currency, @simulation_timestamp,
          @encrypted_state, @integrity_hash, @revision, @created_at, @updated_at)`,
      )
      .run({
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        mode: row.mode,
        reporting_currency: row.reporting_currency,
        simulation_timestamp: row.simulation_timestamp,
        encrypted_state: row.encrypted_state,
        integrity_hash: row.integrity_hash,
        revision: row.revision,
        created_at: row.created_at,
        updated_at: row.updated_at,
      });
  }

  update(row: GameRow): void {
    const result = this.database
      .prepare(
        `UPDATE games SET name = @name, mode = @mode, reporting_currency = @reporting_currency,
         simulation_timestamp = @simulation_timestamp, encrypted_state = @encrypted_state,
         integrity_hash = @integrity_hash, revision = @revision, updated_at = @updated_at
         WHERE id = @id AND user_id = @user_id`,
      )
      .run({
        id: row.id,
        user_id: row.user_id,
        name: row.name,
        mode: row.mode,
        reporting_currency: row.reporting_currency,
        simulation_timestamp: row.simulation_timestamp,
        encrypted_state: row.encrypted_state,
        integrity_hash: row.integrity_hash,
        revision: row.revision,
        updated_at: row.updated_at,
      });
    if (result.changes !== 1) throw new Error('Game update conflict');
  }

  find(id: string, userId: string): GameRow | undefined {
    return this.database
      .prepare('SELECT * FROM games WHERE id = ? AND user_id = ?')
      .get(id, userId) as GameRow | undefined;
  }

  list(userId: string): GameRow[] {
    return this.database
      .prepare('SELECT * FROM games WHERE user_id = ? ORDER BY updated_at DESC')
      .all(userId) as unknown as GameRow[];
  }

  remove(id: string, userId: string): boolean {
    return (
      this.database.prepare('DELETE FROM games WHERE id = ? AND user_id = ?').run(id, userId)
        .changes === 1
    );
  }

  createSave(row: SaveRow): void {
    this.database
      .prepare(
        `INSERT INTO saves
         (id, game_id, user_id, name, simulation_timestamp, encrypted_state, integrity_hash,
          revision, created_at)
         VALUES (@id, @game_id, @user_id, @name, @simulation_timestamp, @encrypted_state,
          @integrity_hash, @revision, @created_at)`,
      )
      .run(row as unknown as Record<string, string | number>);
  }

  findSave(id: string, userId: string): SaveRow | undefined {
    return this.database
      .prepare('SELECT * FROM saves WHERE id = ? AND user_id = ?')
      .get(id, userId) as SaveRow | undefined;
  }

  listSaves(gameId: string, userId: string): SaveRow[] {
    return this.database
      .prepare('SELECT * FROM saves WHERE game_id = ? AND user_id = ? ORDER BY created_at DESC')
      .all(gameId, userId) as unknown as SaveRow[];
  }

  removeSave(id: string, userId: string): boolean {
    return (
      this.database.prepare('DELETE FROM saves WHERE id = ? AND user_id = ?').run(id, userId)
        .changes === 1
    );
  }

  transaction<T>(operation: () => T): T {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
