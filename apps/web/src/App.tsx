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
import { ResultScreen } from './screens/Result';
import { type LocalSetup, seatsFromLocalSetup, seatsFromSetup, type SoloSetup } from './game/setup';
import type { SeatInfo } from './game/types';
import { LocalSetupScreen } from './screens/LocalSetup';
import { SetupScreen } from './screens/Setup';
import { ROOM_CODE_LENGTH } from '@meow/protocol';
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

/** What "play again" repeats. */
type LastSetup = { mode: 'solo'; setup: SoloSetup } | { mode: 'local'; setup: LocalSetup };

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
  const [lastSetup, setLastSetup] = useState<LastSetup | null>(null);

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

  const startGame = (seats: readonly SeatInfo[]) => {
    clearSave(storage);
    controller?.dispose();
    setController(LocalController.newGame(seats, newSeed(), storage, browserScheduler));
    setScreen('game');
  };
  const startSolo = (setup: SoloSetup) => {
    setLastSetup({ mode: 'solo', setup });
    startGame(seatsFromSetup(setup));
  };
  const startLocal = (setup: LocalSetup) => {
    setLastSetup({ mode: 'local', setup });
    startGame(seatsFromLocalSetup(setup));
  };
  const playAgain = () => {
    if (lastSetup?.mode === 'solo') startSolo(lastSetup.setup);
    else if (lastSetup?.mode === 'local') startLocal(lastSetup.setup);
    else setScreen('home');
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
    return (
      <GameScreen
        controller={controller}
        onShowResult={() => setScreen('result')}
        onQuit={goHome}
      />
    );
  }

  if (screen === 'result' && controller) {
    const snapshot = controller.getSnapshot();
    if (snapshot.view.result) {
      return (
        <ResultScreen
          result={snapshot.view.result}
          seats={snapshot.seats}
          viewerId={snapshot.sharedDevice ? null : snapshot.view.viewer}
          onPlayAgain={playAgain}
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
