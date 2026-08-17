export type AssetClass = 'EQUITY' | 'CRYPTO' | 'FOREX';
export type GameMode = 'LIVE' | 'HISTORICAL';
export type TradeSide = 'BUY' | 'SELL';
export type DataTimeliness = 'REALTIME' | 'DELAYED' | 'PROVIDER_DEPENDENT' | 'HISTORICAL';
export type CandleInterval = '1m' | '5m' | '15m' | '1h' | '1d';

export interface Instrument {
  id: string;
  provider: string;
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange: string;
  currency: string;
  baseCurrency?: string;
  quoteCurrency: string;
  timezone: string;
  tradable: boolean;
  dataTimeliness: DataTimeliness;
}

export interface Quote {
  instrumentId: string;
  provider: string;
  price: string;
  currency: string;
  timestamp: string;
  tradable: boolean;
  dataTimeliness: DataTimeliness;
}

export interface Candle {
  instrumentId: string;
  provider: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
  timestamp: string;
  endTimestamp: string;
  dataTimeliness: DataTimeliness;
}

export interface Holding {
  instrument: Instrument;
  quantity: string;
  averageCost: string;
  realizedPnl: string;
}

export interface TradeRecord {
  id: string;
  gameId: string;
  userId: string;
  instrument: Instrument;
  side: TradeSide;
  quantity: string;
  executionPrice: string;
  transactionCurrency: string;
  commission: string;
  realTimestamp: string;
  simulationTimestamp: string;
}

export interface GameState {
  id: string;
  userId: string;
  name: string;
  mode: GameMode;
  reportingCurrency: string;
  simulationTimestamp: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  cash: Record<string, string>;
  holdings: Holding[];
  trades: TradeRecord[];
}

export interface GameSummary {
  id: string;
  name: string;
  mode: GameMode;
  reportingCurrency: string;
  simulationTimestamp: string;
  updatedAt: string;
  revision: number;
}

export interface SaveSummary {
  id: string;
  gameId: string;
  name: string;
  createdAt: string;
  simulationTimestamp: string;
  revision: number;
}

export interface PortfolioPosition {
  instrument: Instrument;
  quantity: string;
  averageCost: string;
  currentPrice: string | null;
  marketValue: string | null;
  unrealizedPnl: string | null;
  realizedPnl: string;
  returnPercent: string | null;
}

export interface PortfolioSnapshot {
  reportingCurrency: string;
  cash: Record<string, string>;
  cashValue: string;
  positionsValue: string;
  totalValue: string;
  realizedPnl: string;
  unrealizedPnl: string;
  positions: PortfolioPosition[];
  unavailableConversions: string[];
}

export interface SessionInfo {
  userId: string;
  username: string;
}

export interface ProviderStatus {
  id: string;
  name: string;
  configured: boolean;
  assetClasses: AssetClass[];
  markets: string[];
  timeliness: DataTimeliness;
}

export interface AppSettings {
  twelveDataApiKeyConfigured: boolean;
  dataRoot: string;
  version: string;
  providers: ProviderStatus[];
}

export interface AdminMutation {
  cash?: Record<string, string>;
  holdings?: Array<{
    instrument: Instrument;
    quantity: string;
    averageCost: string;
    realizedPnl?: string;
  }>;
  simulationTimestamp?: string;
}

export interface ApiResult<T> {
  ok: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface PaperForgeApi {
  app: {
    settings(): Promise<ApiResult<AppSettings>>;
    setTwelveDataApiKey(apiKey: string): Promise<ApiResult<boolean>>;
  };
  auth: {
    register(username: string, password: string): Promise<ApiResult<SessionInfo>>;
    login(username: string, password: string): Promise<ApiResult<SessionInfo>>;
    logout(): Promise<ApiResult<boolean>>;
    session(): Promise<ApiResult<SessionInfo | null>>;
    deleteAccount(password: string): Promise<ApiResult<boolean>>;
  };
  games: {
    list(): Promise<ApiResult<GameSummary[]>>;
    create(input: {
      name: string;
      mode: GameMode;
      reportingCurrency: string;
      initialBalance: string;
      historicalStart?: string;
    }): Promise<ApiResult<GameState>>;
    load(gameId: string): Promise<ApiResult<GameState>>;
    remove(gameId: string): Promise<ApiResult<boolean>>;
  };
  saves: {
    list(gameId: string): Promise<ApiResult<SaveSummary[]>>;
    create(gameId: string, name: string): Promise<ApiResult<SaveSummary>>;
    restore(saveId: string): Promise<ApiResult<GameState>>;
    remove(saveId: string): Promise<ApiResult<boolean>>;
  };
  market: {
    search(query: string, assetClass?: AssetClass): Promise<ApiResult<Instrument[]>>;
    quote(gameId: string, instrument: Instrument): Promise<ApiResult<Quote>>;
    candles(
      gameId: string,
      instrument: Instrument,
      interval: CandleInterval,
      limit: number,
    ): Promise<ApiResult<Candle[]>>;
  };
  trading: {
    execute(input: {
      gameId: string;
      instrument: Instrument;
      side: TradeSide;
      quantity: string;
    }): Promise<ApiResult<GameState>>;
    portfolio(gameId: string): Promise<ApiResult<PortfolioSnapshot>>;
  };
  admin: {
    mutate(gameId: string, mutation: AdminMutation): Promise<ApiResult<GameState>>;
  };
}
