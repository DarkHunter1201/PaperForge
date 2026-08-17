import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import type { SessionInfo } from '../../../shared/types';
import { unwrap } from '../lib/api';
import { Logo } from '../components/Logo';

export function AuthScreen({
  onAuthenticated,
}: {
  onAuthenticated: (session: SessionInfo) => void;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result =
        mode === 'login'
          ? await window.paperForge.auth.login(username, password)
          : await window.paperForge.auth.register(username, password);
      onAuthenticated(unwrap(result));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось выполнить вход');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-shell">
      <section className="auth-brand-panel">
        <Logo />
        <div className="auth-message">
          <span className="eyebrow">REAL DATA · VIRTUAL CAPITAL</span>
          <h1>
            Рынок настоящий.
            <br />
            Риск — нет.
          </h1>
          <p>
            Отрабатывайте торговые решения на реальных рыночных данных с полностью виртуальным
            портфелем.
          </p>
        </div>
        <div className="auth-trust-row">
          <div>
            <ShieldCheck size={18} />
            <span>Локальное шифрование</span>
          </div>
          <div>
            <LockKeyhole size={18} />
            <span>Без брокерского счёта</span>
          </div>
        </div>
        <div className="market-watermark">
          <i style={{ height: '28%' }} />
          <i style={{ height: '52%' }} />
          <i style={{ height: '40%' }} />
          <i style={{ height: '74%' }} />
          <i style={{ height: '61%' }} />
          <i style={{ height: '90%' }} />
          <i style={{ height: '70%' }} />
          <i style={{ height: '100%' }} />
          <i style={{ height: '82%' }} />
          <i style={{ height: '94%' }} />
        </div>
      </section>
      <section className="auth-form-panel">
        <form className="auth-card" onSubmit={submit}>
          <div className="auth-card-heading">
            <div className="avatar-orb">
              <UserRound size={24} />
            </div>
            <h2>{mode === 'login' ? 'С возвращением' : 'Создайте аккаунт'}</h2>
            <p>
              {mode === 'login'
                ? 'Войдите в локальный профиль PaperForge'
                : 'Данные профиля останутся на этом устройстве'}
            </p>
          </div>
          <div className="segmented-control">
            <button
              type="button"
              className={mode === 'login' ? 'active' : ''}
              onClick={() => setMode('login')}
            >
              Вход
            </button>
            <button
              type="button"
              className={mode === 'register' ? 'active' : ''}
              onClick={() => setMode('register')}
            >
              Регистрация
            </button>
          </div>
          <label>
            <span>Имя пользователя</span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoFocus
              autoComplete="username"
            />
          </label>
          <label>
            <span>Пароль</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>
          {error && <div className="form-error">{error}</div>}
          <button className="primary-button auth-submit" disabled={busy}>
            <span>
              {busy ? 'Подождите…' : mode === 'login' ? 'Войти в терминал' : 'Создать аккаунт'}
            </span>
            <ArrowRight size={18} />
          </button>
          <p className="security-note">
            <LockKeyhole size={14} />
            Пароль защищается Argon2id и не сохраняется в открытом виде
          </p>
        </form>
      </section>
    </main>
  );
}
