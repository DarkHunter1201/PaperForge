import { ipcMain } from 'electron';
import type { ApiResult, HistoricalTimeMultiplier } from '../shared/types';
import { channels } from '../shared/channels';
import { DomainError } from './domain/errors';
import type { AppContainer } from './application/app-container';

async function result<T>(operation: () => T | Promise<T>): Promise<ApiResult<T>> {
  try {
    return { ok: true, data: await operation() };
  } catch (error) {
    if (error instanceof DomainError) {
      return { ok: false, error: error.message, code: error.code };
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      code: 'INTERNAL_ERROR',
    };
  }
}

export function registerIpc(container: AppContainer, version: string): void {
  ipcMain.handle(channels.appSettings, () =>
    result(() => ({
      twelveDataApiKeyConfigured:
        Boolean(process.env.TWELVE_DATA_API_KEY) ||
        container.settings.hasSecret('twelve-data-api-key'),
      dataRoot: container.paths.root,
      version,
      providers: container.providers.statuses(),
    })),
  );
  ipcMain.handle(channels.appSetTwelveDataKey, (_, apiKey: string) =>
    result(() => {
      container.settings.setSecret('twelve-data-api-key', apiKey.trim());
      return true;
    }),
  );
  ipcMain.handle(channels.authRegister, (_, username: string, password: string) =>
    result(() => container.auth.register(username, password)),
  );
  ipcMain.handle(channels.authLogin, (_, username: string, password: string) =>
    result(() => container.auth.login(username, password)),
  );
  ipcMain.handle(channels.authLogout, () =>
    result(() => {
      container.auth.logout();
      return true;
    }),
  );
  ipcMain.handle(channels.authSession, () => result(() => container.auth.session()));
  ipcMain.handle(channels.authDeleteAccount, (_, password: string) =>
    result(() => container.auth.deleteAccount(password)),
  );
  ipcMain.handle(channels.gamesList, () => result(() => container.games.list()));
  ipcMain.handle(channels.gamesCreate, (_, input) => result(() => container.games.create(input)));
  ipcMain.handle(channels.gamesLoad, (_, gameId: string) =>
    result(() => container.games.load(gameId)),
  );
  ipcMain.handle(channels.gamesSyncClock, (_, gameId: string) =>
    result(() => container.games.syncClock(gameId)),
  );
  ipcMain.handle(
    channels.gamesSetTimeMultiplier,
    (_, gameId: string, multiplier: HistoricalTimeMultiplier) =>
      result(() => container.games.setTimeMultiplier(gameId, multiplier)),
  );
  ipcMain.handle(channels.gamesRemove, (_, gameId: string) =>
    result(() => container.games.remove(gameId)),
  );
  ipcMain.handle(channels.savesList, (_, gameId: string) =>
    result(() => container.games.listSaves(gameId)),
  );
  ipcMain.handle(channels.savesCreate, (_, gameId: string, name: string) =>
    result(() => container.games.createSave(gameId, name)),
  );
  ipcMain.handle(channels.savesRestore, (_, saveId: string) =>
    result(() => container.games.restoreSave(saveId)),
  );
  ipcMain.handle(channels.savesRemove, (_, saveId: string) =>
    result(() => container.games.removeSave(saveId)),
  );
  ipcMain.handle(channels.marketSearch, (_, query, assetClass) =>
    result(() => container.market.search(query, assetClass)),
  );
  ipcMain.handle(channels.marketQuote, (_, gameId, instrument) =>
    result(() => container.market.quote(gameId, instrument)),
  );
  ipcMain.handle(channels.marketCandles, (_, gameId, instrument, interval, limit) =>
    result(() => container.market.candles(gameId, instrument, interval, limit)),
  );
  ipcMain.handle(channels.tradingExecute, (_, input) =>
    result(() => container.trading.execute(input)),
  );
  ipcMain.handle(channels.tradingPortfolio, (_, gameId: string) =>
    result(() => container.trading.portfolio(gameId)),
  );
  ipcMain.handle(channels.adminMutate, (_, gameId, mutation) =>
    result(() => container.games.adminMutate(gameId, mutation)),
  );
}
