import Decimal from 'decimal.js';
import { ValidationError } from './errors';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });

export function decimal(value: string | number): Decimal {
  let result: Decimal;
  try {
    result = new Decimal(value);
  } catch {
    throw new ValidationError('Некорректное числовое значение');
  }
  if (!result.isFinite()) {
    throw new ValidationError('Числовое значение должно быть конечным');
  }
  return result;
}

export function positiveDecimal(value: string, fieldName: string): Decimal {
  const result = decimal(value);
  if (!result.isPositive()) {
    throw new ValidationError(`${fieldName} должно быть больше нуля`);
  }
  return result;
}

export function nonNegativeDecimal(value: string, fieldName: string): Decimal {
  const result = decimal(value);
  if (result.isNegative()) {
    throw new ValidationError(`${fieldName} не может быть отрицательным`);
  }
  return result;
}

export function canonicalDecimal(value: Decimal): string {
  return value.toSignificantDigits(32).toFixed();
}
