import type { DatabaseSync } from 'node:sqlite';

export interface UserRow {
  id: string;
  username: string;
  normalized_username: string;
  password_hash: string;
  key_salt: string;
  wrapped_data_key: string;
  created_at: string;
}

export class UserRepository {
  constructor(private readonly database: DatabaseSync) {}

  create(row: UserRow): void {
    this.database
      .prepare(
        `INSERT INTO users
         (id, username, normalized_username, password_hash, key_salt, wrapped_data_key, created_at)
         VALUES (@id, @username, @normalized_username, @password_hash, @key_salt, @wrapped_data_key, @created_at)`,
      )
      .run(row as unknown as Record<string, string | number>);
  }

  findByNormalizedUsername(normalizedUsername: string): UserRow | undefined {
    return this.database
      .prepare('SELECT * FROM users WHERE normalized_username = ?')
      .get(normalizedUsername) as UserRow | undefined;
  }

  findById(id: string): UserRow | undefined {
    return this.database.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  }

  deleteById(id: string): boolean {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const deleted = this.database.prepare('DELETE FROM users WHERE id = ?').run(id).changes === 1;
      this.database.exec('COMMIT');
      if (deleted) {
        this.database.exec('PRAGMA wal_checkpoint(TRUNCATE)');
        this.database.exec('VACUUM');
      }
      return deleted;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
