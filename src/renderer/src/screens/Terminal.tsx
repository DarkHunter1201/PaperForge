import { useCallback, useEffect, useState } from 'react';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  BriefcaseBusiness,
  ChevronDown,
  Clock3,
  Database,
  LayoutDashboard,
  LogOut,
  Search,
  Settings,
  Wifi,
} from 'lucide-react';
import type { GameState, Instrument, SessionInfo } from '../../../shared/types';
import { HISTORICAL_TIME_MULTIPLIERS } from '../../../shared/types';
import { Logo } from '../components/Logo';
import { unwrap } from '../lib/api';
import { useSecretSequence } from '../hooks/useSecretSequence';
import { AdminPanel } from './AdminPanel';
import { HistoryScreen } from './HistoryScreen';
import { InstrumentScreen } from './InstrumentScreen';
import { MarketScreen } from './MarketScreen';
import { PortfolioScreen } from './PortfolioScreen';
import { SavesScreen } from './SavesScreen';
import { SettingsScreen } from './SettingsScreen';

type Navigation = 'overview' | 'market' | 'portfolio' | 'history' | 'saves' | 'settings';

const navigation = [
  { id: 'overview' as const, label: 'Обзор', icon: LayoutDashboard },
  { id: 'market' as const, label: 'Рынки', icon: BarChart3 },
  { id: 'portfolio' as const, label: 'Портфель', icon: BriefcaseBusiness },
  { id: 'history' as const, label: 'Сделки', icon: BookOpen },
  { id: 'saves' as const, label: 'Сохранения', icon: Database },
  { id: 'settings' as const, label: 'Настройки', icon: Settings },
];

export function Terminal({
  session,
  initialGame,
  onExit,
  onLogout,
}: {
  session: SessionInfo;
  initialGame: GameState;
  onExit: () => void;
  onLogout: () => void;
}) {
  const [game, setGame] = useState(initialGame);
  const [active, setActive] = useState<Navigation>('overview');
  const [instrument, setInstrument] = useState<Instrument | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [liveTimestamp, setLiveTimestamp] = useState(() => new Date().toISOString());
  const openAdmin = useCallback(() => setAdminOpen(true), []);
  useSecretSequence(true, openAdmin);

  useEffect(() => {
    if (game.mode !== 'LIVE') return;
    setLiveTimestamp(new Date().toISOString());
    const timer = window.setInterval(() => setLiveTimestamp(new Date().toISOString()), 1000);
    return () => window.clearInterval(timer);
  }, [game.mode]);

  useEffect(() => {
    if (game.mode !== 'HISTORICAL' || game.status === 'COMPLETED') return;
    let disposed = false;
    let syncing = false;
    const synchronize = async () => {
      if (syncing) return;
      syncing = true;
      try {
        let next = unwrap(await window.paperForge.games.syncClock(game.id));
        if (next.status === 'COMPLETED' && !next.finalPortfolio) {
          unwrap(await window.paperForge.trading.portfolio(game.id));
          next = unwrap(await window.paperForge.games.load(game.id));
        }
        if (!disposed) setGame(next);
      } finally {
        syncing = false;
      }
    };
    void synchronize();
    const timer = window.setInterval(() => void synchronize(), 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [game.id, game.mode, game.status]);

  useEffect(() => {
    if (game.mode !== 'HISTORICAL' || game.status !== 'COMPLETED' || game.finalPortfolio) return;
    let disposed = false;
    const finalize = async () => {
      unwrap(await window.paperForge.trading.portfolio(game.id));
      const next = unwrap(await window.paperForge.games.load(game.id));
      if (!disposed) setGame(next);
    };
    void finalize();
    return () => {
      disposed = true;
    };
  }, [game.finalPortfolio, game.id, game.mode, game.status]);

  const displayedTimestamp = game.mode === 'LIVE' ? liveTimestamp : game.simulationTimestamp;

  const changeMultiplier = async (value: string) => {
    const multiplier = HISTORICAL_TIME_MULTIPLIERS.find((item) => item === Number(value));
    if (!multiplier) return;
    setGame(unwrap(await window.paperForge.games.setTimeMultiplier(game.id, multiplier)));
  };

  const navigate = (next: Navigation) => {
    setInstrument(null);
    setActive(next);
  };

  return (
    <main className="terminal-shell">
      <aside className="terminal-sidebar">
        <div className="sidebar-logo">
          <Logo compact />
        </div>
        <nav>
          {navigation.map((item) => (
            <button
              key={item.id}
              className={active === item.id && !instrument ? 'active' : ''}
              onClick={() => navigate(item.id)}
              title={item.label}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button onClick={onExit} title="К списку игр">
            <ArrowLeft size={20} />
            <span>Игры</span>
          </button>
          <button onClick={onLogout} title="Выйти">
            <LogOut size={20} />
            <span>Выйти</span>
          </button>
        </div>
      </aside>
      <section className="terminal-main">
        <header className="terminal-topbar">
          <div className="game-selector">
            <div className={`live-dot ${game.mode.toLowerCase()}`} />
            <span>
              <small>{game.mode} SIMULATION</small>
              <strong>{game.name}</strong>
            </span>
            <ChevronDown size={15} />
          </div>
          <button className="global-search" onClick={() => navigate('market')}>
            <Search size={17} />
            <span>Поиск инструмента</span>
            <kbd>⌘ K</kbd>
          </button>
          <div className="terminal-status">
            <span>
              <Wifi size={15} />
              Market data
            </span>
            <span>
              <Clock3 size={15} />
              {new Date(displayedTimestamp).toLocaleString('ru-RU')}
            </span>
            {game.mode === 'HISTORICAL' && (
              <label className="time-multiplier-control">
                <select
                  value={game.timeMultiplier}
                  disabled={game.status === 'COMPLETED'}
                  onChange={(event) => void changeMultiplier(event.target.value)}
                  aria-label="Скорость времени"
                >
                  {HISTORICAL_TIME_MULTIPLIERS.map((multiplier) => (
                    <option key={multiplier} value={multiplier}>
                      {multiplier}x
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="user-avatar">{session.username.slice(0, 1).toUpperCase()}</div>
          </div>
        </header>
        <div className="terminal-content">
          {instrument ? (
            <InstrumentScreen
              game={game}
              instrument={instrument}
              onBack={() => setInstrument(null)}
              onGameChange={setGame}
            />
          ) : (
            <>
              {active === 'overview' && (
                <section className="workspace-screen">
                  {game.status === 'COMPLETED' && (
                    <div className="completion-banner">
                      <Clock3 size={22} />
                      <div>
                        <strong>Historical-симуляция завершена</strong>
                        <span>Симуляция достигла текущей даты и времени.</span>
                        {game.finalPortfolio && (
                          <small>
                            Финальная стоимость: {game.finalPortfolio.totalValue}{' '}
                            {game.finalPortfolio.reportingCurrency}
                          </small>
                        )}
                      </div>
                    </div>
                  )}
                  <div className="screen-heading overview-heading">
                    <div>
                      <span className="eyebrow">TRADING DESK</span>
                      <h2>Добро пожаловать, {session.username}</h2>
                      <p>Состояние виртуального счёта на текущий момент симуляции.</p>
                    </div>
                    <button className="primary-button" onClick={() => navigate('market')}>
                      <Search size={17} />
                      Найти актив
                    </button>
                  </div>
                  <PortfolioScreen game={game} overview />
                  <div className="overview-lower">
                    <div className="panel overview-activity">
                      <div className="panel-heading">
                        <h3>Последние операции</h3>
                        <button onClick={() => navigate('history')}>Вся история →</button>
                      </div>
                      {game.trades.length === 0 ? (
                        <div className="table-message">Операций пока нет</div>
                      ) : (
                        game.trades
                          .slice(-5)
                          .reverse()
                          .map((trade) => (
                            <div className="activity-row" key={trade.id}>
                              <i className={trade.side.toLowerCase()}>
                                {trade.side === 'BUY' ? '↗' : '↙'}
                              </i>
                              <span>
                                <strong>
                                  {trade.side} {trade.instrument.symbol}
                                </strong>
                                <small>
                                  {trade.quantity} × {trade.executionPrice}{' '}
                                  {trade.transactionCurrency}
                                </small>
                              </span>
                              <time>
                                {new Date(trade.simulationTimestamp).toLocaleTimeString('ru-RU')}
                              </time>
                            </div>
                          ))
                      )}
                    </div>
                    <div className="panel simulation-card">
                      <span className="eyebrow">SIMULATION CLOCK</span>
                      <strong>
                        {new Date(displayedTimestamp).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: 'long',
                          year: 'numeric',
                        })}
                      </strong>
                      <p>
                        {new Date(displayedTimestamp).toLocaleTimeString('ru-RU')} · {game.mode}
                        {game.mode === 'HISTORICAL' ? ` · ${game.timeMultiplier}x` : ''}
                      </p>
                      <div className="clock-line">
                        <span />
                      </div>
                      <small>
                        {game.mode === 'HISTORICAL'
                          ? game.status === 'COMPLETED'
                            ? 'Время остановлено, результаты сохранены'
                            : 'Данные после этой отметки заблокированы'
                          : 'Синхронизировано с реальным временем'}
                      </small>
                    </div>
                  </div>
                </section>
              )}
              {active === 'market' && <MarketScreen game={game} onSelect={setInstrument} />}
              {active === 'portfolio' && <PortfolioScreen game={game} />}
              {active === 'history' && <HistoryScreen game={game} />}
              {active === 'saves' && <SavesScreen game={game} onGameChange={setGame} />}
              {active === 'settings' && <SettingsScreen onAccountDeleted={onLogout} />}
            </>
          )}
        </div>
      </section>
      {adminOpen && (
        <AdminPanel game={game} onClose={() => setAdminOpen(false)} onGameChange={setGame} />
      )}
    </main>
  );
}
