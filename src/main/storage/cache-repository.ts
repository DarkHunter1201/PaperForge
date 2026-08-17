import type { DatabaseSync } from 'node:sqlite';

interface CacheRow {
  payload: string;
  expires_at: string;
}

export class CacheRepository {
  constructor(private readonly database: DatabaseSync) {}

  get<T>(key: string, now = new Date()): T | null {
    const row = this.database
      .prepare('SELECT payload, expires_at FROM market_cache WHERE cache_key = ?')
      .get(key) as CacheRow | undefined;
    if (!row || new Date(row.expires_at).getTime() <= now.getTime()) return null;
    return JSON.parse(row.payload) as T;
  }

  set(key: string, provider: string, value: unknown, ttlMilliseconds: number): void {
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + ttlMilliseconds);
    this.database
      .prepare(
        `INSERT INTO market_cache (cache_key, provider, payload, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(cache_key) DO UPDATE SET provider = excluded.provider,
         payload = excluded.payload, expires_at = excluded.expires_at, created_at = excluded.created_at`,
      )
      .run(key, provider, JSON.stringify(value), expiresAt.toISOString(), createdAt.toISOString());
  }

  purgeExpired(now = new Date()): number {
    return Number(
      this.database.prepare('DELETE FROM market_cache WHERE expires_at <= ?').run(now.toISOString())
        .changes,
    );
  }
}
