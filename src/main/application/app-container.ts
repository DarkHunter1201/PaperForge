import type { App } from 'electron';
import { dirname } from 'node:path';
import { AuthService } from './auth-service';
import { GameService } from './game-service';
import { MarketService } from './market-service';
import { SettingsService } from './settings-service';
import { TradingService } from './trading-service';
import { resolveDataPaths } from '../infrastructure/data-paths';
import { AppLogger } from '../infrastructure/logger';
import { BinanceProvider } from '../market/binance-provider';
import { CompositeProvider } from '../market/composite-provider';
import { HttpClient } from '../market/http-client';
import { MoexProvider } from '../market/moex-provider';
import { OfficialFxService } from '../market/official-fx-service';
import { TwelveDataProvider } from '../market/twelve-data-provider';
import { YahooFinanceProvider } from '../market/yahoo-finance-provider';
import { CryptoService } from '../security/crypto-service';
import { SessionManager } from '../security/session-manager';
import { CacheRepository } from '../storage/cache-repository';
import { PaperForgeDatabase } from '../storage/database';
import { GameRepository } from '../storage/game-repository';
import { SettingsRepository } from '../storage/settings-repository';
import { TradeRepository } from '../storage/trade-repository';
import { UserRepository } from '../storage/user-repository';

export class AppContainer {
  readonly paths;
  readonly logger;
  readonly database;
  readonly sessions;
  readonly auth;
  readonly games;
  readonly settings;
  readonly providers;
  readonly market;
  readonly trading;

  constructor(app: App, applicationRoot?: string) {
    const packagedRoot = process.env.PORTABLE_EXECUTABLE_DIR ?? dirname(app.getPath('exe'));
    const root = applicationRoot ?? (app.isPackaged ? packagedRoot : process.cwd());
    this.paths = resolveDataPaths(root);
    this.logger = new AppLogger(this.paths);
    this.database = new PaperForgeDatabase(this.paths);
    const crypto = new CryptoService();
    this.sessions = new SessionManager();
    const users = new UserRepository(this.database.connection);
    const gameRepository = new GameRepository(this.database.connection);
    const trades = new TradeRepository(this.database.connection);
    const cache = new CacheRepository(this.database.connection);
    const settingsRepository = new SettingsRepository(this.database.connection);
    this.settings = new SettingsService(settingsRepository, crypto, this.sessions);
    this.auth = new AuthService(users, crypto, this.sessions, this.logger);
    this.games = new GameService(gameRepository, trades, crypto, this.sessions, this.logger);
    const http = new HttpClient();
    const twelveDataKey = () => {
      if (process.env.TWELVE_DATA_API_KEY) return process.env.TWELVE_DATA_API_KEY;
      return this.settings.hasSecret('twelve-data-api-key')
        ? this.settings.getSecret('twelve-data-api-key')
        : null;
    };
    this.providers = new CompositeProvider([
      new MoexProvider(http, cache),
      new YahooFinanceProvider(http),
      new BinanceProvider(http, cache),
      new TwelveDataProvider(http, twelveDataKey),
    ]);
    this.market = new MarketService(this.providers, this.games, cache, this.logger);
    this.trading = new TradingService(this.games, this.market, new OfficialFxService(http, cache));
    cache.purgeExpired();
  }

  close(): void {
    this.sessions.close();
    this.database.close();
  }
}
