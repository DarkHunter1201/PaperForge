import type {
  AssetClass,
  Candle,
  CandleInterval,
  Instrument,
  ProviderStatus,
  Quote,
} from '../../shared/types';

export interface InstrumentSearch {
  query: string;
  assetClass?: AssetClass;
  limit?: number;
}

export interface CandleRequest {
  instrument: Instrument;
  interval: CandleInterval;
  limit: number;
  at?: Date;
}

export interface MarketDataProvider {
  readonly id: string;
  status(): ProviderStatus;
  search(request: InstrumentSearch): Promise<Instrument[]>;
  quote(instrument: Instrument, at?: Date): Promise<Quote>;
  candles(request: CandleRequest): Promise<Candle[]>;
}
