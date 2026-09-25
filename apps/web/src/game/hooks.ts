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
        // "Greedy Ginger": the bot's personality + its cat (cats are unique, so no twins).
        return t('botName', {
          cat: t(`catShort.${seat.cat}`),
          trait: t(`trait.${seat.bot.personality}`),
        });
      }
      if (seat.name?.trim()) return seat.name.trim();
      // Pass-and-play: unnamed humans are told apart by number ("Player 2").
      const humans = seats.filter((s) => !s.bot);
      return humans.length > 1
        ? t('local.playerN', { n: humans.indexOf(seat) + 1 })
        : t('setup.namePlaceholder');
    },
    [seats, t],
  );
}

export interface FeedLine {
  readonly key: string;
  readonly params: Record<string, string | number>;
  readonly tone: 'info' | 'good' | 'bad';
}

/**
 * Turns engine events into short feed lines (i18n key + params). Unlisted events are
 * silent. `label` translates a key (card, power and event names go into the params).
 */
export function describeEvent(
  event: GameEvent,
  name: (id: PlayerId) => string,
  label: (key: string) => string,
): FeedLine | null {
  const cardName = (kind: string) => label(`card.${kind}`);
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
    // ── cat powers ──
    case 'POWER_USED':
      return {
        key: 'feed.power',
        params: { name: name(event.playerId), power: label(`powerName.${event.power}`) },
        tone: 'good',
      };
    case 'BID_CHANGED':
      return {
        key: 'feed.bidChanged',
        params: { name: name(event.playerId), from: event.from, to: event.to },
        tone: 'info',
      };
    case 'MARKET_SWAPPED':
      return {
        key: 'feed.swapped',
        params: {
          name: name(event.playerId),
          out: cardName(event.out.kind),
          in: cardName(event.in.kind),
        },
        tone: 'info',
      };
    case 'CARD_SCAVENGED':
      return {
        key: 'feed.scavenged',
        params: { name: name(event.playerId), card: cardName(event.card.kind) },
        tone: 'info',
      };
    case 'PRICE_CHANGED':
      return {
        key: 'feed.price',
        params: { food: cardName(event.food), from: event.from, to: event.to },
        tone: 'info',
      };
    case 'POWERS_RESTORED':
      return { key: 'feed.restored', params: {}, tone: 'good' };
    // ── market events ──
    case 'EVENT_REVEALED':
      return {
        key: 'feed.event',
        params: { event: label(`eventName.${event.event}`) },
        tone: 'info',
      };
    case 'DOGS_SET_ASIDE':
      return { key: 'feed.dogsAway', params: { count: event.count }, tone: 'good' };
    case 'DOGS_BACK':
      return { key: 'feed.dogsBack', params: { count: event.count }, tone: 'info' };
    case 'VENDOR_GIFT':
      return {
        key: 'feed.gift',
        params: { name: name(event.playerId), card: cardName(event.card.kind) },
        tone: 'good',
      };
    case 'DOG_SLEPT':
      return { key: 'feed.slept', params: { name: name(event.playerId) }, tone: 'good' };
    case 'CARDS_PASSED':
      return { key: 'feed.passed', params: {}, tone: 'info' };
    default:
      return null;
  }
}
