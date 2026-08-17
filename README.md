# PaperForge

PaperForge — локальный desktop-симулятор торговли на реальных рыночных данных с полностью виртуальным счётом. Приложение не является брокером, не подключается к brokerage account и не отправляет реальные заявки на биржи.

Текущая версия: `1.0.1-alpha`.

## Возможности

- локальные аккаунты с уникальными normalized usernames;
- password hashing через Argon2id;
- независимые Live и Historical игры;
- движущиеся Historical-симуляции со скоростью от `1x` до `1000x`;
- неограниченное программным лимитом количество encrypted saves;
- виртуальная покупка и продажа акций, криптовалют и валютных инструментов;
- круглосуточная виртуальная торговля всеми поддерживаемыми активами;
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

## Установка и запуск

- Windows 10 или Windows 11;
- подключение к интернету во время первой подготовки.

1. Скачайте или клонируйте репозиторий.
2. При первом запуске дважды нажмите `Нажми на меня перед запуском.bat`.
3. Дождитесь сообщения об успешной подготовке.
4. Дважды нажмите `Запустить PaperForge.bat`.

Подготовительный файл сам скачивает проверенный portable `Node.js 24.19.0` внутрь проекта, устанавливает `pnpm 11.19.0` и зависимости из `package.json` и `pnpm-lock.yaml`. Системная установка Node.js, pnpm, IDE, compiler и ручная сборка `.exe` обычному пользователю не нужны.

Повторный запуск `Нажми на меня перед запуском.bat` безопасен: он проверяет runtime и приводит зависимости к текущему lockfile без создания отдельного окружения при каждом запуске.

## Команды для разработчика

После подготовки доступны стандартные команды:

```powershell
pnpm dev
pnpm build
pnpm start
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

Каждая Historical-игра имеет единый `SimulationClock`. После старта выбранная дата и время автоматически движутся вперёд. Скорость `1x` соответствует обычному течению времени: одна реальная секунда равна одной секунде симуляции.

Во время игры можно выбрать только один из поддерживаемых множителей: `1x`, `5x`, `10x`, `15x`, `20x`, `50x`, `100x` или `1000x`. Смена скорости продолжается от текущего времени без сброса игры и без скачка назад. Выбранная скорость и состояние часов сохраняются в encrypted saves.

Market service передаёт provider текущую точку времени и повторно отбрасывает любые quotes и candles, timestamp которых превышает simulation timestamp. Тот же boundary применяется к cache, charts и virtual trade execution. SimulationClock непрерывно проходит ночи, weekends и holidays на выбранной скорости.

Historical-игра никогда не переходит в будущее. При достижении текущей реальной даты и времени часы останавливаются, игра отмечается как завершённая, а финальный портфель и история остаются доступны для просмотра.

Historical Mode показывает только реально доступные provider data. PaperForge не генерирует вымышленные production quotes, если источник не предоставил данные для выбранного рынка или периода.

## Защита локальных данных

Пароль обрабатывается Argon2id. Для каждого пользователя создаётся случайный data key, который оборачивается ключом, производным от пароля. Состояние игр, saves, trade payloads и provider secrets защищаются AES-256-GCM. Дополнительный HMAC-SHA-256 integrity layer связывает ciphertext с идентификатором пользователя, сущности и revision.

SQLite работает в WAL-режиме с foreign keys, full synchronous writes и транзакциями для операций с cash, holdings и trade history.

Локальное open-source приложение не может гарантировать абсолютную защиту от владельца компьютера, который модифицирует сам исполняемый код. Реализованная модель предназначена для защиты обычных пользовательских данных и обнаружения ручного изменения storage.

## Ограничения `1.0.1-alpha`

- бесплатный MOEX ISS не гарантирует true realtime для неавторизованного клиента;
- базовый каталог глобальных equities доступен через Yahoo Finance без API key, а расширенный каталог equities и FX через Twelve Data зависит от подписки;
- доступность акций Кипра определяется фактическим каталогом подключённого глобального provider;
- доступность и свежесть последней реальной котировки зависят от provider data;
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

Все сделки в PaperForge являются симуляцией и доступны круглосуточно в Live и Historical Mode. Закрытие настоящей биржи не блокирует виртуальную покупку или продажу: PaperForge использует последнюю доступную реальную котировку и не придумывает новые цены между обновлениями рынка. Если корректной котировки нет вообще, сделка не выполняется.

В Historical Mode цена всегда берётся только из данных, timestamp которых не превышает текущее время SimulationClock. Не используйте приложение как источник инвестиционных рекомендаций или как средство исполнения реальных финансовых операций.
