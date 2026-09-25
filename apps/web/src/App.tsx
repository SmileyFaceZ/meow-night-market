import { useEffect, useState } from 'react';
import { browserScheduler, LocalController } from './game/LocalController';
import { markTutorialSeen, TutorialController } from './game/tutorial';
import { loadSetup } from './game/setup';
import type { GameController } from './game/types';
import { TutorialScreen } from './screens/Tutorial';
import { browserStorage, clearSave, type GameSave, readSave } from './game/save';
import { GameScreen } from './screens/Game';
import { HomeScreen } from './screens/Home';
import { HowToScreen } from './screens/HowTo';
import { ResultScreen, SessionScoreBar } from './screens/Result';
import { browserSessionStorage, recordSessionGame, type SessionScore } from './game/sessionScore';
import { type LocalSetup, seatsFromLocalSetup, seatsFromSetup, type SoloSetup } from './game/setup';
import type { SeatInfo } from './game/types';
import { LocalSetupScreen } from './screens/LocalSetup';
import { SetupScreen } from './screens/Setup';
import { type GameMode, ROOM_CODE_LENGTH } from '@meow/protocol';
import {
  browserSocket,
  cleanCode,
  createRoom,
  type Profile,
  RemoteController,
  sessionTokens,
} from './game/online';
import { OnlineScreen } from './screens/Online';
import { RoomScreen } from './screens/Room';

type Screen =
  'home' | 'setup' | 'localSetup' | 'game' | 'result' | 'howto' | 'tutorial' | 'online' | 'room';

/** A shared room link: /room/ABCD */
const ROOM_PATH = /^\/room\/([A-Za-z]+)\/?$/;

function linkCodeFromPath(): string | null {
  const match = ROOM_PATH.exec(location.pathname);
  const code = match ? cleanCode(match[1]!) : '';
  return code.length === ROOM_CODE_LENGTH ? code : null;
}

function setPath(path: string): void {
  if (location.pathname !== path) history.replaceState(null, '', path);
}

function newSeed(): string {
  // Seed for a fresh game (UI side — the engine itself never touches Math.random).
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function App() {
  const storage = browserStorage();
  const [linkCode, setLinkCode] = useState(linkCodeFromPath);
  const [screen, setScreen] = useState<Screen>(() => (linkCode ? 'online' : 'home'));
  const [online, setOnline] = useState<{
    controller: RemoteController;
    profile: Profile;
  } | null>(null);
  const [save, setSave] = useState<GameSave | null>(() => readSave(storage));
  const [controller, setController] = useState<GameController | null>(null);
  // Wins in a row for the current line-up (solo / pass-and-play), GAME_RULES §13.
  const [sessionScore, setSessionScore] = useState<SessionScore | null>(null);

  useEffect(() => () => controller?.dispose(), [controller]);
  useEffect(() => () => online?.controller.dispose(), [online]);

  const enterRoom = (code: string, profile: Profile) => {
    online?.controller.dispose();
    setOnline({
      profile,
      controller: new RemoteController({
        code,
        profile,
        origin: location.origin,
        connect: browserSocket,
        scheduler: browserScheduler,
        tokens: sessionTokens(),
      }),
    });
    setPath(`/room/${code}`);
    setScreen('room');
  };
  const closeRoom = (leave: boolean) => {
    if (leave) online?.controller.leave();
    else online?.controller.dispose();
    setOnline(null);
    setLinkCode(null);
    setPath('/');
    setScreen('home');
  };

  const startGame = (seats: readonly SeatInfo[], mode: GameMode) => {
    clearSave(storage);
    controller?.dispose();
    setController(LocalController.newGame(seats, newSeed(), storage, browserScheduler, mode));
    setScreen('game');
  };
  // With cat powers the bots' cats (= their powers) are drawn at random (GAME_RULES §14).
  const botRandom = (mode: GameMode) => (mode.powers ? Math.random : undefined);
  const startSolo = (setup: SoloSetup) =>
    startGame(seatsFromSetup(setup, botRandom(setup.mode)), setup.mode);
  const startLocal = (setup: LocalSetup) =>
    startGame(seatsFromLocalSetup(setup, botRandom(setup.mode)), setup.mode);
  /** The finished game's seats again, with a new seed (works for a resumed save too). */
  const playAgain = () => {
    if (!controller) return;
    const { seats, view } = controller.getSnapshot();
    startGame(seats, { powers: view.powersOn, events: view.eventsOn });
  };
  /** Back to the setup screen that fits the finished game (it remembers the last choices). */
  const changeSetup = () => {
    const humans = controller?.getSnapshot().seats.filter((s) => !s.bot).length ?? 1;
    setScreen(humans > 1 ? 'localSetup' : 'setup');
  };
  const showResult = () => {
    const snap = controller?.getSnapshot();
    if (snap?.view.result) {
      setSessionScore(recordSessionGame(browserSessionStorage(), snap.seats, snap.view.result));
    }
    setScreen('result');
  };

  const startTutorial = () => {
    controller?.dispose();
    markTutorialSeen();
    const { name, cat } = loadSetup();
    setController(
      new TutorialController(
        [
          { id: 'p0', name: name.trim() || null, cat, bot: null },
          {
            id: 'p1',
            name: null,
            cat: 'orange',
            bot: { personality: 'greedy', difficulty: 'normal' },
          },
        ],
        browserScheduler,
      ),
    );
    setScreen('tutorial');
  };

  const goHome = () => {
    controller?.dispose();
    setController(null);
    setSave(readSave(storage));
    setScreen('home');
  };

  if (screen === 'tutorial' && controller instanceof TutorialController) {
    return (
      <TutorialScreen
        controller={controller}
        onShowResult={() => setScreen('result')}
        onExit={goHome}
      />
    );
  }

  if (screen === 'game' && controller) {
    return <GameScreen controller={controller} onShowResult={showResult} onQuit={goHome} />;
  }

  if (screen === 'result' && controller) {
    const snapshot = controller.getSnapshot();
    if (snapshot.view.result) {
      return (
        <ResultScreen
          result={snapshot.view.result}
          seats={snapshot.seats}
          viewerId={snapshot.sharedDevice ? null : snapshot.view.viewer}
          {...(controller instanceof TutorialController
            ? {}
            : {
                onPlayAgain: playAgain,
                onChangeSetup: changeSetup,
                extra: sessionScore && (
                  <SessionScoreBar
                    seats={snapshot.seats}
                    wins={sessionScore.wins}
                    games={sessionScore.games}
                  />
                ),
              })}
          onHome={goHome}
        />
      );
    }
  }

  if (screen === 'room' && online) {
    return (
      <RoomScreen
        controller={online.controller}
        profile={online.profile}
        onLeave={() => closeRoom(true)}
        onQuit={() => closeRoom(false)}
      />
    );
  }

  if (screen === 'online') {
    return (
      <OnlineScreen
        linkCode={linkCode}
        onCreate={async (profile) => enterRoom(await createRoom(), profile)}
        onJoin={enterRoom}
        onBack={() => closeRoom(false)}
      />
    );
  }

  if (screen === 'howto') {
    return <HowToScreen onBack={() => setScreen('home')} onTutorial={startTutorial} />;
  }

  if (screen === 'setup') {
    return <SetupScreen hasSave={save !== null} onStart={startSolo} onBack={goHome} />;
  }

  if (screen === 'localSetup') {
    return <LocalSetupScreen hasSave={save !== null} onStart={startLocal} onBack={goHome} />;
  }

  return (
    <HomeScreen
      save={save}
      onSolo={() => setScreen('setup')}
      onLocal={() => setScreen('localSetup')}
      onOnline={() => setScreen('online')}
      onHowTo={() => setScreen('howto')}
      onTutorial={startTutorial}
      onContinue={() => {
        if (!save) return;
        setController(LocalController.fromSave(save, storage, browserScheduler));
        setScreen('game');
      }}
    />
  );
}
