import { useSyncExternalStore } from 'react';
import type { TutorialController } from '../game/tutorial';
import { GameScreen } from './Game';

/** The game screen with the tutorial coach on top. */
export function TutorialScreen({
  controller,
  onShowResult,
  onExit,
}: {
  controller: TutorialController;
  onShowResult: () => void;
  onExit: () => void;
}) {
  const state = useSyncExternalStore(controller.subscribe, controller.getTutorial);
  return (
    <GameScreen
      controller={controller}
      onShowResult={onShowResult}
      onQuit={onExit}
      coach={{
        state,
        onNext: controller.next,
        onKeepPlaying: controller.finish,
        onHome: onExit,
      }}
    />
  );
}
