import type { GameMode } from '../../shared/types';
import { ValidationError } from './errors';

export class SimulationClock {
  private historicalTimestamp: Date | null;

  constructor(
    readonly mode: GameMode,
    timestamp: string,
    private readonly realClock: () => Date = () => new Date(),
  ) {
    const parsed = new Date(timestamp);
    if (Number.isNaN(parsed.getTime())) {
      throw new ValidationError('Некорректное время симуляции');
    }
    this.historicalTimestamp = mode === 'HISTORICAL' ? parsed : null;
  }

  now(): Date {
    return this.mode === 'LIVE' ? this.realClock() : new Date(this.historicalTimestamp!);
  }

  nowIso(): string {
    return this.now().toISOString();
  }

  set(timestamp: string): void {
    if (this.mode !== 'HISTORICAL') {
      throw new ValidationError('Время LIVE-игры определяется системными часами');
    }
    const next = new Date(timestamp);
    if (Number.isNaN(next.getTime())) {
      throw new ValidationError('Некорректное время симуляции');
    }
    this.historicalTimestamp = next;
  }

  advance(milliseconds: number): void {
    if (this.mode !== 'HISTORICAL' || milliseconds < 0 || !Number.isFinite(milliseconds)) {
      throw new ValidationError('Некорректное изменение времени симуляции');
    }
    this.historicalTimestamp = new Date(this.historicalTimestamp!.getTime() + milliseconds);
  }

  allows(timestamp: string): boolean {
    const candidate = new Date(timestamp);
    return !Number.isNaN(candidate.getTime()) && candidate.getTime() <= this.now().getTime();
  }

  filterAllowed<T extends { timestamp: string }>(values: T[]): T[] {
    return values.filter((value) => this.allows(value.timestamp));
  }
}
