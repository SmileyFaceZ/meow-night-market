import { CAT_IDS, CAT_POWER, type CardKind, DEFAULT_CONFIG, EVENT_IDS } from '@meow/engine';
import { type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BinArt } from '../art/BinArt';
import { CatArt } from '../art/CatArt';
import { EventIcon } from '../art/EventIcon';
import { PowerIcon } from '../art/PowerIcon';
import { GameCard, MeowCard } from '../components/cards';
import { Button } from '../components/ui';
import { eventDescParams } from '../game/mayhem';

type Tab = 'basics' | 'mayhem';

/**
 * Visual how-to-play page: the basics (GAME_RULES §11 is the source for the "who goes
 * first" lines) and a Market Mayhem tab listing every power and event (§14–15).
 */
export function HowToScreen({
  onBack,
  onTutorial,
  initialTab = 'basics',
}: {
  onBack: () => void;
  onTutorial?: (() => void) | undefined;
  initialTab?: Tab;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>(initialTab);
  const tabButton = (id: Tab, label: string) => (
    <button
      type="button"
      role="tab"
      id={`howto-tab-${id}`}
      aria-selected={tab === id}
      aria-controls="howto-panel"
      onClick={() => setTab(id)}
      className={`min-h-tap rounded-xl px-2 font-display ${tab === id ? 'bg-lantern text-ink' : 'bg-night-2 text-card'}`}
    >
      {label}
    </button>
  );
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-4 px-4 pt-4 pb-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl text-lantern">{t('howto.title')}</h1>
        <Button variant="secondary" onClick={onBack}>
          {t('howto.back')}
        </Button>
      </header>
      <div className="grid grid-cols-2 gap-1.5" role="tablist" aria-label={t('howto.title')}>
        {tabButton('basics', t('howto.tabBasics'))}
        {tabButton('mayhem', t('mode.chaos'))}
      </div>
      <div
        id="howto-panel"
        role="tabpanel"
        aria-labelledby={`howto-tab-${tab}`}
        className="flex flex-col gap-4"
      >
        {tab === 'basics' ? <Basics /> : <Mayhem />}
      </div>

      <div className="grid gap-2">
        {onTutorial && <Button onClick={onTutorial}>{t('howto.startTutorial')}</Button>}
        <Button variant="secondary" onClick={onBack}>
          {t('howto.back')}
        </Button>
      </div>
    </main>
  );
}

function Basics() {
  const { t } = useTranslation();
  return (
    <>
      <Panel>
        <div className="flex items-center gap-3">
          <span className="size-16 shrink-0">
            <CatArt color="calico" mood="full" />
          </span>
          <p>{t('howto.goal')}</p>
        </div>
      </Panel>

      <h2 className="text-xl">{t('howto.roundTitle')}</h2>
      <Step n={1} title={t('phase.bidding')} art={<MeowRow />}>
        {t('howto.biddingText')}
      </Step>
      <Step
        n={2}
        title={t('phase.trash')}
        art={
          <span className="flex items-end gap-1">
            <span className="size-14">
              <BinArt mood="uneasy" />
            </span>
            <Mini kind="bone" />
            <Mini kind="dog" />
          </span>
        }
      >
        {t('howto.trashText')}
      </Step>
      <Step
        n={3}
        title={t('phase.eat')}
        art={
          <span className="flex -space-x-3">
            <Mini kind="fish" />
            <Mini kind="fish" />
            <Mini kind="fish" />
          </span>
        }
      >
        {t('howto.eatText')}
      </Step>

      <Panel>
        <h2 className="mb-2 text-xl">{t('howto.orderTitle')}</h2>
        <ul className="space-y-2">
          {(
            [
              ['phase.bidding', 'howto.orderRound'],
              ['phase.pick', 'howto.orderPickUnique'],
              ['phase.pick', 'howto.orderPickClash'],
              ['phase.trash', 'howto.orderDig'],
              ['phase.trash', 'howto.orderDigTie'],
              ['phase.eat', 'howto.orderEat'],
              ['phase.eat', 'howto.orderSkip'],
            ] as const
          ).map(([phase, line]) => (
            <li key={line} className="flex gap-2">
              <span className="w-24 shrink-0 font-display text-sm text-lantern">{t(phase)}</span>
              <span>{t(line)}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel>
        <h2 className="mb-2 text-xl">{t('howto.scoreTitle')}</h2>
        <ul className="space-y-2">
          <Rule art={<Row kinds={['milk', 'milk', 'milk']} />}>{t('howto.scoreMeal')}</Rule>
          <Rule art={<Row kinds={['shrimp', 'shrimp', 'shrimp', 'shrimp']} />}>
            {t('howto.scoreBig')}
          </Rule>
          <Rule art={<Row kinds={['chicken', 'chicken', 'goldfish']} />}>
            {t('howto.scoreGold')}
          </Rule>
          <Rule art={<Row kinds={['fish', 'snack', 'milk']} />}>{t('howto.scoreBonus')}</Rule>
          <li className="text-card/80">{t('howto.scoreLimit')}</li>
        </ul>
      </Panel>

      <Panel>
        <h2 className="mb-2 text-xl">{t('howto.dogTitle')}</h2>
        <div className="flex items-center gap-3">
          <span className="flex shrink-0 gap-1">
            <Mini kind="bone" />
            <Mini kind="dog" />
          </span>
          <p>{t('howto.dogText')}</p>
        </div>
        <div className="mt-3 flex justify-around" aria-hidden>
          {(['calm', 'uneasy', 'scared'] as const).map((mood) => (
            <span key={mood} className="flex flex-col items-center text-xs text-card/80">
              <span className="size-12">
                <BinArt mood={mood} />
              </span>
              {t(`bin.${mood}`)}
            </span>
          ))}
        </div>
      </Panel>
    </>
  );
}

/** Market Mayhem: the extra rules, all 8 cats with their powers, all 13 events. */
function Mayhem() {
  const { t } = useTranslation();
  return (
    <>
      <Panel>
        <p>{t('howto.mayhemText')}</p>
      </Panel>

      <Panel>
        <h2 className="mb-2 text-xl">{t('term.power')}</h2>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-card/85">
          {(['powerOnce', 'powerOpen', 'powerWait', 'powerTimer'] as const).map((key) => (
            <li key={key}>{t(`howto.${key}`)}</li>
          ))}
        </ul>
        <ul className="space-y-3">
          {CAT_IDS.map((cat) => {
            const power = CAT_POWER[cat];
            return (
              <li key={cat} className="flex items-start gap-3">
                <span className="relative size-12 shrink-0">
                  <CatArt color={cat} />
                  <span className="absolute -right-1.5 -bottom-1 size-6">
                    <PowerIcon power={power} />
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block font-display leading-tight">
                    {t(`powerName.${power}`)}
                    <span className="ml-2 text-xs text-card/70">{t(`cat.${cat}`)}</span>
                  </span>
                  <span className="block text-sm leading-snug text-card/85">
                    {t(`powerDesc.${power}`)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel>
        <h2 className="mb-2 text-xl">{t('term.event')}</h2>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-sm text-card/85">
          {(['eventDeck', 'eventMoon', 'eventStall'] as const).map((key) => (
            <li key={key}>{t(`howto.${key}`)}</li>
          ))}
        </ul>
        <ul className="space-y-3">
          {EVENT_IDS.map((event) => (
            <li key={event} className="flex items-start gap-3">
              <span className="size-10 shrink-0">
                <EventIcon event={event} />
              </span>
              <span className="min-w-0">
                <span className="block font-display leading-tight">{t(`eventName.${event}`)}</span>
                <span className="block text-sm leading-snug text-card/85">
                  {t(`eventDesc.${event}`, eventDescParams(event, DEFAULT_CONFIG))}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Panel>
    </>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-3xl bg-night-2 p-4 leading-relaxed">{children}</section>;
}

function Step({
  n,
  title,
  art,
  children,
}: {
  n: number;
  title: string;
  art: ReactNode;
  children: ReactNode;
}) {
  return (
    <Panel>
      <div className="mb-2 flex items-center gap-2">
        <span className="grid size-8 place-items-center rounded-full bg-lantern font-display text-ink">
          {n}
        </span>
        <h3 className="text-lg">{title}</h3>
      </div>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="shrink-0">{art}</span>
        <p>{children}</p>
      </div>
    </Panel>
  );
}

function Mini({ kind }: { kind: CardKind }) {
  return (
    <span className="inline-block w-10">
      <GameCard kind={kind} size="fill" />
    </span>
  );
}

function Row({ kinds }: { kinds: CardKind[] }) {
  return (
    <span className="flex -space-x-4">
      {kinds.map((kind, i) => (
        <Mini key={i} kind={kind} />
      ))}
    </span>
  );
}

function Rule({ art, children }: { art: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-3">
      <span className="w-24 shrink-0">{art}</span>
      <span>{children}</span>
    </li>
  );
}

function MeowRow() {
  const { t } = useTranslation();
  return (
    <span className="flex -space-x-2">
      {[1, 3, 5].map((v) => (
        <MeowCard key={v} value={v} label={`${t('card.meow')} ${v}`} />
      ))}
    </span>
  );
}
