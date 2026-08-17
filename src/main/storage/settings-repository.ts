import type { DatabaseSync } from 'node:sqlite';

interface SettingRow {
  encrypted_value: string;
  integrity_hash: string;
}

export class SettingsRepository {
  constructor(private readonly database: DatabaseSync) {}

  get(userId: string, key: string): SettingRow | undefined {
    return this.database
      .prepare(
        'SELECT encrypted_value, integrity_hash FROM settings WHERE user_id = ? AND setting_key = ?',
      )
      .get(userId, key) as SettingRow | undefined;
  }

  set(userId: string, key: string, encryptedValue: string, integrityHash: string): void {
    this.database
      .prepare(
        `INSERT INTO settings (user_id, setting_key, encrypted_value, integrity_hash, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, setting_key) DO UPDATE SET encrypted_value = excluded.encrypted_value,
         integrity_hash = excluded.integrity_hash, updated_at = excluded.updated_at`,
      )
      .run(userId, key, encryptedValue, integrityHash, new Date().toISOString());
  }
}
