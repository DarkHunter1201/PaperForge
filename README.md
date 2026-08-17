# PaperForge

PaperForge — локальный desktop-симулятор торговли на реальных рыночных данных с полностью виртуальным счётом. Приложение не является брокером, не подключается к brokerage account и не отправляет реальные заявки на биржи.

Текущая версия: `1.0.0-alpha`.

## Возможности

- локальные аккаунты с уникальными normalized usernames;
- password hashing через Argon2id;
- независимые Live и Historical игры;
- неограниченное программным лимитом количество encrypted saves;
- виртуальная покупка и продажа акций, криптовалют и валютных инструментов;
- decimal financial arithmetic;
- cash balances, holdings, average cost, realized и unrealized P&L;
- поиск инструментов по каталогам Market Data Providers;
- котировки и candlestick charts;
- живые часы Live-симуляции без остановки на времени запуска;
- автоматическая конвертация валюты виртуального счёта по официальному курсу Банка России;
- полное удаление аккаунта и всех связанных игр, состояний, позиций, сделок и настроек;
- строгая фильтрация future data в Historical Mode;
- централизованный локальный DATA_ROOT;
- authenticated encryption и integrity validation состояния;
- транзакционная запись виртуальных сделок.

## Требования

- Windows 10 или Windows 11;
- Node.js 24;
- pnpm 11.

## Установка и запуск

```powershell
git clone https://github.com/DarkHunter1201/PaperForge.git
cd PaperForge
pnpm install
pnpm dev
```

Production build:

```powershell
pnpm build
pnpm start
```

Portable Windows package:

```powershell
pnpm dist
```

## Проверки

```powershell
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
```

Полная проверка:

```powershell
pnpm check
```

## Market Data Providers

### MOEX ISS

Работает без API key. Предоставляет каталог инструментов Московской биржи, котировки и candles. Для неавторизованного доступа текущие market data могут публиковаться с задержкой, а глубина historical data зависит от политики и доступности MOEX ISS.

### Binance Spot Public Data

Работает без API key через public market-data endpoint. Предоставляет полный доступный spot catalog, актуальные котировки и historical klines. Доступность зависит от сети, региональных ограничений и политики Binance.

### Yahoo Finance

Работает без API key. Используется для поиска и виртуальной торговли глобальными акциями, включая Apple (`AAPL`), а также для delayed quotes и historical candles. Доступность и состав данных зависят от публичных endpoint и политики Yahoo Finance.

### Twelve Data

Требует API key. Используется как расширяемый глобальный provider для акций США, Великобритании и Кипра, мировых валют, crypto и historical data. Фактические биржи, realtime/delayed режим, глубина истории и rate limits определяются тарифным планом Twelve Data.

API key настраивается после входа на экране `Настройки`. Он хранится в зашифрованном пользовательском storage. Альтернативно ключ можно передать через environment variable:

```powershell
$env:TWELVE_DATA_API_KEY = "your_key"
pnpm dev
```

Ключи нельзя добавлять в Git.

### Официальные валютные курсы

Если валюта виртуального счёта отличается от валюты инструмента, PaperForge автоматически конвертирует необходимую сумму по последнему доступному официальному курсу Банка России. Для кросс-курсов используется рублёвая база официального XML-сервиса Банка России.

## DATA_ROOT

По умолчанию development runtime хранит все данные в:

```text
<project>/.paperforge
```

Структура включает:

```text
.paperforge/database
.paperforge/saves
.paperforge/cache
.paperforge/market-data
.paperforge/logs
.paperforge/temp
.paperforge/config
.paperforge/security
```

Для переноса единого storage можно определить:

```powershell
$env:PAPERFORGE_DATA_ROOT = "D:\PaperForgeData"
```

Runtime storage, databases, saves, logs, cache, secrets и ключевой материал исключены из Git.

## Historical Mode

Каждая Historical игра имеет единый `SimulationClock`. Market service передаёт provider точку времени, а затем повторно отбрасывает любые quotes и candles, timestamp которых превышает simulation timestamp. Такой же boundary применяется к cache и virtual trade execution.

Historical Mode показывает только реально доступные provider data. PaperForge не генерирует вымышленные production quotes, если источник не предоставил данные для выбранного рынка или периода.

## Защита локальных данных

Пароль обрабатывается Argon2id. Для каждого пользователя создаётся случайный data key, который оборачивается ключом, производным от пароля. Состояние игр, saves, trade payloads и provider secrets защищаются AES-256-GCM. Дополнительный HMAC-SHA-256 integrity layer связывает ciphertext с идентификатором пользователя, сущности и revision.

SQLite работает в WAL-режиме с foreign keys, full synchronous writes и транзакциями для операций с cash, holdings и trade history.

Локальное open-source приложение не может гарантировать абсолютную защиту от владельца компьютера, который модифицирует сам исполняемый код. Реализованная модель предназначена для защиты обычных пользовательских данных и обнаружения ручного изменения storage.

## Ограничения `1.0.0-alpha`

- бесплатный MOEX ISS не гарантирует true realtime для неавторизованного клиента;
- базовый каталог глобальных equities доступен через Yahoo Finance без API key, а расширенный каталог equities и FX через Twelve Data зависит от подписки;
- доступность акций Кипра определяется фактическим каталогом подключённого глобального provider;
- market holidays, trading halts и точный market-open status используются только тогда, когда provider возвращает соответствующую информацию;
- PaperForge не обходит лицензии, paywalls, region restrictions или provider rate limits;
- production path не использует test fixtures или синтетические котировки.

## Архитектура

```text
src/main/application      use cases и транзакционные services
src/main/domain           SimulationClock, trading и portfolio engines
src/main/market           provider abstraction и integrations
src/main/security         Argon2id, encryption, integrity и sessions
src/main/storage          SQLite repositories и market cache
src/main/infrastructure   DATA_ROOT и logging
src/preload               изолированный IPC bridge
src/renderer              React desktop trading terminal
src/shared                IPC contracts и domain DTO
tests                     domain, integration и security tests
```

Market Data и Trading Simulation разделены. Provider integrations только читают внешние данные. Изменения cash, holdings, saves и trade history выполняются локальными application services.

## Логи

Диагностические JSONL-логи находятся в `.paperforge/logs`. Пароли, API keys, encryption keys и authentication material в логи не записываются.

## Виртуальная торговля

Все сделки в PaperForge являются симуляцией. Не используйте приложение как источник инвестиционных рекомендаций или как средство исполнения реальных финансовых операций.
