import { afterEach, describe, expect, it } from 'vitest';
import {
  HISTORICAL_TIME_MULTIPLIERS,
  type HistoricalTimeMultiplier,
  type PortfolioSnapshot,
} from '../src/shared/types';
import { SimulationClock } from '../src/main/domain/simulation-clock';
import { createHarness } from './helpers';

function source(multiplier: HistoricalTimeMultiplier = 1) {
  return {
    mode: 'HISTORICAL' as const,
    simulationStartTimestamp: '2020-01-01T12:00:00.000Z',
    simulationTimestamp: '2020-01-01T12:00:00.000Z',
    clockAnchorSimulationTimestamp: '2020-01-01T12:00:00.000Z',
    clockAnchorRealTimestamp: '2026-01-01T12:00:00.000Z',
    timeMultiplier: multiplier,
    status: 'ACTIVE' as const,
  };
}

function finalPortfolio(): PortfolioSnapshot {
  return {
    reportingCurrency: 'USD',
    cash: { USD: '1000' },
    cashValue: '1000',
    positionsValue: '0',
    totalValue: '1000',
    realizedPnl: '0',
    unrealizedPnl: '0',
    positions: [],
    unavailableConversions: [],
  };
}

describe('SimulationClock', () => {
  it.each(HISTORICAL_TIME_MULTIPLIERS)('движется без drift на скорости %sx', (multiplier) => {
    let now = new Date('2026-01-01T12:00:00.000Z');
    const clock = new SimulationClock(source(multiplier), () => now);
    now = new Date('2026-01-01T12:00:12.345Z');
    const first = clock.current();
    const second = clock.current();
    const expected = Date.parse('2020-01-01T12:00:00.000Z') + 12_345 * multiplier;
    expect(first.simulationTimestamp).toBe(new Date(expected).toISOString());
    expect(second.simulationTimestamp).toBe(first.simulationTimestamp);
  });

  it('меняет multiplier от текущей точки без скачка', () => {
    let now = new Date('2026-01-01T12:00:00.000Z');
    const initial = source(1);
    const clock = new SimulationClock(initial, () => now);
    now = new Date('2026-01-01T12:00:10.000Z');
    const before = clock.current();
    const changed = clock.withMultiplier(100);
    expect(changed.simulationTimestamp).toBe(before.simulationTimestamp);
    now = new Date('2026-01-01T12:00:11.000Z');
    expect(
      new SimulationClock({ ...initial, ...changed }, () => now).current().simulationTimestamp,
    ).toBe('2020-01-01T12:01:50.000Z');
  });

  it('не раскрывает следующий timestamp при скорости 1000x', () => {
    let now = new Date('2026-01-01T12:00:00.000Z');
    const clock = new SimulationClock(source(1000), () => now);
    now = new Date('2026-01-01T12:00:00.060Z');
    const boundary = clock.current().simulationTimestamp;
    expect(boundary).toBe('2020-01-01T12:01:00.000Z');
    expect(clock.allows('2020-01-01T12:01:00.000Z', boundary)).toBe(true);
    expect(clock.allows('2020-01-01T12:01:00.001Z', boundary)).toBe(false);
  });

  it('останавливается ровно на настоящем времени и не идёт в будущее', () => {
    let now = new Date('2026-01-01T12:00:00.000Z');
    const nearPresent = {
      ...source(1000),
      simulationStartTimestamp: '2026-01-01T11:59:00.000Z',
      simulationTimestamp: '2026-01-01T11:59:00.000Z',
      clockAnchorSimulationTimestamp: '2026-01-01T11:59:00.000Z',
    };
    const clock = new SimulationClock(nearPresent, () => now);
    now = new Date('2026-01-01T12:00:00.100Z');
    const completed = clock.current();
    expect(completed.status).toBe('COMPLETED');
    expect(completed.simulationTimestamp).toBe(now.toISOString());
    expect(Date.parse(completed.simulationTimestamp)).toBeLessThanOrEqual(now.getTime());
  });
});

describe('Historical game persistence', () => {
  const disposers: Array<() => void> = [];
  afterEach(() => {
    while (disposers.length > 0) disposers.pop()?.();
  });

  it('сохраняет и восстанавливает multiplier и clock metadata', async () => {
    let now = new Date('2026-01-01T12:00:00.000Z');
    const harness = createHarness(() => now);
    disposers.push(() => harness.dispose());
    await harness.auth.register('ClockSaver', 'secret');
    const game = harness.games.create({
      name: 'Clock',
      mode: 'HISTORICAL',
      reportingCurrency: 'USD',
      initialBalance: '1000',
      historicalStart: '2020-01-01T12:00:00.000Z',
    });
    now = new Date('2026-01-01T12:00:10.000Z');
    const accelerated = harness.games.setTimeMultiplier(game.id, 5);
    const save = harness.games.createSave(game.id, '5x');
    expect(save.timeMultiplier).toBe(5);
    now = new Date('2026-01-01T12:00:12.000Z');
    expect(harness.games.load(game.id).simulationTimestamp).toBe('2020-01-01T12:00:20.000Z');
    const restored = harness.games.restoreSave(save.id);
    expect(restored.timeMultiplier).toBe(5);
    expect(restored.simulationTimestamp).toBe(accelerated.simulationTimestamp);
    now = new Date('2026-01-01T12:00:13.000Z');
    expect(harness.games.load(game.id).simulationTimestamp).toBe('2020-01-01T12:00:15.000Z');
  });

  it('фиксирует завершение и запрещает продолжение игры', async () => {
    let now = new Date('2026-01-01T12:00:00.000Z');
    const harness = createHarness(() => now);
    disposers.push(() => harness.dispose());
    await harness.auth.register('Finisher', 'secret');
    const game = harness.games.create({
      name: 'Finish',
      mode: 'HISTORICAL',
      reportingCurrency: 'USD',
      initialBalance: '1000',
      historicalStart: '2026-01-01T11:59:00.000Z',
    });
    harness.games.setTimeMultiplier(game.id, 1000);
    now = new Date('2026-01-01T12:00:00.100Z');
    const completed = harness.games.syncClock(game.id);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.completionReason).toBe('PRESENT_REACHED');
    const recorded = harness.games.recordFinalPortfolio(game.id, finalPortfolio());
    expect(recorded.finalPortfolio?.totalValue).toBe('1000');
    now = new Date('2026-01-01T13:00:00.000Z');
    expect(harness.games.load(game.id).simulationTimestamp).toBe(completed.simulationTimestamp);
    expect(() => harness.games.setTimeMultiplier(game.id, 1)).toThrow('нельзя продолжить');
  });
});
