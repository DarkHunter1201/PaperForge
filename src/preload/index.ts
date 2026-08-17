import { contextBridge, ipcRenderer } from 'electron';
import type { PaperForgeApi } from '../shared/types';
import { channels } from '../shared/channels';

const api: PaperForgeApi = {
  app: {
    settings: () => ipcRenderer.invoke(channels.appSettings),
    setTwelveDataApiKey: (apiKey) => ipcRenderer.invoke(channels.appSetTwelveDataKey, apiKey),
  },
  auth: {
    register: (username, password) => ipcRenderer.invoke(channels.authRegister, username, password),
    login: (username, password) => ipcRenderer.invoke(channels.authLogin, username, password),
    logout: () => ipcRenderer.invoke(channels.authLogout),
    session: () => ipcRenderer.invoke(channels.authSession),
    deleteAccount: (password) => ipcRenderer.invoke(channels.authDeleteAccount, password),
  },
  games: {
    list: () => ipcRenderer.invoke(channels.gamesList),
    create: (input) => ipcRenderer.invoke(channels.gamesCreate, input),
    load: (gameId) => ipcRenderer.invoke(channels.gamesLoad, gameId),
    syncClock: (gameId) => ipcRenderer.invoke(channels.gamesSyncClock, gameId),
    setTimeMultiplier: (gameId, multiplier) =>
      ipcRenderer.invoke(channels.gamesSetTimeMultiplier, gameId, multiplier),
    remove: (gameId) => ipcRenderer.invoke(channels.gamesRemove, gameId),
  },
  saves: {
    list: (gameId) => ipcRenderer.invoke(channels.savesList, gameId),
    create: (gameId, name) => ipcRenderer.invoke(channels.savesCreate, gameId, name),
    restore: (saveId) => ipcRenderer.invoke(channels.savesRestore, saveId),
    remove: (saveId) => ipcRenderer.invoke(channels.savesRemove, saveId),
  },
  market: {
    search: (query, assetClass) => ipcRenderer.invoke(channels.marketSearch, query, assetClass),
    quote: (gameId, instrument) => ipcRenderer.invoke(channels.marketQuote, gameId, instrument),
    candles: (gameId, instrument, interval, limit) =>
      ipcRenderer.invoke(channels.marketCandles, gameId, instrument, interval, limit),
  },
  trading: {
    execute: (input) => ipcRenderer.invoke(channels.tradingExecute, input),
    portfolio: (gameId) => ipcRenderer.invoke(channels.tradingPortfolio, gameId),
  },
  admin: {
    mutate: (gameId, mutation) => ipcRenderer.invoke(channels.adminMutate, gameId, mutation),
  },
};

contextBridge.exposeInMainWorld('paperForge', api);
