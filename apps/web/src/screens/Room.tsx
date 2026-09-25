import { useState, useSyncExternalStore } from 'react';
import { RematchPanel, RoomScore, WaitingOutScreen } from '../components/Rematch';
import type { Profile, RemoteController } from '../game/online';
import { GameScreen } from './Game';
import { LobbyScreen } from './Lobby';
import { ResultScreen } from './Result';

/**
 * An online room: the lobby before the first game, then games one after another. After a
 * game the result screen doubles as the waiting room for a rematch (GAME_RULES §13).
 */
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
  const online = useSyncExternalStore(controller.subscribe, controller.getOnline);
  const { room, game, notice } = online;
  // Which game's result is on screen (a new game goes back to the table).
  const [resultOf, setResultOf] = useState<number | null>(null);

  if (!room || room.status === 'lobby' || !game) {
    return <LobbyScreen controller={controller} profile={profile} onLeave={onLeave} />;
  }
  const me = room.seats.find((s) => s.id === room.you);
  if (room.status === 'playing' && me?.sittingOut === 'waiting') {
    return <WaitingOutScreen room={room} cat={me.cat} onLeave={onLeave} />;
  }
  if (room.status === 'ended' && resultOf === room.gameNo && game.view.result) {
    return (
      <ResultScreen
        result={game.view.result}
        seats={game.seats.filter((s) => game.view.players.some((p) => p.id === s.id))}
        viewerId={game.view.viewer}
        extra={
          <>
            <RoomScore seats={room.seats} />
            <RematchPanel controller={controller} room={room} profile={profile} />
          </>
        }
        onHome={onLeave}
      />
    );
  }
  return (
    <GameScreen
      // A rematch is a new game: fresh screen state, round banner and all.
      key={room.gameNo}
      controller={controller}
      notice={notice}
      onShowResult={() => setResultOf(room.gameNo)}
      onQuit={onQuit}
    />
  );
}
