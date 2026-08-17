import Decimal from 'decimal.js';
import { MarketDataError } from '../domain/errors';
import type { CacheRepository } from '../storage/cache-repository';
import type { HttpClient } from './http-client';

interface OfficialRateTable {
  effectiveTimestamp: string;
  rublesPerUnit: Record<string, string>;
}

export interface OfficialExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  effectiveTimestamp: string;
  source: 'BANK_OF_RUSSIA';
}

export interface ExchangeRateProvider {
  rate(fromCurrency: string, toCurrency: string, at?: Date): Promise<OfficialExchangeRate>;
}

function tag(value: string, name: string): string | null {
  return value.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? null;
}

function decimalValue(value: string): Decimal {
  return new Decimal(value.replace(/\s/g, '').replace(',', '.'));
}

function requestedDate(value: Date): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

function effectiveTimestamp(value: string): string {
  const [day, month, year] = value.split('.');
  if (!day || !month || !year) throw new MarketDataError('Банк России вернул некорректную дату');
  return new Date(`${year}-${month}-${day}T00:00:00+03:00`).toISOString();
}

export class OfficialFxService implements ExchangeRateProvider {
  constructor(
    private readonly http: HttpClient,
    private readonly cache: CacheRepository,
  ) {}

  async rate(
    fromCurrency: string,
    toCurrency: string,
    at = new Date(),
  ): Promise<OfficialExchangeRate> {
    const from = fromCurrency.trim().toUpperCase();
    const to = toCurrency.trim().toUpperCase();
    if (!from || !to) throw new MarketDataError('Не указана валюта конвертации');
    if (from === to) {
      return {
        fromCurrency: from,
        toCurrency: to,
        rate: '1',
        effectiveTimestamp: at.toISOString(),
        source: 'BANK_OF_RUSSIA',
      };
    }
    const table = await this.table(at);
    const fromRubles = table.rublesPerUnit[from];
    const toRubles = table.rublesPerUnit[to];
    if (!fromRubles || !toRubles) {
      throw new MarketDataError(
        `Официальный курс ${from}/${to} Банка России недоступен`,
        'OFFICIAL_FX_UNAVAILABLE',
      );
    }
    return {
      fromCurrency: from,
      toCurrency: to,
      rate: new Decimal(fromRubles).div(toRubles).toString(),
      effectiveTimestamp: table.effectiveTimestamp,
      source: 'BANK_OF_RUSSIA',
    };
  }

  private async table(at: Date): Promise<OfficialRateTable> {
    const requestDate = requestedDate(at);
    const cacheKey = `official-fx:cbr:${requestDate}`;
    const cached = this.cache.get<OfficialRateTable>(cacheKey);
    if (cached) return cached;
    const url = new URL('https://www.cbr.ru/scripts/XML_daily.asp');
    url.searchParams.set('date_req', requestDate);
    const xml = await this.http.getText(url, 'windows-1251');
    const date = xml.match(/<ValCurs[^>]*Date="([^"]+)"/)?.[1];
    if (!date) throw new MarketDataError('Банк России не вернул дату официального курса');
    const rublesPerUnit: Record<string, string> = { RUB: '1' };
    for (const match of xml.matchAll(/<Valute[^>]*>([\s\S]*?)<\/Valute>/g)) {
      const block = match[1] ?? '';
      const currency = tag(block, 'CharCode')?.toUpperCase();
      const nominal = tag(block, 'Nominal');
      const value = tag(block, 'VunitRate') ?? tag(block, 'Value');
      if (!currency || !value) continue;
      const perUnit = tag(block, 'VunitRate')
        ? decimalValue(value)
        : decimalValue(value).div(decimalValue(nominal ?? '1'));
      rublesPerUnit[currency] = perUnit.toString();
    }
    const table = { effectiveTimestamp: effectiveTimestamp(date), rublesPerUnit };
    this.cache.set(cacheKey, 'bank-of-russia', table, 24 * 60 * 60 * 1000);
    return table;
  }
}
