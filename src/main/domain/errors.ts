export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class AuthenticationError extends DomainError {
  constructor(message = 'Неверное имя пользователя или пароль') {
    super(message, 'AUTHENTICATION_FAILED');
  }
}

export class IntegrityError extends DomainError {
  constructor(message = 'Целостность защищённых данных нарушена') {
    super(message, 'INTEGRITY_FAILED');
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_FAILED');
  }
}

export class MarketDataError extends DomainError {
  constructor(message: string, code = 'MARKET_DATA_UNAVAILABLE') {
    super(message, code);
  }
}
