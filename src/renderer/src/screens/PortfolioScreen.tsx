import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, TrendingDown, TrendingUp, WalletCards } from 'lucide-react';
import type { GameState, PortfolioSnapshot } from '../../../shared/types';
import { formatMoney, formatNumber, unwrap } from '../lib/api';

export function PortfolioScreen({
  game,
  overview = false,
}: {
  game: GameState;
  overview?: boolean;
}) {
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const portfolioKey = `${game.id}:${game.mode === 'HISTORICAL' ? (game.status === 'COMPLETED' ? 'completed' : game.simulationTimestamp.slice(0, 16)) : game.revision}`;

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setPortfolio(unwrap(await window.paperForge.trading.portfolio(portfolioKey.split(':')[0]!)));
    } finally {
      setBusy(false);
    }
  }, [portfolioKey]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!portfolio) return <div className="portfolio-loading">Рассчитываем портфель…</div>;
  return (
    <section className={overview ? 'portfolio-overview' : 'workspace-screen'}>
      {!overview && (
        <div className="screen-heading">
          <div>
            <span className="eyebrow">VIRTUAL ACCOUNT</span>
            <h2>Портфель</h2>
            <p>Оценка позиций по доступным рыночным данным.</p>
          </div>
          <button className="ghost-button" onClick={() => void load()}>
            <RefreshCw size={16} className={busy ? 'rotating' : ''} />
            Обновить
          </button>
        </div>
      )}
      <div className="metric-grid">
        <article className="metric-card accent">
          <div>
            <span>Общая стоимость</span>
            <strong>{formatMoney(portfolio.totalValue, portfolio.reportingCurrency)}</strong>
          </div>
          <WalletCards size={22} />
        </article>
        <article className="metric-card">
          <div>
            <span>Денежные средства</span>
            <strong>{formatMoney(portfolio.cashValue, portfolio.reportingCurrency)}</strong>
          </div>
          <i className="metric-dot cyan" />
        </article>
        <article className="metric-card">
          <div>
            <span>Нереализованный P&amp;L</span>
            <strong className={Number(portfolio.unrealizedPnl) >= 0 ? 'positive' : 'negative'}>
              {formatMoney(portfolio.unrealizedPnl, portfolio.reportingCurrency)}
            </strong>
          </div>
          {Number(portfolio.unrealizedPnl) >= 0 ? (
            <TrendingUp size={21} />
          ) : (
            <TrendingDown size={21} />
          )}
        </article>
        <article className="metric-card">
          <div>
            <span>Реализованный P&amp;L</span>
            <strong className={Number(portfolio.realizedPnl) >= 0 ? 'positive' : 'negative'}>
              {formatMoney(portfolio.realizedPnl, portfolio.reportingCurrency)}
            </strong>
          </div>
          <i className="metric-dot violet" />
        </article>
      </div>
      <div className="panel positions-panel">
        <div className="panel-heading">
          <h3>Открытые позиции</h3>
          <span>{portfolio.positions.length} инструментов</span>
        </div>
        <div className="positions-table">
          <div className="table-head">
            <span>Инструмент</span>
            <span>Количество</span>
            <span>Средняя</span>
            <span>Текущая</span>
            <span>Стоимость</span>
            <span>P&amp;L</span>
          </div>
          {portfolio.positions.length === 0 && (
            <div className="table-message">В портфеле пока нет активов</div>
          )}
          {portfolio.positions.map((position) => (
            <div className="position-row" key={position.instrument.id}>
              <span className="instrument-name">
                <i>{position.instrument.symbol.slice(0, 2)}</i>
                <span>
                  <strong>{position.instrument.symbol}</strong>
                  <small>{position.instrument.exchange}</small>
                </span>
              </span>
              <span>{formatNumber(position.quantity)}</span>
              <span>
                {formatNumber(position.averageCost)} {position.instrument.quoteCurrency}
              </span>
              <span>{position.currentPrice ? formatNumber(position.currentPrice) : '—'}</span>
              <span>{position.marketValue ? formatNumber(position.marketValue) : '—'}</span>
              <span className={Number(position.unrealizedPnl) >= 0 ? 'positive' : 'negative'}>
                {position.unrealizedPnl ? formatNumber(position.unrealizedPnl) : '—'}
              </span>
            </div>
          ))}
        </div>
      </div>
      {portfolio.unavailableConversions.length > 0 && (
        <div className="inline-alert neutral">
          Нет доступных FX rates для: {portfolio.unavailableConversions.join(', ')}
        </div>
      )}
    </section>
  );
}
