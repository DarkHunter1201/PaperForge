import type { SessionInfo } from '../../shared/types';
import { AuthenticationError } from '../domain/errors';

export interface ActiveSession extends SessionInfo {
  dataKey: Buffer;
}

export class SessionManager {
  private active: ActiveSession | null = null;

  open(session: ActiveSession): SessionInfo {
    this.close();
    this.active = session;
    return { userId: session.userId, username: session.username };
  }

  close(): void {
    this.active?.dataKey.fill(0);
    this.active = null;
  }

  get(): ActiveSession | null {
    return this.active;
  }

  require(): ActiveSession {
    if (!this.active) throw new AuthenticationError('Необходимо войти в аккаунт');
    return this.active;
  }

  info(): SessionInfo | null {
    if (!this.active) return null;
    return { userId: this.active.userId, username: this.active.username };
  }
}
