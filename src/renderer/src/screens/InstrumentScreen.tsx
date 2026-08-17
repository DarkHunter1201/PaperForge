import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, ShieldCheck } from 'lucide-react';
import type {
  Candle,
  CandleInterval,
  GameState,
  Instrument,
  Quote,
  TradeSide,
} from '../../../shared/types';
import { PriceChart } from '../components/PriceChart';
import { formatDate, formatNumber, unwrap } from '../lib/api';

export function InstrumentScreen({
  game,
  instrument,
  onBack,
  onGameChange,
}: {
  game: GameState;
  instrument: Instrument;
  onBack: () => void;
  onGameChange: (game: GameState) => void;
}) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [interval, setInterval] = useState<CandleInterval>('15m');
  const [side, setSide] = useState<TradeSide>('BUY');
  const [quantity, setQuantity] = useState('1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const marketTimeKey =
    game.mode === 'HISTORICAL' ? game.simulationTimestamp.slice(0, 16) : game.revision.toString();

  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const [nextQuote, nextCandles] = await Promise.all([
        window.paperForge.market.quote(game.id, instrument),
        window.paperForge.market.candles(game.id, instrument, interval, 240),
      ]);
      setQuote(unwrap(nextQuote));
      setCandles(unwrap(nextCandles));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Рыночные данные недоступны');
    } finally {
      setBusy(false);
    }
  }, [game.id, instrument, interval]);

  useEffect(() => {
    void load();
  }, [load, marketTimeKey]);

  const execute = async () => {
    setBusy(true);
    setError('');
    try {
      const next = unwrap(
        await window.paperForge.trading.execute({ gameId: game.id, instrument, side, quantity }),
      );
      onGameChange(next);
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Сделка не выполнена');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="workspace-screen instrument-screen">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} />
        Назад к рынкам
      </button>
      <div className="instrument-header">
        <div className="instrument-identity">
          <i>{instrument.symbol.slice(0, 2)}</i>
          <div>
            <span>
              {instrument.exchange} · {instrument.assetClass}
            </span>
            <h2>{instrument.symbol}</h2>
            <p>{instrument.name}</p>
          </div>
        </div>
        <div className="quote-block">
          <small>{quote?.dataTimeliness.replace('_', ' ') || 'MARKET DATA'}</small>
          <strong>
            {quote ? formatNumber(quote.price) : '—'} <em>{instrument.quoteCurrency}</em>
          </strong>
          <span>{quote ? formatDate(quote.timestamp) : 'Ожидание котировки'}</span>
        </div>
      </div>
      {error && <div className="inline-alert">{error}</div>}
      <div className="instrument-layout">
        <div className="chart-panel panel">
          <div className="panel-toolbar">
            <div className="interval-tabs">
              {(['1m', '5m', '15m', '1h', '1d'] as CandleInterval[]).map((value) => (
                <button
                  key={value}
                  className={interval === value ? 'active' : ''}
                  onClick={() => setInterval(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            <button className="icon-button" onClick={() => void load()}>
              <RefreshCw size={16} className={busy ? 'rotating' : ''} />
            </button>
          </div>
          {candles.length > 0 ? (
            <PriceChart candles={candles} />
          ) : (
            <div className="chart-empty">Нет свечей для выбранного периода</div>
          )}
        </div>
        <aside className="trade-ticket panel">
          <span className="eyebrow">VIRTUAL ORDER</span>
          <h3>Новая сделка</h3>
          <div className="trade-side">
            <button className={side === 'BUY' ? 'buy active' : ''} onClick={() => setSide('BUY')}>
              Купить
            </button>
            <button
              className={side === 'SELL' ? 'sell active' : ''}
              onClick={() => setSide('SELL')}
            >
              Продать
            </button>
          </div>
          <label>
            <span>Количество</span>
            <input
              value={quantity}
              inputMode="decimal"
              onChange={(event) => setQuantity(event.target.value)}
            />
          </label>
          <div className="ticket-summary">
            <div>
              <span>Рыночная цена</span>
              <strong>
                {quote ? `${formatNumber(quote.price)} ${instrument.quoteCurrency}` : '—'}
              </strong>
            </div>
            <div>
              <span>Ориентировочно</span>
              <strong>
                {quote
                  ? `${formatNumber(Number(quote.price) * Number(quantity))} ${instrument.quoteCurrency}`
                  : '—'}
              </strong>
            </div>
          </div>
          <button
            className={`execute-button ${side.toLowerCase()}`}
            disabled={busy || !quote || game.status === 'COMPLETED'}
            onClick={() => void execute()}
          >
            {busy
              ? 'Обработка…'
              : game.status === 'COMPLETED'
                ? 'Симуляция завершена'
                : side === 'BUY'
                  ? 'Купить виртуально'
                  : 'Продать виртуально'}
          </button>
          {quote && !quote.tradable && (
            <p className="market-status-note">
              Биржа закрыта · используется последняя доступная котировка
            </p>
          )}
          {game.reportingCurrency !== instrument.quoteCurrency && (
            <p className="conversion-note">
              Средства автоматически конвертируются по последнему доступному официальному курсу
              Банка России
            </p>
          )}
          <p className="virtual-note">
            <ShieldCheck size={15} />
            Заявка изменяет только локальный виртуальный счёт
          </p>
        </aside>
      </div>
    </section>
  );
}
