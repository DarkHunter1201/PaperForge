import { useCallback, useEffect, useState } from 'react';
import { ArchiveRestore, Save, Trash2 } from 'lucide-react';
import type { GameState, SaveSummary } from '../../../shared/types';
import { formatDate, unwrap } from '../lib/api';

export function SavesScreen({
  game,
  onGameChange,
}: {
  game: GameState;
  onGameChange: (game: GameState) => void;
}) {
  const [saves, setSaves] = useState<SaveSummary[]>([]);
  const [name, setName] = useState('');

  const load = useCallback(
    async () => setSaves(unwrap(await window.paperForge.saves.list(game.id))),
    [game.id],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    unwrap(await window.paperForge.saves.create(game.id, name));
    setName('');
    await load();
  };
  const restore = async (id: string) => {
    if (!window.confirm('Восстановить выбранное состояние игры?')) return;
    onGameChange(unwrap(await window.paperForge.saves.restore(id)));
  };
  const remove = async (id: string) => {
    unwrap(await window.paperForge.saves.remove(id));
    await load();
  };

  return (
    <section className="workspace-screen">
      <div className="screen-heading">
        <div>
          <span className="eyebrow">ENCRYPTED SNAPSHOTS</span>
          <h2>Сохранения</h2>
          <p>Количество ограничено только доступным дисковым пространством.</p>
        </div>
      </div>
      <div className="save-composer panel">
        <div>
          <Save size={22} />
          <span>
            <strong>Создать снимок</strong>
            <small>Текущее состояние будет зашифровано и подписано</small>
          </span>
        </div>
        <input
          placeholder="Название сохранения"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <button className="primary-button" onClick={() => void create()}>
          Сохранить
        </button>
      </div>
      <div className="save-grid">
        {saves.map((save) => (
          <article className="save-card panel" key={save.id}>
            <div className="save-icon">
              <Save size={20} />
            </div>
            <div>
              <h3>{save.name}</h3>
              <p>{formatDate(save.simulationTimestamp)}</p>
              <small>
                Ревизия #{save.revision} · создано {formatDate(save.createdAt)}
              </small>
            </div>
            <div className="save-actions">
              <button className="ghost-button" onClick={() => void restore(save.id)}>
                <ArchiveRestore size={15} />
                Восстановить
              </button>
              <button className="icon-button danger" onClick={() => void remove(save.id)}>
                <Trash2 size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      {saves.length === 0 && (
        <div className="empty-workspace compact">
          <Save size={28} />
          <h3>Сохранений пока нет</h3>
        </div>
      )}
    </section>
  );
}
