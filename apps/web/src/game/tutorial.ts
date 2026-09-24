import { type Action, type CardKind, createGame, createRng, type PlayerView } from '@meow/engine';
import { LocalController, type Scheduler } from './LocalController';
import type { ControllerSnapshot, GameController, SeatInfo } from './types';

// Scripted first game (docs/ROADMAP.md › เฟส 4 › บทสอนแบบโต้ตอบ): real rules, fixed cards.
// The seed was found with scripts/find-tutorial-seed.ts so that, after round 1's picks and
// the discard reshuffle, the player's first digs are fish, bone, fish, dog. A test guards it.

export const TUTORIAL_SEED = 'tutorial-5180';
export const TUTORIAL_MARKET_TOP: readonly CardKind[] = [
  'fish',
  'milk',
  'chicken',
  'shrimp',
  'snack',
  'chicken',
];
export const TUTORIAL_BOT_ID = 'p1';

/** Where the coach points. */
export type TutorialTarget =
  'prices' | 'meow' | 'market' | 'dig' | 'bone' | 'stop' | 'eat' | 'tieOrder' | 'bin';

export interface TutorialStep {
  readonly id: string;
  readonly target: TutorialTarget | null;
  /** The step shows up once this holds (the game may need to catch up first). */
  readonly when: (view: PlayerView) => boolean;
  /** Action step: the player must do this. Info step (no expect): a "Next" button. */
  readonly expect?: (action: Action, view: PlayerView) => boolean;
  /** Last step: offers "keep playing" / "home". */
  readonly final?: boolean;
}

const me = (view: PlayerView) => view.players.find((p) => p.id === view.viewer)!;
const myTurn = (view: PlayerView, phase: PlayerView['phase']) =>
  view.phase === phase && view.currentPlayer === view.viewer;
const always = () => true;

export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  { id: 'welcome', target: null, when: always },
  { id: 'prices', target: 'prices', when: always },
  {
    id: 'bid',
    target: 'meow',
    when: (v) => v.phase === 'bidding' && v.round === 1,
    expect: (a) => a.type === 'bid' && a.value === 5,
  },
  {
    id: 'pick',
    target: 'market',
    when: (v) => myTurn(v, 'pick'),
    expect: (a, v) => a.type === 'pick' && v.market.find((c) => c.id === a.cardId)?.kind === 'fish',
  },
  { id: 'dig1', target: 'dig', when: (v) => myTurn(v, 'trash'), expect: (a) => a.type === 'dig' },
  { id: 'dig2', target: 'dig', when: (v) => myTurn(v, 'trash'), expect: (a) => a.type === 'dig' },
  { id: 'dig3', target: 'dig', when: (v) => myTurn(v, 'trash'), expect: (a) => a.type === 'dig' },
  { id: 'dig4', target: 'bin', when: (v) => myTurn(v, 'trash'), expect: (a) => a.type === 'dig' },
  {
    id: 'bone',
    target: 'bone',
    when: (v) => v.pendingDog !== null,
    expect: (a) => a.type === 'resolveDog' && a.useBone,
  },
  { id: 'stop', target: 'stop', when: (v) => myTurn(v, 'trash'), expect: (a) => a.type === 'stop' },
  {
    id: 'eat',
    target: 'eat',
    when: (v) => myTurn(v, 'eat'),
    expect: (a) => a.type === 'eat',
  },
  { id: 'priceDrop', target: 'prices', when: (v) => me(v).meals.length > 0 },
  { id: 'tieOrder', target: 'tieOrder', when: (v) => v.round === 2 && v.phase === 'bidding' },
  {
    id: 'bid2',
    target: 'meow',
    when: (v) => v.round === 2 && v.phase === 'bidding',
    expect: (a) => a.type === 'bid' && a.value === 3,
  },
  { id: 'clash', target: null, when: (v) => v.round === 2 && v.phase !== 'bidding' },
  { id: 'done', target: null, when: always, final: true },
];

/** The bot's moves during the tutorial; afterwards it plays normally. */
export function scriptedBotMove(view: PlayerView): Action | null {
  const playerId = view.viewer!;
  const bot = view.players.find((p) => p.id === playerId)!;
  if (view.round === 1) {
    if (view.phase === 'bidding' && !bot.hasBid) return { type: 'bid', playerId, value: 2 };
    if (view.phase === 'pick') {
      const card = view.market.find((c) => c.kind === 'milk') ?? view.market[0]!;
      return { type: 'pick', playerId, cardId: card.id };
    }
    if (view.phase === 'trash') return { type: 'stop', playerId };
  }
  if (view.round === 2 && view.phase === 'bidding' && !bot.hasBid) {
    return { type: 'bid', playerId, value: 3 };
  }
  return null;
}

export interface TutorialState {
  readonly step: TutorialStep | null;
  /** The step's condition holds: the coach may speak (once the stage is idle). */
  readonly ready: boolean;
  readonly finished: boolean;
}

/**
 * Wraps a LocalController: only the move the coach asks for is accepted while the
 * tutorial runs; after the last step the game continues as a normal solo game.
 */
export class TutorialController implements GameController {
  private readonly inner: LocalController;
  private stepIndex = 0;
  private finished = false;
  private readonly listeners = new Set<() => void>();
  private tutorialState: TutorialState;

  constructor(seats: readonly SeatInfo[], scheduler: Scheduler) {
    this.inner = new LocalController({
      state: createGame({
        playerIds: seats.map((s) => s.id),
        seed: TUTORIAL_SEED,
        marketTop: TUTORIAL_MARKET_TOP,
      }),
      seats,
      viewerId: seats.find((s) => !s.bot)!.id,
      botRng: createRng(`bots:${TUTORIAL_SEED}`).state,
      storage: null, // the tutorial never replaces a saved game
      scheduler,
      botOverride: (view) => (this.finished ? null : scriptedBotMove(view)),
    });
    this.tutorialState = this.buildState();
    this.inner.subscribe(() => {
      this.tutorialState = this.buildState();
      this.emit();
    });
  }

  getSnapshot = (): ControllerSnapshot => this.inner.getSnapshot();
  getTutorial = (): TutorialState => this.tutorialState;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch = (action: Action): string | null => {
    const step = this.currentStep();
    if (!this.finished && step) {
      const view = this.inner.getSnapshot().view;
      if (!step.expect || !step.when(view) || !step.expect(action, view))
        return 'tutorial.followCoach';
    }
    const error = this.inner.dispatch(action);
    if (error === null && !this.finished && step?.expect) this.advance();
    return error;
  };

  /** "Next" on an info step. */
  next = (): void => {
    const step = this.currentStep();
    if (step && !step.expect && !step.final) this.advance();
  };

  /** Leave the script: the rest is a normal game. */
  finish = (): void => {
    this.finished = true;
    this.update();
  };

  setPaused = (paused: boolean): void => this.inner.setPaused(paused);

  dispose = (): void => {
    this.inner.dispose();
    this.listeners.clear();
  };

  private currentStep(): TutorialStep | null {
    return TUTORIAL_STEPS[this.stepIndex] ?? null;
  }

  private advance(): void {
    this.stepIndex++;
    this.update();
  }

  private update(): void {
    this.tutorialState = this.buildState();
    this.emit();
  }

  private buildState(): TutorialState {
    const step = this.finished ? null : this.currentStep();
    const view = this.inner.getSnapshot().view;
    return { step, ready: step ? step.when(view) : false, finished: this.finished };
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

const SEEN_KEY = 'mnm.tutorialSeen';

/** Remember that the player has opened the tutorial (so Home stops suggesting it). */
export function markTutorialSeen(): void {
  try {
    localStorage.setItem(SEEN_KEY, '1');
  } catch {
    // ignore
  }
}

export function hasSeenTutorial(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return true; // no storage: don't nag
  }
}
