import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IntegrityError } from '../src/main/domain/errors';
import type { TestHarness } from './helpers';
import { createHarness } from './helpers';

describe('Authentication and protected storage', () => {
  let harness: TestHarness;

  beforeEach(() => {
    harness = createHarness();
  });

  afterEach(() => {
    harness.dispose();
  });

  it('регистрирует, нормализует unique username и выполняет login/logout', async () => {
    const registered = await harness.auth.register('  Trader  ', '');
    expect(registered.username).toBe('Trader');
    harness.auth.logout();
    await expect(harness.auth.login('trader', '')).resolves.toMatchObject({ username: 'Trader' });
    harness.auth.logout();
    await expect(harness.auth.login('TRADER', 'wrong')).rejects.toThrow();
  });

  it('не позволяет зарегистрировать одинаковые normalized usernames', async () => {
    await harness.auth.register('Investor', 'one');
    await expect(harness.auth.register('  INVESTOR  ', 'two')).rejects.toMatchObject({
      code: 'USERNAME_EXISTS',
    });
  });

  it('создаёт неограничиваемую программным лимитом последовательность saves', async () => {
    await harness.auth.register('Saver', 'secret');
    const game = harness.games.create({
      name: 'Archive',
      mode: 'LIVE',
      reportingCurrency: 'USD',
      initialBalance: '250000.25',
    });
    for (let index = 0; index < 24; index += 1) {
      harness.games.createSave(game.id, `Save ${index}`);
    }
    expect(harness.games.listSaves(game.id)).toHaveLength(24);
  });

  it('обнаруживает ручное изменение encrypted game state', async () => {
    await harness.auth.register('Auditor', 'secret');
    const game = harness.games.create({
      name: 'Protected',
      mode: 'LIVE',
      reportingCurrency: 'EUR',
      initialBalance: '1000',
    });
    harness.database.connection
      .prepare("UPDATE games SET encrypted_state = encrypted_state || 'x' WHERE id = ?")
      .run(game.id);
    expect(() => harness.games.load(game.id)).toThrow(IntegrityError);
  });

  it('обнаруживает изменение integrity metadata сохранения', async () => {
    await harness.auth.register('SaveAuditor', 'secret');
    const game = harness.games.create({
      name: 'Protected saves',
      mode: 'LIVE',
      reportingCurrency: 'USD',
      initialBalance: '1000',
    });
    const save = harness.games.createSave(game.id, 'Snapshot');
    harness.database.connection
      .prepare("UPDATE saves SET integrity_hash = 'invalid' WHERE id = ?")
      .run(save.id);
    expect(() => harness.games.restoreSave(save.id)).toThrow(IntegrityError);
  });

  it('изменяет состояние через авторизованный service layer и сохраняет integrity', async () => {
    await harness.auth.register('Controller', 'secret');
    const game = harness.games.create({
      name: 'Controlled',
      mode: 'HISTORICAL',
      reportingCurrency: 'USD',
      initialBalance: '1000',
      historicalStart: '2008-09-15T14:35:00.000Z',
    });
    const changed = harness.games.adminMutate(game.id, {
      cash: { USD: '999999.123456789' },
      simulationTimestamp: '2008-09-16T14:35:00.000Z',
    });
    expect(changed.cash.USD).toBe('999999.123456789');
    expect(harness.games.load(game.id).cash.USD).toBe('999999.123456789');
  });

  it('безвозвратно удаляет аккаунт и все связанные данные', async () => {
    const session = await harness.auth.register('Disposable', 'secret');
    const game = harness.games.create({
      name: 'Disposable game',
      mode: 'LIVE',
      reportingCurrency: 'USD',
      initialBalance: '1000',
    });
    harness.games.createSave(game.id, 'Disposable save');
    const timestamp = new Date().toISOString();
    harness.database.connection
      .prepare(
        `INSERT INTO trades
         (id, game_id, user_id, instrument_id, symbol, asset_class, exchange_id, side,
          simulation_timestamp, encrypted_payload, integrity_hash, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        'trade',
        game.id,
        session.userId,
        'test:AAPL',
        'AAPL',
        'EQUITY',
        'NASDAQ',
        'BUY',
        timestamp,
        'encrypted',
        'integrity',
        timestamp,
      );
    harness.database.connection
      .prepare(
        `INSERT INTO settings (user_id, setting_key, encrypted_value, integrity_hash, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(session.userId, 'key', 'encrypted', 'integrity', timestamp);
    await expect(harness.auth.deleteAccount('wrong')).rejects.toThrow('Неверный пароль');
    await expect(harness.auth.deleteAccount('secret')).resolves.toBe(true);
    expect(harness.auth.session()).toBeNull();
    for (const table of ['users', 'games', 'saves', 'trades', 'settings']) {
      const row = harness.database.connection
        .prepare(`SELECT COUNT(*) AS count FROM ${table}`)
        .get() as {
        count: number;
      };
      expect(row.count).toBe(0);
    }
  });
});
