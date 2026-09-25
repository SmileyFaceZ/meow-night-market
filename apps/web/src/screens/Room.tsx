import { useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { Profile, RemoteController } from '../game/online';
import { GameScreen } from './Game';
import { LobbyScreen } from './Lobby';
import { ResultScreen } from './Result';

/** An online room: the lobby until the game starts, then the game, then the result. */
export function RoomScreen({
  controller,
  profile,
  onLeave,
  onQuit,
}: {
  controller: RemoteController;
  profile: Profile;
  /** Give up the seat (lobby, or "home" after the game). */
  onLeave: () => void;
  /** Close the game screen but keep the seat (a bot stands in after a minute). */
  onQuit: () => void;
}) {
  const { t } = useTranslation();
  const online = useSyncExternalStore(controller.subscribe, controller.getOnline);
  const { room, game, notice } = online;
  const [showResult, setShowResult] = useState(false);
  const inGame = room !== null && room.status !== 'lobby' && game !== null;
  // Back in the lobby (host started "play again"): forget the old result screen.
  if (!inGame && showResult) setShowResult(false);

  if (!inGame) return <LobbyScreen controller={controller} profile={profile} onLeave={onLeave} />;

  const isHost = room.seats.some((s) => s.id === room.you && s.host);
  if (showResult && game.view.result) {
    return (
      <ResultScreen
        result={game.view.result}
        seats={game.seats}
        viewerId={game.view.viewer}
        playAgainReason={isHost ? null : t('result.waitHost')}
        onPlayAgain={() => controller.send({ type: 'backToLobby' })}
        onHome={onLeave}
      />
    );
  }
  return (
    <GameScreen
      controller={controller}
      notice={notice}
      onShowResult={() => setShowResult(true)}
      onQuit={onQuit}
    />
  );
}
