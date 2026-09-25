import { type Card, findMealOptions, type MealOption, type PlayerView } from '@meow/engine';
import { useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import {
  EventFeed,
  EventLog,
  HandView,
  MarketStall,
  PlayerBadge,
  type PlayerStatus,
  PriceTags,
  TrashArea,
} from '../components/board';
import { GameCard, MeowCard } from '../components/cards';
import { CatArt } from '../art/CatArt';
import { Button, Modal } from '../components/ui';
import { describeEvent, useSeatName, useSnapshot } from '../game/hooks';
import { useStage } from '../game/useStage';
import { Stage } from '../components/Stage';
import type { TutorialState, TutorialTarget } from '../game/tutorial';
import type { GameController, SeatInfo } from '../game/types';
import { CoachBubble } from '../components/Coach';
import { HandoffCover } from '../components/Handoff';
import { EmotePicker, EmoteToasts, TurnTimer } from '../components/OnlineBits';

/** Tutorial coaching, when the game runs inside the tutorial. */
export interface CoachProps {
  readonly state: TutorialState;
  readonly onNext: () => void;
  readonly onKeepPlaying: () => void;
  readonly onHome: () => void;
}

const HIGHLIGHT =
  'rounded-2xl ring-4 ring-lantern ring-offset-2 ring-offset-night animate-pulse relative z-20';

export function GameScreen({
  controller,
  onShowResult,
  onQuit,
  coach,
  notice,
}: {
  controller: GameController;
  onShowResult: () => void;
  onQuit: () => void;
  coach?: CoachProps | undefined;
  /** Online: the server's latest refusal (an i18n key; the id changes each time). */
  notice?: { readonly id: number; readonly key: string } | null | undefined;
}) {
  const { t } = useTranslation();
  const { view, seats, recentEvents, sharedDevice, handoff, online } = useSnapshot(controller);
  const seatName = useSeatName(seats);
  // Pass-and-play: a secret move's cover goes up at once (and freezes the stage); an open
  // move's cover waits until the events on screen have played.
  const stage = useStage(controller, Boolean(handoff?.secret));
  const covered = handoff !== null && (handoff.secret || !stage.current);
  /** Who "you" is in labels — nobody, when several players share the screen. */
  const you = sharedDevice ? null : view.viewer;
  const moodOf = (id: string) => stage.moods[id] ?? 'normal';
  // The coach speaks only when the game has caught up (stage idle) and its step applies.
  const coachStep = coach && !stage.current && coach.state.ready ? coach.state.step : null;
  const target = coachStep?.target ?? null;
  const hl = (t: TutorialTarget) => (target === t ? HIGHLIGHT : '');
  const [bid, setBid] = useState<number | null>(null);
  const [toDiscard, setToDiscard] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState<'discard' | 'menu' | 'emote' | { player: string } | null>(
    null,
  );
  // A new holder starts with a clean slate: never inherit the last player's picks.
  const [shownViewer, setShownViewer] = useState(view.viewer);
  if (shownViewer !== view.viewer) {
    setShownViewer(view.viewer);
    setBid(null);
    setToDiscard([]);
    setError(null);
    setModal(null);
  }
  // Online refusals arrive after the tap; show them where local errors appear.
  const [shownNotice, setShownNotice] = useState(notice?.id ?? 0);
  if (notice && notice.id !== shownNotice) {
    setShownNotice(notice.id);
    setError(t(notice.key));
  }

  // Null when watching an online game without a seat.
  const me = view.players.find((p) => p.id === view.viewer) ?? null;
  const myTurn = view.currentPlayer === view.viewer;
  const feed = useMemo(
    () =>
      recentEvents
        .map((e) => describeEvent(e, seatName, (kind) => t(`card.${kind}`)))
        .filter((line) => line !== null),
    [recentEvents, seatName, t],
  );

  const act = (action: Parameters<GameController['dispatch']>[0]) => {
    const err = controller.dispatch(action);
    setError(err ? t(err) : null);
    return err === null;
  };

  const statusOf = (id: string): PlayerStatus => {
    const p = view.players.find((x) => x.id === id)!;
    if (view.phase === 'bidding')
      return p.hasBid ? 'ready' : id === view.viewer ? null : 'thinking';
    if (view.phase === 'discard') {
      if (p.mustDiscard === 0) return null;
      return p.hasDiscarded ? 'ready' : 'thinking';
    }
    return view.currentPlayer === id ? 'turn' : null;
  };

  const phaseTitle = t(`phase.${view.phase}`);
  const needsMe =
    me !== null &&
    (myTurn ||
      (view.phase === 'bidding' && !me.hasBid) ||
      (view.phase === 'discard' && me.mustDiscard > 0 && !me.hasDiscarded));
  const hint = me
    ? hintFor(view, myTurn, me.mustDiscard, seatName, t)
    : view.phase === 'gameOver'
      ? t('hint.gameOver')
      : t('online.watching');
  const presenceOf = (id: string) => online?.presence[id] ?? null;
  const canEmote = online !== undefined && !online.spectating && me !== null;
  const opponents = view.players.filter((p) => p.id !== view.viewer);
  const seatOf = (id: string) => seats.find((s) => s.id === id)!;
  const opened =
    modal && typeof modal === 'object' ? view.players.find((p) => p.id === modal.player) : null;

  return (
    <>
      <main
        inert={covered}
        aria-hidden={covered || undefined}
        className="mx-auto min-h-dvh max-w-xl px-3 pt-2 lg:grid lg:max-w-7xl lg:grid-cols-[16rem_minmax(0,1fr)_17rem] lg:items-start lg:gap-5 lg:px-6 lg:pt-4"
      >
        {/* desktop: opponents sit down the left side of the table, hands open */}
        <aside
          className="hidden lg:sticky lg:top-4 lg:flex lg:flex-col lg:gap-3"
          aria-label={t('setup.opponents', { count: opponents.length })}
        >
          {opponents.map((p) => (
            <div key={p.id} className="rounded-3xl bg-night-2/70 p-2">
              <PlayerBadge
                player={p}
                seat={seatOf(p.id)}
                name={seatName(p.id)}
                status={statusOf(p.id)}
                presence={presenceOf(p.id)}
                mood={moodOf(p.id)}
                onOpen={() => setModal({ player: p.id })}
              />
              <HandView cards={p.hand} />
              {p.meals.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {p.meals.map((meal, i) => (
                    <span
                      key={i}
                      className="flex items-center gap-1 rounded-xl bg-night px-1.5 py-0.5 text-xs"
                    >
                      <span className="w-6">
                        <GameCard kind={meal.food} size="fill" />
                      </span>
                      +{meal.points}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </aside>

        <div className="flex min-h-dvh flex-col gap-1.5 lg:min-h-0 lg:rounded-[2rem] lg:border-4 lg:border-night-2 lg:bg-night-2/30 lg:p-4 lg:shadow-[inset_0_0_60px_rgb(0_0_0/0.25)]">
          {/* top bar */}
          <header className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs text-card/70">
                {t('term.round', { round: view.round, rounds: view.config.rounds })}
              </p>
              <h1 className="truncate text-lg leading-tight text-lantern">{phaseTitle}</h1>
            </div>
            <div className="flex shrink-0 gap-2">
              {canEmote && (
                <Button
                  variant="secondary"
                  onClick={() => setModal('emote')}
                  ariaLabel={t('emote.title')}
                >
                  😺
                </Button>
              )}
              <Button variant="secondary" onClick={() => setModal('discard')}>
                {t('action.viewDiscard', { count: view.discard.length })}
              </Button>
              <Button
                variant="secondary"
                onClick={() => setModal('menu')}
                ariaLabel={t('action.menu')}
              >
                ☰
              </Button>
            </div>
          </header>

          {/* opponents (phone / tablet) */}
          <section
            className="grid gap-1.5 lg:hidden"
            style={{ gridTemplateColumns: `repeat(${opponents.length}, minmax(0, 1fr))` }}
          >
            {opponents.map((p) => (
              <PlayerBadge
                key={p.id}
                player={p}
                seat={seatOf(p.id)}
                name={seatName(p.id)}
                status={statusOf(p.id)}
                presence={presenceOf(p.id)}
                mood={moodOf(p.id)}
                stacked={opponents.length >= 3}
                onOpen={() => setModal({ player: p.id })}
              />
            ))}
          </section>

          {/* one-line instruction */}
          <p
            role="status"
            aria-live="polite"
            className={`rounded-2xl px-3 py-1.5 text-center font-display text-base leading-snug ${needsMe ? 'bg-lantern text-ink' : 'bg-night-2 text-card'}`}
          >
            {hint}
          </p>
          {online && <TurnTimer clocks={online.clocks} viewer={view.viewer} name={seatName} />}

          <div className={hl('tieOrder')}>
            <TieOrder view={view} you={you} seats={seats} name={seatName} />
          </div>
          <div className={hl('prices')}>
            <PriceTags prices={view.prices} />
          </div>

          <div className={hl('market')}>
            <MarketStall
              cards={view.market}
              deckCount={view.marketDeckCount}
              onPick={
                view.phase === 'pick' && myTurn && me
                  ? (card: Card) => act({ type: 'pick', playerId: me.id, cardId: card.id })
                  : undefined
              }
            />
          </div>
          <div className={hl('bin')}>
            <TrashArea view={view} />
          </div>
          <div className="lg:hidden">
            <EventFeed lines={feed} />
          </div>

          {/* me (spectators only get the result button) */}
          {me ? (
            <section className="sticky bottom-0 z-10 mt-auto rounded-t-3xl bg-night-2 p-2 pb-3 shadow-[0_-8px_24px_rgb(0_0_0/0.35)] lg:static lg:mt-2 lg:rounded-3xl lg:shadow-none">
              <PlayerBadge
                mood={moodOf(me.id)}
                player={me}
                seat={seatOf(me.id)}
                name={seatName(me.id)}
                status={statusOf(me.id)}
                isYou
              />
              <HandView
                cards={view.hand}
                selectable={view.phase === 'discard' && me.mustDiscard > 0 && !me.hasDiscarded}
                selected={toDiscard}
                onToggle={(card) =>
                  setToDiscard((ids) =>
                    ids.includes(card.id) ? ids.filter((x) => x !== card.id) : [...ids, card.id],
                  )
                }
              />
              <div className="mt-3 space-y-2">
                <Actions
                  view={view}
                  myTurn={myTurn}
                  bid={bid}
                  setBid={setBid}
                  toDiscard={toDiscard}
                  clearDiscard={() => setToDiscard([])}
                  act={act}
                  onShowResult={onShowResult}
                  hl={hl}
                />
                {error && (
                  <p role="alert" className="text-center text-sm text-alert">
                    {error}
                  </p>
                )}
              </div>
            </section>
          ) : (
            view.phase === 'gameOver' && (
              <Button className="mt-auto w-full" onClick={onShowResult}>
                {t('action.seeResult')}
              </Button>
            )
          )}
        </div>

        {/* desktop: history down the right side */}
        <aside className="hidden lg:sticky lg:top-4 lg:block">
          <EventLog lines={feed} />
        </aside>

        {coachStep && coach && (
          <CoachBubble
            stepId={coachStep.id}
            final={coachStep.final ?? false}
            waitsForMove={Boolean(coachStep.expect)}
            low={
              target === 'prices' ||
              target === 'tieOrder' ||
              target === 'market' ||
              target === 'bin'
            }
            onNext={coach.onNext}
            onKeepPlaying={coach.onKeepPlaying}
            onHome={coach.onHome}
          />
        )}

        <Stage
          staged={covered ? null : stage.current}
          seats={seats}
          viewer={you}
          name={seatName}
          onSkip={stage.skip}
        />

        {modal === 'discard' && (
          <Modal
            title={t('term.discardPile')}
            onClose={() => setModal(null)}
            closeLabel={t('action.close')}
          >
            <HandView cards={view.discard} />
          </Modal>
        )}
        {online && <EmoteToasts emotes={online.emotes} seats={seats} name={seatName} />}
        {modal === 'emote' && me && (
          <EmotePicker
            cat={seatOf(me.id).cat}
            onPick={(id) => controller.emote?.(id)}
            onClose={() => setModal(null)}
          />
        )}
        {modal === 'menu' && (
          <Modal
            title={t('action.menu')}
            onClose={() => setModal(null)}
            closeLabel={t('action.close')}
          >
            <div className="grid gap-2">
              <Button onClick={() => setModal(null)}>{t('action.keepPlaying')}</Button>
              <Button variant="secondary" onClick={onQuit}>
                {t('action.quit')}
              </Button>
            </div>
          </Modal>
        )}
        {opened && (
          <Modal
            title={seatName(opened.id)}
            onClose={() => setModal(null)}
            closeLabel={t('action.close')}
          >
            <p className="mb-1 text-sm text-card/80">
              {t('player.meowLeft')}: {opened.meowLeft.join(' · ') || '—'}
            </p>
            <HandView cards={opened.hand} />
            {opened.meals.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {opened.meals.map((meal, i) => (
                  <span
                    key={i}
                    className="flex items-center gap-1 rounded-xl bg-night px-2 py-1 text-sm"
                  >
                    <GameCard kind={meal.food} size="xs" />+{meal.points}
                  </span>
                ))}
              </div>
            )}
          </Modal>
        )}
      </main>
      {covered && (
        <HandoffCover
          seat={seatOf(handoff.to)}
          name={seatName(handoff.to)}
          phase={view.phase}
          onReady={() => controller.acceptHandoff?.()}
          onQuit={onQuit}
        />
      )}
    </>
  );
}

function TieOrder({
  view,
  you,
  seats,
  name,
}: {
  view: PlayerView;
  you: string | null;
  seats: readonly SeatInfo[];
  name: (id: string) => string;
}) {
  const { t } = useTranslation();
  const label = view.tieOrder
    .map((id, i) => `${i + 1}. ${id === you ? t('term.you') : name(id)}`)
    .join(', ');
  return (
    <div
      className="flex items-center gap-1.5 text-xs text-card/80"
      aria-label={`${t('term.tieOrder')}: ${label}`}
    >
      <span aria-hidden>{t('term.tieOrder')}</span>
      <ol className="flex items-center gap-1" aria-hidden>
        {view.tieOrder.map((id, i) => {
          const seat = seats.find((s) => s.id === id)!;
          return (
            <li
              key={id}
              className={`flex items-center gap-0.5 rounded-full py-0.5 pr-1.5 pl-0.5 ${id === you ? 'bg-lantern text-ink' : 'bg-night-2'}`}
            >
              <span className="size-5">
                <CatArt color={seat.cat} />
              </span>
              <span className="font-display">{i + 1}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function hintFor(
  view: PlayerView,
  myTurn: boolean,
  mustDiscard: number,
  name: (id: string | null) => string,
  t: TFunction,
): string {
  const me = view.players.find((p) => p.id === view.viewer)!;
  const current = name(view.currentPlayer);
  switch (view.phase) {
    case 'bidding': {
      const done = view.players.filter((p) => p.hasBid).length;
      return me.hasBid
        ? t('hint.biddingWaiting', { done, total: view.players.length })
        : t('hint.biddingChoose');
    }
    case 'pick':
      return myTurn ? t('hint.pickYours') : t('hint.pickWaiting', { name: current });
    case 'trash':
      if (!myTurn) return t('hint.trashWaiting', { name: current });
      return view.pendingDog ? t('hint.trashDog') : t('hint.trashYours');
    case 'eat':
      return myTurn ? t('hint.eatYours') : t('hint.eatWaiting', { name: current });
    case 'discard':
      return mustDiscard > 0 && !me.hasDiscarded
        ? t('hint.discardYours', { count: mustDiscard })
        : t('hint.discardWaiting');
    case 'gameOver':
      return t('hint.gameOver');
  }
}

function Actions({
  view,
  myTurn,
  bid,
  setBid,
  toDiscard,
  clearDiscard,
  act,
  onShowResult,
  hl,
}: {
  view: PlayerView;
  myTurn: boolean;
  bid: number | null;
  setBid: (v: number | null) => void;
  toDiscard: number[];
  clearDiscard: () => void;
  act: (action: Parameters<GameController['dispatch']>[0]) => boolean;
  onShowResult: () => void;
  hl: (target: TutorialTarget) => string;
}) {
  const { t } = useTranslation();
  const me = view.players.find((p) => p.id === view.viewer)!;
  const playerId = me.id;

  if (view.phase === 'bidding' && !me.hasBid) {
    return (
      <div className={`space-y-2 ${hl('meow')}`}>
        <div className="flex justify-center gap-1.5" role="group" aria-label={t('card.meow')}>
          {[...me.meowLeft]
            .sort((a, b) => a - b)
            .map((value) => (
              <MeowCard
                key={value}
                value={value}
                label={`${t('card.meow')} ${value}`}
                selected={bid === value}
                onSelect={() => setBid(value)}
              />
            ))}
        </div>
        <Button
          className="w-full"
          disabledReason={bid === null ? t('hint.biddingChoose') : null}
          onClick={() => {
            if (bid !== null && act({ type: 'bid', playerId, value: bid })) setBid(null);
          }}
        >
          {t('action.bid')}
          {bid !== null && ` ${bid}`}
        </Button>
      </div>
    );
  }

  if (view.phase === 'trash' && myTurn) {
    if (view.pendingDog) {
      return (
        <div className="grid grid-cols-2 gap-2">
          <Button
            className={hl('bone')}
            onClick={() => act({ type: 'resolveDog', playerId, useBone: true })}
          >
            {t('action.throwBone')}
          </Button>
          <Button
            variant="danger"
            onClick={() => act({ type: 'resolveDog', playerId, useBone: false })}
          >
            {t('action.acceptDog')}
          </Button>
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 gap-2">
        <Button
          className={hl('dig')}
          disabledReason={view.trashDiggable ? null : t('reason.digDisabled')}
          onClick={() => act({ type: 'dig', playerId })}
        >
          {t('term.dig')}
        </Button>
        <Button
          className={hl('stop')}
          variant="secondary"
          onClick={() => act({ type: 'stop', playerId })}
        >
          {t('term.stop')}
        </Button>
      </div>
    );
  }

  if (view.phase === 'eat' && myTurn) {
    const options = bestMealOptions(findMealOptions(view.hand, view.config));
    return (
      <div className="grid gap-2">
        {options.map((option) => (
          <Button
            className={hl('eat')}
            key={`${option.food}-${option.big}-${option.usesGoldfish}`}
            onClick={() => act({ type: 'eat', playerId, cardIds: option.cardIds })}
          >
            {t(option.big ? 'action.eatBigMeal' : 'action.eatMeal', {
              food: t(`card.${option.food}`),
              points: pointsOf(view, option),
            })}
            {option.usesGoldfish && (
              <span className="block text-xs">{t('action.withGoldfish')}</span>
            )}
          </Button>
        ))}
        <Button variant="secondary" onClick={() => act({ type: 'finishEating', playerId })}>
          {t('action.finishEating')}
        </Button>
      </div>
    );
  }

  if (view.phase === 'discard' && me.mustDiscard > 0 && !me.hasDiscarded) {
    const ready = toDiscard.length === me.mustDiscard;
    return (
      <Button
        className="w-full"
        disabledReason={ready ? null : t('reason.discardCount', { count: me.mustDiscard })}
        onClick={() => {
          if (act({ type: 'discard', playerId, cardIds: toDiscard })) clearDiscard();
        }}
      >
        {t('action.discardConfirm', { count: me.mustDiscard })}
      </Button>
    );
  }

  if (view.phase === 'gameOver') {
    return (
      <Button className="w-full" onClick={onShowResult}>
        {t('action.seeResult')}
      </Button>
    );
  }
  return null;
}

function pointsOf(view: PlayerView, option: MealOption): number {
  const price = view.prices[option.food];
  return option.big ? price * view.config.bigMealMultiplier : price;
}

/** One button per food and size; offer the goldfish version only when it is the only way. */
function bestMealOptions(options: readonly MealOption[]): MealOption[] {
  const byShape = new Map<string, MealOption>();
  for (const option of options) {
    const key = `${option.food}-${option.big}`;
    const existing = byShape.get(key);
    if (!existing || (existing.usesGoldfish && !option.usesGoldfish)) byShape.set(key, option);
  }
  return [...byShape.values()];
}
