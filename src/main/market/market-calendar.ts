import type { Instrument } from '../../shared/types';

interface ZonedDateParts {
  year: number;
  month: number;
  day: number;
  weekday: string;
  hour: number;
  minute: number;
}

interface MarketSchedule {
  timezone: string;
  opensAt: number;
  closesAt: number;
  holiday: (parts: ZonedDateParts) => boolean;
}

function zonedParts(value: Date, timezone: string): ZonedDateParts {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(value)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday ?? '',
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function observedDate(year: number, month: number, day: number): string {
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  if (weekday === 6) date.setUTCDate(date.getUTCDate() - 1);
  if (weekday === 0) date.setUTCDate(date.getUTCDate() + 1);
  return dateKey(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number): string {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const day = 1 + ((weekday - first.getUTCDay() + 7) % 7) + (occurrence - 1) * 7;
  return dateKey(year, month, day);
}

function lastWeekday(year: number, month: number, weekday: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  const day = last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7);
  return dateKey(year, month, day);
}

function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function shiftedDate(date: Date, days: number): string {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return dateKey(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate());
}

function isUsHoliday(parts: ZonedDateParts): boolean {
  const key = dateKey(parts.year, parts.month, parts.day);
  const easter = easterSunday(parts.year);
  const holidays = new Set([
    observedDate(parts.year, 1, 1),
    observedDate(parts.year + 1, 1, 1),
    nthWeekday(parts.year, 1, 1, 3),
    nthWeekday(parts.year, 2, 1, 3),
    shiftedDate(easter, -2),
    lastWeekday(parts.year, 5, 1),
    observedDate(parts.year, 6, 19),
    observedDate(parts.year, 7, 4),
    nthWeekday(parts.year, 9, 1, 1),
    nthWeekday(parts.year, 11, 4, 4),
    observedDate(parts.year, 12, 25),
  ]);
  return holidays.has(key);
}

function isUkHoliday(parts: ZonedDateParts): boolean {
  const key = dateKey(parts.year, parts.month, parts.day);
  const easter = easterSunday(parts.year);
  const holidays = new Set([
    observedDate(parts.year, 1, 1),
    shiftedDate(easter, -2),
    shiftedDate(easter, 1),
    nthWeekday(parts.year, 5, 1, 1),
    lastWeekday(parts.year, 5, 1),
    lastWeekday(parts.year, 8, 1),
    observedDate(parts.year, 12, 25),
    observedDate(parts.year, 12, 26),
  ]);
  return holidays.has(key);
}

function isRussianHoliday(parts: ZonedDateParts): boolean {
  if (parts.month === 1 && parts.day <= 8) return true;
  return new Set(['02-23', '03-08', '05-01', '05-09', '06-12', '11-04']).has(
    `${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`,
  );
}

function isEuropeanHoliday(parts: ZonedDateParts): boolean {
  const key = dateKey(parts.year, parts.month, parts.day);
  const easter = easterSunday(parts.year);
  return new Set([
    dateKey(parts.year, 1, 1),
    shiftedDate(easter, -2),
    shiftedDate(easter, 1),
    dateKey(parts.year, 5, 1),
    dateKey(parts.year, 12, 25),
    dateKey(parts.year, 12, 26),
  ]).has(key);
}

function neverHoliday(): boolean {
  return false;
}

export class MarketCalendar {
  isOpen(instrument: Instrument, at: Date): boolean {
    if (!instrument.tradable || Number.isNaN(at.getTime())) return false;
    if (instrument.assetClass === 'CRYPTO') return true;
    if (instrument.assetClass === 'FOREX') return this.isForexOpen(at);
    const schedule = this.schedule(instrument);
    const parts = zonedParts(at, schedule.timezone);
    if (parts.weekday === 'Sat' || parts.weekday === 'Sun' || schedule.holiday(parts)) {
      return false;
    }
    const minute = parts.hour * 60 + parts.minute;
    return minute >= schedule.opensAt && minute < schedule.closesAt;
  }

  private isForexOpen(at: Date): boolean {
    const parts = zonedParts(at, 'America/New_York');
    const minute = parts.hour * 60 + parts.minute;
    if (parts.weekday === 'Sat') return false;
    if (parts.weekday === 'Fri' && minute >= 17 * 60) return false;
    if (parts.weekday === 'Sun' && minute < 17 * 60) return false;
    return true;
  }

  private schedule(instrument: Instrument): MarketSchedule {
    const exchange = instrument.exchange.toUpperCase();
    if (exchange.includes('MOEX')) {
      return {
        timezone: 'Europe/Moscow',
        opensAt: 9 * 60 + 50,
        closesAt: 23 * 60 + 50,
        holiday: isRussianHoliday,
      };
    }
    if (['NASDAQ', 'NYSE', 'NYSEARCA', 'NYSEAMERICAN'].some((value) => exchange.includes(value))) {
      return {
        timezone: 'America/New_York',
        opensAt: 9 * 60 + 30,
        closesAt: 16 * 60,
        holiday: isUsHoliday,
      };
    }
    if (exchange.includes('LSE') || instrument.timezone === 'Europe/London') {
      return {
        timezone: 'Europe/London',
        opensAt: 8 * 60,
        closesAt: 16 * 60 + 30,
        holiday: isUkHoliday,
      };
    }
    if (exchange.includes('CYPRUS') || instrument.timezone === 'Europe/Nicosia') {
      return {
        timezone: 'Europe/Nicosia',
        opensAt: 10 * 60 + 15,
        closesAt: 17 * 60 + 20,
        holiday: isEuropeanHoliday,
      };
    }
    if (
      ['XETRA', 'FRANKFURT', 'GER'].some((value) => exchange.includes(value)) ||
      instrument.timezone === 'Europe/Berlin'
    ) {
      return {
        timezone: 'Europe/Berlin',
        opensAt: 9 * 60,
        closesAt: 17 * 60 + 30,
        holiday: isEuropeanHoliday,
      };
    }
    return {
      timezone: instrument.timezone || 'UTC',
      opensAt: 9 * 60,
      closesAt: 17 * 60,
      holiday: neverHoliday,
    };
  }
}
