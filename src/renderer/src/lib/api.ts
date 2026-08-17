import type { ApiResult } from '../../../shared/types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok || result.data === undefined) {
    throw new ApiError(result.error || 'Операция не выполнена', result.code);
  }
  return result.data;
}

export function formatMoney(value: string | number, currency: string): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(number);
}

export function formatNumber(value: string | number, maximumFractionDigits = 8): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits }).format(number);
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
