import type { GameState } from '../../../shared/types';
import { formatDate, formatNumber } from '../lib/api';

export function HistoryScreen({ game }: { game: GameState }) {
  return (
    <section className="workspace-screen">
      <div className="screen-heading">
        <div>
          <span className="eyebrow">AUDIT TRAIL</span>
          <h2>История сделок</h2>
          <p>Структурированный журнал виртуальных операций.</p>
        </div>
        <span className="count-chip">{game.trades.length}</span>
      </div>
      <div className="panel trade-history">
        <div className="table-head">
          <span>Время симуляции</span>
          <span>Инструмент</span>
          <span>Операция</span>
          <span>Количество</span>
          <span>Цена</span>
          <span>Сумма</span>
        </div>
        {game.trades.length === 0 && <div className="table-message">Сделок пока нет</div>}
        {[...game.trades].reverse().map((trade) => (
          <div className="trade-row" key={trade.id}>
            <span>{formatDate(trade.simulationTimestamp)}</span>
            <span className="instrument-name">
              <i>{trade.instrument.symbol.slice(0, 2)}</i>
              <span>
                <strong>{trade.instrument.symbol}</strong>
                <small>{trade.instrument.exchange}</small>
              </span>
            </span>
            <span>
              <em className={`side-chip ${trade.side.toLowerCase()}`}>{trade.side}</em>
            </span>
            <span>{formatNumber(trade.quantity)}</span>
            <span>
              {formatNumber(trade.executionPrice)} {trade.transactionCurrency}
            </span>
            <span>
              {formatNumber(Number(trade.quantity) * Number(trade.executionPrice))}{' '}
              {trade.transactionCurrency}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
