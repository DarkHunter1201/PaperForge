import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Database,
  KeyRound,
  Server,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import type { AppSettings } from '../../../shared/types';
import { unwrap } from '../lib/api';

export function SettingsScreen({ onAccountDeleted }: { onAccountDeleted: () => void }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [message, setMessage] = useState('');
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const load = useCallback(
    async () => setSettings(unwrap(await window.paperForge.app.settings())),
    [],
  );
  useEffect(() => {
    void load();
  }, [load]);

  const saveKey = async () => {
    unwrap(await window.paperForge.app.setTwelveDataApiKey(apiKey));
    setApiKey('');
    setMessage('API key сохранён в зашифрованном пользовательском хранилище');
    await load();
  };

  const deleteAccount = async () => {
    setDeleting(true);
    setDeleteError('');
    try {
      unwrap(await window.paperForge.auth.deleteAccount(deletePassword));
      onAccountDeleted();
    } catch (caught) {
      setDeleteError(caught instanceof Error ? caught.message : 'Не удалось удалить аккаунт');
    } finally {
      setDeleting(false);
    }
  };

  if (!settings) return null;
  return (
    <section className="workspace-screen">
      <div className="screen-heading">
        <div>
          <span className="eyebrow">CONFIGURATION</span>
          <h2>Настройки</h2>
          <p>Провайдеры и локальное хранилище PaperForge.</p>
        </div>
        <span className="version-chip">v{settings.version}</span>
      </div>
      <div className="settings-grid">
        <div className="panel settings-panel">
          <div className="panel-heading">
            <h3>
              <Server size={18} />
              Market Data Providers
            </h3>
          </div>
          <div className="provider-list">
            {settings.providers.map((provider) => (
              <div className="provider-row" key={provider.id}>
                <div className="provider-status">
                  {provider.configured ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
                  <span>
                    <strong>{provider.name}</strong>
                    <small>{provider.markets.join(' · ')}</small>
                  </span>
                </div>
                <div>
                  <span>{provider.timeliness.replace('_', ' ')}</span>
                  <em className={provider.configured ? 'online' : 'offline'}>
                    {provider.configured ? 'READY' : 'KEY REQUIRED'}
                  </em>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="panel settings-panel">
          <div className="panel-heading">
            <h3>
              <KeyRound size={18} />
              Twelve Data API
            </h3>
          </div>
          <p>
            Открывает глобальный каталог акций, валют и дополнительные historical datasets в
            пределах вашего тарифного плана.
          </p>
          <label>
            <span>API key</span>
            <input
              type="password"
              value={apiKey}
              placeholder={
                settings.twelveDataApiKeyConfigured ? 'Ключ уже настроен' : 'Введите ключ'
              }
              onChange={(event) => setApiKey(event.target.value)}
            />
          </label>
          <button
            className="primary-button"
            disabled={!apiKey.trim()}
            onClick={() => void saveKey()}
          >
            Сохранить ключ
          </button>
          {message && <div className="success-message">{message}</div>}
        </div>
        <div className="panel settings-panel wide">
          <div className="panel-heading">
            <h3>
              <Database size={18} />
              Централизованное хранилище
            </h3>
          </div>
          <div className="path-display">
            <code>{settings.dataRoot}</code>
          </div>
          <p>
            База данных, encrypted saves, cache, logs, config и временные файлы находятся внутри
            единого DATA_ROOT.
          </p>
        </div>
        <div className="panel settings-panel wide danger-zone">
          <div className="panel-heading">
            <h3>
              <ShieldAlert size={18} />
              Удаление аккаунта
            </h3>
          </div>
          <p>
            Операция безвозвратно удаляет профиль, все игры, состояния счетов, позиции, сделки,
            сохранения, настройки и связанные записи журнала.
          </p>
          <div className="danger-form">
            <label>
              <span>Текущий пароль</span>
              <input
                type="password"
                value={deletePassword}
                onChange={(event) => setDeletePassword(event.target.value)}
              />
            </label>
            <label>
              <span>
                Для подтверждения введите <strong>УДАЛИТЬ</strong>
              </span>
              <input
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
              />
            </label>
            <button
              className="delete-account-button"
              disabled={
                deleting || !deletePassword || deleteConfirmation.trim().toUpperCase() !== 'УДАЛИТЬ'
              }
              onClick={() => void deleteAccount()}
            >
              <Trash2 size={16} />
              {deleting ? 'Удаление…' : 'Удалить аккаунт и все данные'}
            </button>
          </div>
          {deleteError && <div className="inline-alert danger-error">{deleteError}</div>}
        </div>
      </div>
    </section>
  );
}
