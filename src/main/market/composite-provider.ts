import type { Instrument, ProviderStatus } from '../../shared/types';
import { MarketDataError } from '../domain/errors';
import type { CandleRequest, InstrumentSearch, MarketDataProvider } from './market-data-provider';

export class CompositeProvider {
  private readonly providersById: Map<string, MarketDataProvider>;

  constructor(private readonly providers: MarketDataProvider[]) {
    this.providersById = new Map(providers.map((provider) => [provider.id, provider]));
  }

  statuses(): ProviderStatus[] {
    return this.providers.map((provider) => provider.status());
  }

  async search(request: InstrumentSearch): Promise<Instrument[]> {
    const configured = this.providers.filter(
      (provider) =>
        provider.status().configured &&
        (!request.assetClass || provider.status().assetClasses.includes(request.assetClass)),
    );
    if (!configured.length) {
      throw new MarketDataError('Для выбранного класса активов Provider не настроен');
    }
    const instruments: Instrument[] = [];
    const searches = configured.map(async (provider) => {
      try {
        instruments.push(...(await provider.search(request)));
      } catch {
        return;
      }
    });
    await Promise.race([
      Promise.all(searches),
      new Promise<void>((resolve) => setTimeout(resolve, 4000)),
    ]);
    return [
      ...new Map(instruments.map((instrument) => [instrument.id, instrument])).values(),
    ].slice(0, request.limit ?? 100);
  }

  quote(instrument: Instrument, at?: Date) {
    return this.provider(instrument).quote(instrument, at);
  }

  candles(request: CandleRequest) {
    return this.provider(request.instrument).candles(request);
  }

  private provider(instrument: Instrument): MarketDataProvider {
    const provider = this.providersById.get(instrument.provider);
    if (!provider) throw new MarketDataError('Provider инструмента не найден');
    if (!provider.status().configured) {
      throw new MarketDataError('Provider не настроен', 'PROVIDER_NOT_CONFIGURED');
    }
    return provider;
  }
}
