import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../src/main/application/auth-service';
import { GameService } from '../src/main/application/game-service';
import { resolveDataPaths } from '../src/main/infrastructure/data-paths';
import { AppLogger } from '../src/main/infrastructure/logger';
import { CryptoService } from '../src/main/security/crypto-service';
import { SessionManager } from '../src/main/security/session-manager';
import { PaperForgeDatabase } from '../src/main/storage/database';
import { GameRepository } from '../src/main/storage/game-repository';
import { TradeRepository } from '../src/main/storage/trade-repository';
import { UserRepository } from '../src/main/storage/user-repository';

export interface TestHarness {
  root: string;
  database: PaperForgeDatabase;
  crypto: CryptoService;
  sessions: SessionManager;
  auth: AuthService;
  games: GameService;
  dispose(): void;
}

export function createHarness(): TestHarness {
  const parent = resolve('.paperforge-test');
  mkdirSync(parent, { recursive: true });
  const root = join(parent, randomUUID());
  const paths = resolveDataPaths(root);
  const database = new PaperForgeDatabase(paths);
  const crypto = new CryptoService();
  const sessions = new SessionManager();
  const logger = new AppLogger(paths);
  const auth = new AuthService(new UserRepository(database.connection), crypto, sessions, logger);
  const games = new GameService(
    new GameRepository(database.connection),
    new TradeRepository(database.connection),
    crypto,
    sessions,
    logger,
  );
  return {
    root,
    database,
    crypto,
    sessions,
    auth,
    games,
    dispose() {
      sessions.close();
      database.close();
      rmSync(root, { recursive: true, force: true });
    },
  };
}
