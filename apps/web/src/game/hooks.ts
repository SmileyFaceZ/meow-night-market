import type { GameEvent, PlayerId } from '@meow/engine';
import { useCallback, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import type { ControllerSnapshot, GameController, SeatInfo } from './types';

export function useSnapshot(controller: GameController): ControllerSnapshot {
  return useSyncExternalStore(controller.subscribe, controller.getSnapshot);
}

/** Display name of a seat: the human's nickname, or the bot's i18n name. */
export function useSeatName(seats: readonly SeatInfo[]) {
  const { t } = useTranslation();
  return useCallback(
    (id: PlayerId | null | undefined): string => {
      const seat = seats.find((s) => s.id === id);
      if (!seat) return '';
      if (seat.bot) {
        const personality = seat.bot.personality;
        const twins = seats.filter((s) => s.bot?.personality === personality);
        const base = t(`bot.${personality}`);
        // Two bots with the same personality get a number: "Careful Snowy 2".
        return twins.length > 1 ? `${base} ${twins.indexOf(seat) + 1}` : base;
      }
      return seat.name?.trim() || t('setup.namePlaceholder');
    },
    [seats, t],
  );
}

export interface FeedLine {
  readonly key: string;
  readonly params: Record<string, string | number>;
  readonly tone: 'info' | 'good' | 'bad';
}

/** Turns engine events into short feed lines (i18n key + params). Unlisted events are silent. */
export function describeEvent(
  event: GameEvent,
  name: (id: PlayerId) => string,
  cardName: (kind: string) => string,
): FeedLine | null {
  switch (event.type) {
    case 'ROUND_STARTED':
      return { key: 'feed.round', params: { round: event.round }, tone: 'info' };
    case 'BID_CLASH':
      return {
        key: 'feed.clash',
        params: { names: event.playerIds.map(name).join(', '), value: event.value },
        tone: 'bad',
      };
    case 'CARD_PICKED':
      return {
        key: 'feed.picked',
        params: { name: name(event.playerId), card: cardName(event.card.kind) },
        tone: 'info',
      };
    case 'CARD_DUG':
      return event.to === 'dog'
        ? null
        : {
            key: 'feed.dug',
            params: { name: name(event.playerId), card: cardName(event.card.kind) },
            tone: 'info',
          };
    case 'DOG_APPEARED':
      return { key: 'feed.dog', params: { name: name(event.playerId) }, tone: 'bad' };
    case 'BONE_THROWN':
      return { key: 'feed.bone', params: { name: name(event.playerId) }, tone: 'good' };
    case 'DOG_CAUGHT':
      return {
        key: 'feed.caught',
        params: { name: name(event.playerId), count: event.lost.length },
        tone: 'bad',
      };
    case 'BAG_KEPT':
      return {
        key: 'feed.kept',
        params: { name: name(event.playerId), count: event.cards.length },
        tone: 'good',
      };
    case 'MEAL_EATEN':
      return {
        key: event.meal.big ? 'feed.bigMeal' : 'feed.meal',
        params: {
          name: name(event.playerId),
          food: cardName(event.meal.food),
          points: event.meal.points,
        },
        tone: 'good',
      };
    case 'TURN_SKIPPED':
      return { key: 'feed.skipped', params: { name: name(event.playerId) }, tone: 'info' };
    case 'CARDS_DISCARDED':
      return {
        key: 'feed.discarded',
        params: { name: name(event.playerId), count: event.cards.length },
        tone: 'info',
      };
    case 'TRASH_RESHUFFLED':
      return event.count > 0 ? { key: 'feed.reshuffle', params: {}, tone: 'info' } : null;
    default:
      return null;
  }
}
