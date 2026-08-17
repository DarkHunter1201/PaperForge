import { randomUUID } from 'node:crypto';
import type { SessionInfo } from '../../shared/types';
import { AuthenticationError, DomainError, ValidationError } from '../domain/errors';
import type { AppLogger } from '../infrastructure/logger';
import type { CryptoService } from '../security/crypto-service';
import type { SessionManager } from '../security/session-manager';
import type { UserRepository } from '../storage/user-repository';

function normalizeUsername(username: string): string {
  return username.trim().normalize('NFKC').toLocaleLowerCase('en-US');
}

function validateUsername(username: string): void {
  const normalized = normalizeUsername(username);
  if (!normalized) throw new ValidationError('Имя пользователя не может быть пустым');
  if (normalized.length > 128) throw new ValidationError('Имя пользователя слишком длинное');
}

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly crypto: CryptoService,
    private readonly sessions: SessionManager,
    private readonly logger: AppLogger,
  ) {}

  async register(username: string, password: string): Promise<SessionInfo> {
    validateUsername(username);
    const normalizedUsername = normalizeUsername(username);
    if (this.users.findByNormalizedUsername(normalizedUsername)) {
      throw new DomainError('Это имя пользователя уже занято', 'USERNAME_EXISTS');
    }
    const id = randomUUID();
    const passwordHash = await this.crypto.hashPassword(password);
    const keySalt = this.crypto.createSalt();
    const wrappingKey = await this.crypto.deriveWrappingKey(password, keySalt);
    const dataKey = this.crypto.createDataKey();
    try {
      this.users.create({
        id,
        username: username.trim().normalize('NFKC'),
        normalized_username: normalizedUsername,
        password_hash: passwordHash,
        key_salt: keySalt.toString('base64'),
        wrapped_data_key: this.crypto.wrapKey(dataKey, wrappingKey, id),
        created_at: new Date().toISOString(),
      });
      this.logger.info('user_registered', { userId: id });
      return this.sessions.open({ userId: id, username: username.trim(), dataKey });
    } catch (error) {
      dataKey.fill(0);
      if (error instanceof Error && error.message.includes('UNIQUE')) {
        throw new DomainError('Это имя пользователя уже занято', 'USERNAME_EXISTS');
      }
      throw error;
    } finally {
      wrappingKey.fill(0);
      keySalt.fill(0);
    }
  }

  async login(username: string, password: string): Promise<SessionInfo> {
    const user = this.users.findByNormalizedUsername(normalizeUsername(username));
    if (!user || !(await this.crypto.verifyPassword(user.password_hash, password))) {
      this.logger.warn('login_failed');
      throw new AuthenticationError();
    }
    const salt = Buffer.from(user.key_salt, 'base64');
    const wrappingKey = await this.crypto.deriveWrappingKey(password, salt);
    try {
      const dataKey = this.crypto.unwrapKey(user.wrapped_data_key, wrappingKey, user.id);
      this.logger.info('login_succeeded', { userId: user.id });
      return this.sessions.open({ userId: user.id, username: user.username, dataKey });
    } finally {
      salt.fill(0);
      wrappingKey.fill(0);
    }
  }

  logout(): void {
    const userId = this.sessions.get()?.userId;
    this.sessions.close();
    if (userId) this.logger.info('logout', { userId });
  }

  session(): SessionInfo | null {
    return this.sessions.info();
  }

  async deleteAccount(password: string): Promise<boolean> {
    const session = this.sessions.require();
    const user = this.users.findById(session.userId);
    if (!user || !(await this.crypto.verifyPassword(user.password_hash, password))) {
      throw new AuthenticationError('Неверный пароль. Аккаунт не удалён');
    }
    const deleted = this.users.deleteById(session.userId);
    if (!deleted) throw new DomainError('Аккаунт не найден', 'ACCOUNT_NOT_FOUND');
    const userId = session.userId;
    this.sessions.close();
    this.logger.purgeUser(userId);
    this.logger.info('account_deleted');
    return true;
  }
}
