import { useEffect, useState } from 'react';
import type { GameState, SessionInfo } from '../../shared/types';
import { Loading } from './components/Loading';
import { unwrap } from './lib/api';
import { AuthScreen } from './screens/AuthScreen';
import { GameSelection } from './screens/GameSelection';
import { Terminal } from './screens/Terminal';

export function App() {
  const [booting, setBooting] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [game, setGame] = useState<GameState | null>(null);

  useEffect(() => {
    void window.paperForge.auth
      .session()
      .then((result) => {
        setSession(unwrap(result));
        setBooting(false);
      })
      .catch(() => setBooting(false));
  }, []);

  const logout = async () => {
    unwrap(await window.paperForge.auth.logout());
    setGame(null);
    setSession(null);
  };

  if (booting)
    return (
      <div className="boot-screen">
        <Loading label="Запуск PaperForge" />
      </div>
    );
  if (!session) return <AuthScreen onAuthenticated={setSession} />;
  if (!game)
    return <GameSelection session={session} onOpen={setGame} onLogout={() => void logout()} />;
  return (
    <Terminal
      session={session}
      initialGame={game}
      onExit={() => setGame(null)}
      onLogout={() => void logout()}
    />
  );
}
