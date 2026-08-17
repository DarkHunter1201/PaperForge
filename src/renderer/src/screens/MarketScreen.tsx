import { useEffect, useState } from 'react';
import { Bitcoin, Building2, Search, TrendingUp } from 'lucide-react';
import type { AssetClass, GameState, Instrument } from '../../../shared/types';
import { unwrap } from '../lib/api';

const filters: Array<{ value?: AssetClass; label: string; icon: typeof TrendingUp }> = [
  { label: 'Все', icon: TrendingUp },
  { value: 'EQUITY', label: 'Акции', icon: Building2 },
  { value: 'CRYPTO', label: 'Крипто', icon: Bitcoin },
  { value: 'FOREX', label: 'Валюты', icon: TrendingUp },
];

export function MarketScreen({
  game,
  onSelect,
}: {
  game: GameState;
  onSelect: (instrument: Instrument) => void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AssetClass | undefined>();
  const [results, setResults] = useState<Instrument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (query.trim().length < 1) {
      setResults([]);
      return;
    }
    const timeout = window.setTimeout(async () => {
      setBusy(true);
      setError('');
      try {
        setResults(unwrap(await window.paperForge.market.search(query, filter)));
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : 'Поиск недоступен');
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => window.clearTimeout(timeout);
  }, [query, filter]);

  return (
    <section className="workspace-screen">
      <div className="screen-heading">
        <div>
          <span className="eyebrow">MARKET DISCOVERY</span>
          <h2>Обзор рынков</h2>
          <p>Каталог формируется подключёнными поставщиками данных.</p>
        </div>
        <span className={`mode-badge ${game.mode.toLowerCase()}`}>{game.mode}</span>
      </div>
      <div className="market-search-panel">
        <div className="search-box">
          <Search size={20} />
          <input
            placeholder="Тикер, название, биржа…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>⌘ K</kbd>
        </div>
        <div className="filter-row">
          {filters.map((item) => (
            <button
              key={item.label}
              className={filter === item.value ? 'active' : ''}
              onClick={() => setFilter(item.value)}
            >
              <item.icon size={15} />
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {error && <div className="inline-alert">{error}</div>}
      <div className="instrument-table panel">
        <div className="table-head">
          <span>Инструмент</span>
          <span>Класс</span>
          <span>Рынок</span>
          <span>Валюта</span>
          <span>Данные</span>
          <span />
        </div>
        {busy && <div className="table-message">Получаем каталог…</div>}
        {!busy && query && results.length === 0 && (
          <div className="table-message">Инструменты не найдены</div>
        )}
        {!query && (
          <div className="market-placeholder">
            <Search size={28} />
            <strong>Найдите доступный инструмент</strong>
            <span>
              Поиск выполняется по каталогам MOEX, Yahoo Finance, Binance и настроенных глобальных
              providers.
            </span>
          </div>
        )}
        {results.map((instrument) => (
          <button
            className="instrument-row"
            key={instrument.id}
            onClick={() => onSelect(instrument)}
          >
            <span className="instrument-name">
              <i>{instrument.symbol.slice(0, 2)}</i>
              <span>
                <strong>{instrument.symbol}</strong>
                <small>{instrument.name}</small>
              </span>
            </span>
            <span>{instrument.assetClass}</span>
            <span>{instrument.exchange}</span>
            <span>{instrument.quoteCurrency}</span>
            <span>
              <em
                className={`quality ${instrument.dataTimeliness.toLowerCase().replace('_', '-')}`}
              >
                {instrument.dataTimeliness.replace('_', ' ')}
              </em>
            </span>
            <span>→</span>
          </button>
        ))}
      </div>
    </section>
  );
}
