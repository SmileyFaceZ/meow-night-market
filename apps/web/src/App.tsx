import { useEffect, useState } from 'react';
import { browserScheduler, LocalController } from './game/LocalController';
import { markTutorialSeen, TutorialController } from './game/tutorial';
import { loadSetup } from './game/setup';
import type { GameController } from './game/types';
import { TutorialScreen } from './screens/Tutorial';
import { browserStorage, clearSave, readSave, type SoloSave } from './game/save';
import { GameScreen } from './screens/Game';
import { HomeScreen } from './screens/Home';
import { HowToScreen } from './screens/HowTo';
import { ResultScreen } from './screens/Result';
import { seatsFromSetup, type SoloSetup } from './game/setup';
import { SetupScreen } from './screens/Setup';

type Screen = 'home' | 'setup' | 'game' | 'result' | 'howto' | 'tutorial';

function newSeed(): string {
  // Seed for a fresh game (UI side — the engine itself never touches Math.random).
  return `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function App() {
  const storage = browserStorage();
  const [screen, setScreen] = useState<Screen>('home');
  const [save, setSave] = useState<SoloSave | null>(() => readSave(storage));
  const [controller, setController] = useState<GameController | null>(null);
  const [lastSetup, setLastSetup] = useState<SoloSetup | null>(null);

  useEffect(() => () => controller?.dispose(), [controller]);

  const startSolo = (setup: SoloSetup) => {
    clearSave(storage);
    controller?.dispose();
    setLastSetup(setup);
    setController(
      LocalController.newSolo(seatsFromSetup(setup), newSeed(), storage, browserScheduler),
    );
    setScreen('game');
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
    if (snapshot.view.result && snapshot.view.viewer) {
      return (
        <ResultScreen
          result={snapshot.view.result}
          seats={snapshot.seats}
          viewerId={snapshot.view.viewer}
          onPlayAgain={() => (lastSetup ? startSolo(lastSetup) : setScreen('setup'))}
          onHome={goHome}
        />
      );
    }
  }

  if (screen === 'howto') {
    return <HowToScreen onBack={() => setScreen('home')} onTutorial={startTutorial} />;
  }

  if (screen === 'setup') {
    return <SetupScreen hasSave={save !== null} onStart={startSolo} onBack={goHome} />;
  }

  return (
    <HomeScreen
      save={save}
      onSolo={() => setScreen('setup')}
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
