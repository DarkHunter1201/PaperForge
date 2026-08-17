import { describe, expect, it } from 'vitest';
import type { Instrument } from '../src/shared/types';
import { MarketCalendar } from '../src/main/market/market-calendar';

function instrument(
  assetClass: Instrument['assetClass'],
  exchange: string,
  timezone: string,
): Instrument {
  return {
    id: `${exchange}:TEST`,
    provider: 'test',
    symbol: 'TEST',
    name: 'Test',
    assetClass,
    exchange,
    currency: 'USD',
    quoteCurrency: 'USD',
    timezone,
    tradable: true,
    dataTimeliness: 'HISTORICAL',
  };
}

describe('MarketCalendar', () => {
  const calendar = new MarketCalendar();

  it('учитывает timezone и летнее время американского рынка', () => {
    const nasdaq = instrument('EQUITY', 'NASDAQ', 'America/New_York');
    expect(calendar.isOpen(nasdaq, new Date('2026-01-05T14:45:00.000Z'))).toBe(true);
    expect(calendar.isOpen(nasdaq, new Date('2026-03-09T13:45:00.000Z'))).toBe(true);
    expect(calendar.isOpen(nasdaq, new Date('2026-03-09T20:30:00.000Z'))).toBe(false);
  });

  it('не открывает биржу в выходной и holiday при ускоренном прохождении времени', () => {
    const nasdaq = instrument('EQUITY', 'NASDAQ', 'America/New_York');
    expect(calendar.isOpen(nasdaq, new Date('2026-07-03T15:00:00.000Z'))).toBe(false);
    expect(calendar.isOpen(nasdaq, new Date('2026-07-04T15:00:00.000Z'))).toBe(false);
    expect(calendar.isOpen(nasdaq, new Date('2026-07-06T15:00:00.000Z'))).toBe(true);
  });

  it('соблюдает часы MOEX, FX и круглосуточность cryptocurrency', () => {
    const moex = instrument('EQUITY', 'MOEX', 'Europe/Moscow');
    const forex = instrument('FOREX', 'FX', 'UTC');
    const crypto = instrument('CRYPTO', 'CRYPTO', 'UTC');
    expect(calendar.isOpen(moex, new Date('2026-08-17T07:00:00.000Z'))).toBe(true);
    expect(calendar.isOpen(moex, new Date('2026-08-17T06:00:00.000Z'))).toBe(false);
    expect(calendar.isOpen(forex, new Date('2026-01-04T21:59:00.000Z'))).toBe(false);
    expect(calendar.isOpen(forex, new Date('2026-01-04T22:00:00.000Z'))).toBe(true);
    expect(calendar.isOpen(crypto, new Date('2026-01-04T12:00:00.000Z'))).toBe(true);
  });
});
