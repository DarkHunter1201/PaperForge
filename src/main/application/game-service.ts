import { randomUUID } from 'node:crypto';
import type {
  AdminMutation,
  GameMode,
  GameState,
  GameSummary,
  HistoricalTimeMultiplier,
  PortfolioSnapshot,
  SaveSummary,
  TradeRecord,
} from '../../shared/types';
import { canonicalDecimal, nonNegativeDecimal } from '../domain/decimal';
import { DomainError, IntegrityError, ValidationError } from '../domain/errors';
import { SimulationClock } from '../domain/simulation-clock';
import { TradingEngine } from '../domain/trading-engine';
import type { AppLogger } from '../infrastructure/logger';
import type { CryptoService } from '../security/crypto-service';
import type { SessionManager } from '../security/session-manager';
import type { GameRepository, GameRow, SaveRow } from '../storage/game-repository';
import type { TradeRepository } from '../storage/trade-repository';

interface CreateGameInput {
  name: string;
  mode: GameMode;
  reportingCurrency: string;
  initialBalance: string;
  historicalStart?: string;
}

export class GameService {
  private readonly validator = new TradingEngine();

  constructor(
    private readonly games: GameRepository,
    private readonly trades: TradeRepository,
    private readonly crypto: CryptoService,
    private readonly sessions: SessionManager,
    private readonly logger: AppLogger,
    private readonly realClock: () => Date = () => new Date(),
  ) {}

  create(input: CreateGameInput): GameState {
    const session = this.sessions.require();
    const name = input.name.trim();
    if (!name || name.length > 160) throw new ValidationError('Укажите название игры');
    const reportingCurrency = input.reportingCurrency.trim().toUpperCase();
    if (!/^[A-Z]{3,10}$/.test(reportingCurrency)) {
      throw new ValidationError('Некорректная валюта отчётности');
    }
    const balance = nonNegativeDecimal(input.initialBalance, 'Начальный баланс');
    const realNow = this.realClock();
    let simulationTimestamp = realNow.toISOString();
    if (input.mode === 'HISTORICAL') {
      if (!input.historicalStart) throw new ValidationError('Укажите дату Historical-игры');
      const historicalStart = new Date(input.historicalStart);
      if (
        Number.isNaN(historicalStart.getTime()) ||
        historicalStart.getTime() >= realNow.getTime()
      ) {
        throw new ValidationError('Historical-игра должна начинаться в прошлом');
      }
      simulationTimestamp = historicalStart.toISOString();
    }
    const id = randomUUID();
    const timestamp = realNow.toISOString();
    const state: GameState = {
      id,
      userId: session.userId,
      name,
      mode: input.mode,
      reportingCurrency,
      simulationStartTimestamp: simulationTimestamp,
      simulationTimestamp,
      clockAnchorSimulationTimestamp: simulationTimestamp,
      clockAnchorRealTimestamp: timestamp,
      timeMultiplier: 1,
      status: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
      revision: 1,
      cash: { [reportingCurrency]: canonicalDecimal(balance) },
      holdings: [],
      trades: [],
    };
    this.games.create(this.encryptGame(state, session.dataKey));
    this.logger.info('game_created', { userId: session.userId, gameId: id, mode: input.mode });
    return state;
  }

  list(): GameSummary[] {
    const session = this.sessions.require();
    return this.games.list(session.userId).map((row) => {
      const state = this.load(row.id);
      return {
        id: state.id,
        name: state.name,
        mode: state.mode,
        reportingCurrency: state.reportingCurrency,
        simulationTimestamp: state.simulationTimestamp,
        timeMultiplier: state.timeMultiplier,
        status: state.status,
        updatedAt: state.updatedAt,
        revision: state.revision,
      };
    });
  }

  load(gameId: string): GameState {
    const session = this.sessions.require();
    const row = this.games.find(gameId, session.userId);
    if (!row) throw new DomainError('Игра не найдена', 'GAME_NOT_FOUND');
    return this.synchronizeClock(this.decryptGame(row, session.dataKey));
  }

  syncClock(gameId: string): GameState {
    return this.load(gameId);
  }

  setTimeMultiplier(gameId: string, multiplier: HistoricalTimeMultiplier): GameState {
    const state = this.load(gameId);
    const update = new SimulationClock(state, this.realClock).withMultiplier(multiplier);
    const next = { ...state, ...update };
    next.revision += 1;
    next.updatedAt = update.clockAnchorRealTimestamp;
    this.saveState(next);
    this.logger.info('historical_multiplier_changed', {
      userId: state.userId,
      gameId,
      multiplier,
    });
    return next;
  }

  recordFinalPortfolio(gameId: string, portfolio: PortfolioSnapshot): GameState {
    const state = this.load(gameId);
    if (state.status !== 'COMPLETED' || state.finalPortfolio) return state;
    const next = structuredClone(state);
    next.finalPortfolio = portfolio;
    next.revision += 1;
    next.updatedAt = this.realClock().toISOString();
    return this.saveState(next);
  }

  remove(gameId: string): boolean {
    const session = this.sessions.require();
    const removed = this.games.remove(gameId, session.userId);
    if (removed) this.logger.info('game_removed', { userId: session.userId, gameId });
    return removed;
  }

  saveState(state: GameState, newTrade?: TradeRecord): GameState {
    const session = this.sessions.require();
    if (state.userId !== session.userId) throw new IntegrityError();
    this.validator.validate(state);
    this.games.transaction(() => {
      this.games.update(this.encryptGame(state, session.dataKey));
      if (newTrade) {
        const associatedData = `trade:${newTrade.id}:game:${state.id}:user:${session.userId}`;
        const encrypted = this.crypto.encryptJson(newTrade, session.dataKey, associatedData);
        this.trades.create(
          this.trades.toRow(
            newTrade,
            encrypted,
            this.crypto.integrity(encrypted, session.dataKey, associatedData),
          ),
        );
      }
    });
    return state;
  }

  createSave(gameId: string, name: string): SaveSummary {
    const session = this.sessions.require();
    const state = this.load(gameId);
    const saveId = randomUUID();
    const realNow = this.realClock();
    const saveName = name.trim() || `Save ${realNow.toLocaleString('ru-RU')}`;
    const createdAt = realNow.toISOString();
    const associatedData = `save:${saveId}:game:${gameId}:user:${session.userId}:revision:${state.revision}`;
    const encrypted = this.crypto.encryptJson(state, session.dataKey, associatedData);
    const row: SaveRow = {
      id: saveId,
      game_id: gameId,
      user_id: session.userId,
      name: saveName,
      simulation_timestamp: state.simulationTimestamp,
      encrypted_state: encrypted,
      integrity_hash: this.crypto.integrity(encrypted, session.dataKey, associatedData),
      revision: state.revision,
      created_at: createdAt,
    };
    this.games.createSave(row);
    this.logger.info('save_created', { userId: session.userId, gameId, saveId });
    return {
      id: saveId,
      gameId,
      name: saveName,
      createdAt,
      simulationTimestamp: state.simulationTimestamp,
      timeMultiplier: state.timeMultiplier,
      status: state.status,
      revision: state.revision,
    };
  }

  listSaves(gameId: string): SaveSummary[] {
    const session = this.sessions.require();
    this.load(gameId);
    return this.games.listSaves(gameId, session.userId).map((row) => {
      const state = this.readSave(row, session.dataKey);
      return {
        id: row.id,
        gameId: row.game_id,
        name: row.name,
        createdAt: row.created_at,
        simulationTimestamp: row.simulation_timestamp,
        timeMultiplier: state.timeMultiplier,
        status: state.status,
        revision: row.revision,
      };
    });
  }

  restoreSave(saveId: string): GameState {
    const session = this.sessions.require();
    const save = this.games.findSave(saveId, session.userId);
    if (!save) throw new DomainError('Сохранение не найдено', 'SAVE_NOT_FOUND');
    const associatedData = `save:${save.id}:game:${save.game_id}:user:${session.userId}:revision:${save.revision}`;
    this.crypto.verifyIntegrity(
      save.encrypted_state,
      save.integrity_hash,
      session.dataKey,
      associatedData,
    );
    const restored = this.withClockDefaults(
      this.crypto.decryptJson<GameState>(save.encrypted_state, session.dataKey, associatedData),
    );
    const current = this.load(save.game_id);
    if (current.status === 'COMPLETED' && restored.status !== 'COMPLETED') {
      throw new DomainError('Завершённую Historical-игру нельзя продолжить', 'GAME_COMPLETED');
    }
    if (restored.mode === 'HISTORICAL' && restored.status === 'ACTIVE') {
      const realNow = this.realClock().toISOString();
      restored.clockAnchorSimulationTimestamp = restored.simulationTimestamp;
      restored.clockAnchorRealTimestamp = realNow;
    }
    restored.revision = current.revision + 1;
    restored.updatedAt = this.realClock().toISOString();
    this.saveState(restored);
    this.logger.info('save_restored', {
      userId: session.userId,
      gameId: save.game_id,
      saveId,
    });
    return restored;
  }

  removeSave(saveId: string): boolean {
    const session = this.sessions.require();
    return this.games.removeSave(saveId, session.userId);
  }

  adminMutate(gameId: string, mutation: AdminMutation): GameState {
    const state = this.load(gameId);
    if (mutation.cash) {
      state.cash = Object.fromEntries(
        Object.entries(mutation.cash).map(([currency, value]) => [
          currency.trim().toUpperCase(),
          canonicalDecimal(nonNegativeDecimal(value, 'Баланс')),
        ]),
      );
    }
    if (mutation.holdings) {
      state.holdings = mutation.holdings
        .map((holding) => ({
          instrument: holding.instrument,
          quantity: canonicalDecimal(nonNegativeDecimal(holding.quantity, 'Количество')),
          averageCost: canonicalDecimal(
            nonNegativeDecimal(holding.averageCost, 'Средняя стоимость'),
          ),
          realizedPnl: holding.realizedPnl ?? '0',
        }))
        .filter((holding) => holding.quantity !== '0');
    }
    if (mutation.simulationTimestamp) {
      if (state.mode !== 'HISTORICAL') {
        throw new ValidationError('Время можно изменить только в Historical-игре');
      }
      Object.assign(
        state,
        new SimulationClock(state, this.realClock).withTimestamp(mutation.simulationTimestamp),
      );
    }
    state.revision += 1;
    state.updatedAt = this.realClock().toISOString();
    this.saveState(state);
    this.logger.info('authorized_state_mutation', { userId: state.userId, gameId });
    return state;
  }

  private encryptGame(state: GameState, dataKey: Buffer): GameRow {
    const associatedData = this.gameAssociatedData(state.id, state.userId, state.revision);
    const encryptedState = this.crypto.encryptJson(state, dataKey, associatedData);
    return {
      id: state.id,
      user_id: state.userId,
      name: state.name,
      mode: state.mode,
      reporting_currency: state.reportingCurrency,
      simulation_timestamp: state.simulationTimestamp,
      encrypted_state: encryptedState,
      integrity_hash: this.crypto.integrity(encryptedState, dataKey, associatedData),
      revision: state.revision,
      created_at: state.createdAt,
      updated_at: state.updatedAt,
    };
  }

  private decryptGame(row: GameRow, dataKey: Buffer): GameState {
    const associatedData = this.gameAssociatedData(row.id, row.user_id, row.revision);
    this.crypto.verifyIntegrity(row.encrypted_state, row.integrity_hash, dataKey, associatedData);
    const stored = this.crypto.decryptJson<GameState>(row.encrypted_state, dataKey, associatedData);
    if (
      stored.id !== row.id ||
      stored.userId !== row.user_id ||
      stored.revision !== row.revision ||
      stored.mode !== row.mode ||
      stored.simulationTimestamp !== row.simulation_timestamp
    ) {
      throw new IntegrityError('Метаданные игры не соответствуют защищённому состоянию');
    }
    const state = this.withClockDefaults(stored);
    this.validator.validate(state);
    return state;
  }

  private readSave(row: SaveRow, dataKey: Buffer): GameState {
    const associatedData = `save:${row.id}:game:${row.game_id}:user:${row.user_id}:revision:${row.revision}`;
    this.crypto.verifyIntegrity(row.encrypted_state, row.integrity_hash, dataKey, associatedData);
    return this.withClockDefaults(
      this.crypto.decryptJson<GameState>(row.encrypted_state, dataKey, associatedData),
    );
  }

  private withClockDefaults(state: GameState): GameState {
    const realNow = this.realClock().toISOString();
    return {
      ...state,
      simulationStartTimestamp: state.simulationStartTimestamp ?? state.simulationTimestamp,
      clockAnchorSimulationTimestamp:
        state.clockAnchorSimulationTimestamp ?? state.simulationTimestamp,
      clockAnchorRealTimestamp: state.clockAnchorRealTimestamp ?? realNow,
      timeMultiplier: state.timeMultiplier ?? 1,
      status: state.status ?? 'ACTIVE',
    };
  }

  private synchronizeClock(state: GameState): GameState {
    if (state.mode !== 'HISTORICAL' || state.status === 'COMPLETED') return state;
    const snapshot = new SimulationClock(state, this.realClock).current();
    if (
      snapshot.simulationTimestamp === state.simulationTimestamp &&
      snapshot.status === state.status
    ) {
      return state;
    }
    const next = structuredClone(state);
    next.simulationTimestamp = snapshot.simulationTimestamp;
    next.status = snapshot.status;
    next.revision += 1;
    next.updatedAt = snapshot.realTimestamp;
    if (snapshot.reachedPresent) {
      next.clockAnchorSimulationTimestamp = snapshot.simulationTimestamp;
      next.clockAnchorRealTimestamp = snapshot.realTimestamp;
      next.completedAt = snapshot.realTimestamp;
      next.completionReason = 'PRESENT_REACHED';
      this.logger.info('historical_game_completed', {
        userId: state.userId,
        gameId: state.id,
      });
    }
    return this.saveState(next);
  }

  private gameAssociatedData(gameId: string, userId: string, revision: number): string {
    return `game:${gameId}:user:${userId}:revision:${revision}`;
  }
}
