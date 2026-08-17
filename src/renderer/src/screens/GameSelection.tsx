import { useEffect, useState, type FormEvent } from 'react';
import { ArrowRight, CalendarClock, CirclePlus, Clock3, LogOut, Radio, Trash2 } from 'lucide-react';
import type { GameMode, GameState, GameSummary, SessionInfo } from '../../../shared/types';
import { Logo } from '../components/Logo';
import { Loading } from '../components/Loading';
import { formatDate, unwrap } from '../lib/api';

export function GameSelection({
  session,
  onOpen,
  onLogout,
}: {
  session: SessionInfo;
  onOpen: (game: GameState) => void;
  onLogout: () => void;
}) {
  const [games, setGames] = useState<GameSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('Новая стратегия');
  const [mode, setMode] = useState<GameMode>('LIVE');
  const [currency, setCurrency] = useState('USD');
  const [balance, setBalance] = useState('100000');
  const [historicalStart, setHistoricalStart] = useState('2008-09-15T14:35');
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    try {
      setGames(unwrap(await window.paperForge.games.list()));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const game = unwrap(
        await window.paperForge.games.create({
          name,
          mode,
          reportingCurrency: currency,
          initialBalance: balance,
          historicalStart:
            mode === 'HISTORICAL' ? new Date(historicalStart).toISOString() : undefined,
        }),
      );
      onOpen(game);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось создать игру');
    }
  };

  const open = async (id: string) => onOpen(unwrap(await window.paperForge.games.load(id)));

  const remove = async (id: string) => {
    if (!window.confirm('Удалить игру и все её сохранения?')) return;
    unwrap(await window.paperForge.games.remove(id));
    await refresh();
  };

  return (
    <main className="selection-shell">
      <header className="selection-header">
        <Logo />
        <div className="user-chip">
          <div>{session.username.slice(0, 1).toUpperCase()}</div>
          <span>
            <small>Локальный профиль</small>
            {session.username}
          </span>
          <button onClick={onLogout} title="Выйти">
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <section className="selection-content">
        <div className="section-title-row">
          <div>
            <span className="eyebrow">WORKSPACES</span>
            <h1>Торговые игры</h1>
            <p>Каждая игра хранит независимый виртуальный портфель и историю.</p>
          </div>
          <button className="primary-button" onClick={() => setCreating((value) => !value)}>
            <CirclePlus size={18} />
            Новая игра
          </button>
        </div>
        {creating && (
          <form className="create-game-card" onSubmit={create}>
            <div className="create-grid">
              <label>
                <span>Название</span>
                <input value={name} onChange={(event) => setName(event.target.value)} />
              </label>
              <label>
                <span>Валюта отчётности</span>
                <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option>USD</option>
                  <option>RUB</option>
                  <option>EUR</option>
                  <option>GBP</option>
                </select>
              </label>
              <label>
                <span>Виртуальный капитал</span>
                <input
                  value={balance}
                  inputMode="decimal"
                  onChange={(event) => setBalance(event.target.value)}
                />
              </label>
              {mode === 'HISTORICAL' && (
                <label>
                  <span>Старт симуляции</span>
                  <input
                    type="datetime-local"
                    value={historicalStart}
                    onChange={(event) => setHistoricalStart(event.target.value)}
                  />
                </label>
              )}
            </div>
            <div className="mode-cards">
              <button
                type="button"
                className={mode === 'LIVE' ? 'active' : ''}
                onClick={() => setMode('LIVE')}
              >
                <Radio size={20} />
                <span>
                  <strong>Live Mode</strong>
                  <small>Текущее рыночное время</small>
                </span>
              </button>
              <button
                type="button"
                className={mode === 'HISTORICAL' ? 'active' : ''}
                onClick={() => setMode('HISTORICAL')}
              >
                <CalendarClock size={20} />
                <span>
                  <strong>Historical Mode</strong>
                  <small>Торговля в выбранном прошлом</small>
                </span>
              </button>
            </div>
            {error && <div className="form-error">{error}</div>}
            <div className="form-actions">
              <button type="button" className="ghost-button" onClick={() => setCreating(false)}>
                Отмена
              </button>
              <button className="primary-button">
                Создать и открыть
                <ArrowRight size={17} />
              </button>
            </div>
          </form>
        )}
        {loading ? (
          <Loading />
        ) : games.length === 0 ? (
          <div className="empty-workspace">
            <div>
              <Clock3 size={30} />
            </div>
            <h3>Здесь появятся ваши игры</h3>
            <p>Создайте Live или Historical симуляцию, чтобы начать торговлю.</p>
          </div>
        ) : (
          <div className="game-grid">
            {games.map((game) => (
              <article className="game-card" key={game.id}>
                <div className="game-card-top">
                  <span className={`mode-badge ${game.mode.toLowerCase()}`}>
                    {game.mode === 'LIVE' ? <Radio size={13} /> : <CalendarClock size={13} />}
                    {game.mode}
                  </span>
                  <button className="icon-button danger" onClick={() => void remove(game.id)}>
                    <Trash2 size={16} />
                  </button>
                </div>
                <h3>{game.name}</h3>
                <div className="game-metrics">
                  <div>
                    <small>Валюта</small>
                    <strong>{game.reportingCurrency}</strong>
                  </div>
                  <div>
                    <small>Ревизия</small>
                    <strong>#{game.revision}</strong>
                  </div>
                </div>
                <p>
                  <Clock3 size={14} />
                  {formatDate(game.simulationTimestamp)}
                </p>
                <button className="card-action" onClick={() => void open(game.id)}>
                  Открыть терминал
                  <ArrowRight size={17} />
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
