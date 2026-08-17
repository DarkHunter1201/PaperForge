import { useState } from 'react';
import { Shield, X } from 'lucide-react';
import type { GameState } from '../../../shared/types';
import { unwrap } from '../lib/api';

export function AdminPanel({
  game,
  onClose,
  onGameChange,
}: {
  game: GameState;
  onClose: () => void;
  onGameChange: (game: GameState) => void;
}) {
  const [cash, setCash] = useState(() => JSON.stringify(game.cash, null, 2));
  const [holdings, setHoldings] = useState(() =>
    JSON.stringify(
      game.holdings.map(({ instrument, quantity, averageCost, realizedPnl }) => ({
        instrument,
        quantity,
        averageCost,
        realizedPnl,
      })),
      null,
      2,
    ),
  );
  const [timestamp, setTimestamp] = useState(game.simulationTimestamp.slice(0, 16));
  const [error, setError] = useState('');

  const canEditTime = game.mode === 'HISTORICAL';
  const save = async () => {
    setError('');
    try {
      const next = unwrap(
        await window.paperForge.admin.mutate(game.id, {
          cash: JSON.parse(cash),
          holdings: JSON.parse(holdings),
          simulationTimestamp: canEditTime ? new Date(timestamp).toISOString() : undefined,
        }),
      );
      onGameChange(next);
      onClose();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Изменение отклонено');
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="admin-modal">
        <header>
          <div>
            <Shield size={19} />
            <span>
              <strong>State Control</strong>
              <small>Authorized integrity pipeline</small>
            </span>
          </div>
          <button className="icon-button" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="admin-body">
          <label>
            <span>Cash balances · JSON</span>
            <textarea value={cash} onChange={(event) => setCash(event.target.value)} />
          </label>
          <label>
            <span>Holdings · JSON</span>
            <textarea
              className="large"
              value={holdings}
              onChange={(event) => setHoldings(event.target.value)}
            />
          </label>
          {canEditTime && (
            <label>
              <span>Simulation timestamp</span>
              <input
                type="datetime-local"
                value={timestamp}
                onChange={(event) => setTimestamp(event.target.value)}
              />
            </label>
          )}
          {error && <div className="form-error">{error}</div>}
        </div>
        <footer>
          <button className="ghost-button" onClick={onClose}>
            Отмена
          </button>
          <button className="primary-button" onClick={() => void save()}>
            Применить состояние
          </button>
        </footer>
      </div>
    </div>
  );
}
