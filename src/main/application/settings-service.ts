import type { CryptoService } from '../security/crypto-service';
import type { SessionManager } from '../security/session-manager';
import type { SettingsRepository } from '../storage/settings-repository';

export class SettingsService {
  constructor(
    private readonly settings: SettingsRepository,
    private readonly crypto: CryptoService,
    private readonly sessions: SessionManager,
  ) {}

  setSecret(key: string, value: string): void {
    const session = this.sessions.require();
    const associatedData = `setting:${key}:user:${session.userId}`;
    const encrypted = this.crypto.encryptJson({ value }, session.dataKey, associatedData);
    this.settings.set(
      session.userId,
      key,
      encrypted,
      this.crypto.integrity(encrypted, session.dataKey, associatedData),
    );
  }

  getSecret(key: string): string | null {
    const session = this.sessions.require();
    const row = this.settings.get(session.userId, key);
    if (!row) return null;
    const associatedData = `setting:${key}:user:${session.userId}`;
    this.crypto.verifyIntegrity(
      row.encrypted_value,
      row.integrity_hash,
      session.dataKey,
      associatedData,
    );
    return this.crypto.decryptJson<{ value: string }>(
      row.encrypted_value,
      session.dataKey,
      associatedData,
    ).value;
  }

  hasSecret(key: string): boolean {
    const session = this.sessions.get();
    return Boolean(session && this.settings.get(session.userId, key));
  }
}
