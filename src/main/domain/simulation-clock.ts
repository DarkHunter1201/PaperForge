import {
  HISTORICAL_TIME_MULTIPLIERS,
  type GameMode,
  type GameStatus,
  type HistoricalTimeMultiplier,
} from '../../shared/types';
import { DomainError, ValidationError } from './errors';

export interface SimulationClockSource {
  mode: GameMode;
  simulationStartTimestamp: string;
  simulationTimestamp: string;
  clockAnchorSimulationTimestamp: string;
  clockAnchorRealTimestamp: string;
  timeMultiplier: HistoricalTimeMultiplier;
  status: GameStatus;
}

export interface SimulationClockSnapshot {
  simulationTimestamp: string;
  realTimestamp: string;
  status: GameStatus;
  reachedPresent: boolean;
}

export interface SimulationClockUpdate {
  simulationTimestamp: string;
  clockAnchorSimulationTimestamp: string;
  clockAnchorRealTimestamp: string;
  timeMultiplier: HistoricalTimeMultiplier;
  status: GameStatus;
}

function timestamp(value: string, field: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError(`Некорректное поле ${field}`);
  return parsed;
}

export function isHistoricalTimeMultiplier(value: number): value is HistoricalTimeMultiplier {
  return HISTORICAL_TIME_MULTIPLIERS.some((multiplier) => multiplier === value);
}

export class SimulationClock {
  constructor(
    private readonly source: SimulationClockSource,
    private readonly realClock: () => Date = () => new Date(),
  ) {
    this.validate();
  }

  current(): SimulationClockSnapshot {
    const realNow = this.realClock();
    if (Number.isNaN(realNow.getTime())) throw new ValidationError('Некорректное системное время');
    if (this.source.mode === 'LIVE') {
      return {
        simulationTimestamp: realNow.toISOString(),
        realTimestamp: realNow.toISOString(),
        status: 'ACTIVE',
        reachedPresent: false,
      };
    }
    if (this.source.status === 'COMPLETED') {
      return {
        simulationTimestamp: this.source.simulationTimestamp,
        realTimestamp: realNow.toISOString(),
        status: 'COMPLETED',
        reachedPresent: true,
      };
    }
    const anchorSimulation = timestamp(
      this.source.clockAnchorSimulationTimestamp,
      'clockAnchorSimulationTimestamp',
    );
    const anchorReal = timestamp(this.source.clockAnchorRealTimestamp, 'clockAnchorRealTimestamp');
    const elapsedReal = Math.max(0, realNow.getTime() - anchorReal.getTime());
    const projected = anchorSimulation.getTime() + elapsedReal * this.source.timeMultiplier;
    const reachedPresent = projected >= realNow.getTime();
    const simulationTime = reachedPresent ? realNow.getTime() : projected;
    return {
      simulationTimestamp: new Date(simulationTime).toISOString(),
      realTimestamp: realNow.toISOString(),
      status: reachedPresent ? 'COMPLETED' : 'ACTIVE',
      reachedPresent,
    };
  }

  withMultiplier(multiplier: number): SimulationClockUpdate {
    if (this.source.mode !== 'HISTORICAL') {
      throw new ValidationError('Множитель доступен только в Historical Mode');
    }
    if (!isHistoricalTimeMultiplier(multiplier)) {
      throw new ValidationError('Недопустимый множитель времени');
    }
    const snapshot = this.current();
    if (snapshot.status === 'COMPLETED') {
      throw new DomainError('Завершённую Historical-игру нельзя продолжить', 'GAME_COMPLETED');
    }
    return {
      simulationTimestamp: snapshot.simulationTimestamp,
      clockAnchorSimulationTimestamp: snapshot.simulationTimestamp,
      clockAnchorRealTimestamp: snapshot.realTimestamp,
      timeMultiplier: multiplier,
      status: 'ACTIVE',
    };
  }

  withTimestamp(value: string): SimulationClockUpdate {
    if (this.source.mode !== 'HISTORICAL') {
      throw new ValidationError('Время LIVE-игры определяется системными часами');
    }
    if (this.source.status === 'COMPLETED') {
      throw new DomainError('Завершённую Historical-игру нельзя продолжить', 'GAME_COMPLETED');
    }
    const next = timestamp(value, 'simulationTimestamp');
    const realNow = this.realClock();
    if (next.getTime() >= realNow.getTime()) {
      throw new ValidationError('Historical-время должно находиться в прошлом');
    }
    return {
      simulationTimestamp: next.toISOString(),
      clockAnchorSimulationTimestamp: next.toISOString(),
      clockAnchorRealTimestamp: realNow.toISOString(),
      timeMultiplier: this.source.timeMultiplier,
      status: 'ACTIVE',
    };
  }

  allows(value: string, boundary = this.current().simulationTimestamp): boolean {
    const candidate = new Date(value);
    const currentBoundary = new Date(boundary);
    return (
      !Number.isNaN(candidate.getTime()) &&
      !Number.isNaN(currentBoundary.getTime()) &&
      candidate.getTime() <= currentBoundary.getTime()
    );
  }

  filterAllowed<T extends { timestamp: string }>(
    values: T[],
    boundary = this.current().simulationTimestamp,
  ): T[] {
    return values.filter((value) => this.allows(value.timestamp, boundary));
  }

  private validate(): void {
    timestamp(this.source.simulationStartTimestamp, 'simulationStartTimestamp');
    timestamp(this.source.simulationTimestamp, 'simulationTimestamp');
    timestamp(this.source.clockAnchorSimulationTimestamp, 'clockAnchorSimulationTimestamp');
    timestamp(this.source.clockAnchorRealTimestamp, 'clockAnchorRealTimestamp');
    if (!isHistoricalTimeMultiplier(this.source.timeMultiplier)) {
      throw new ValidationError('Недопустимый множитель времени');
    }
    if (this.source.mode === 'LIVE' && this.source.status === 'COMPLETED') {
      throw new ValidationError('Live-игра не может быть завершена Historical clock');
    }
  }
}
