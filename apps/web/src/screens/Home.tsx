import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { Button } from '../components/ui';
import type { GameSave } from '../game/save';
import { hasSeenTutorial } from '../game/tutorial';
import { setLanguage } from '../i18n';

const LANTERNS = 9;

export function HomeScreen({
  save,
  onContinue,
  onSolo,
  onLocal,
  onOnline,
  onHowTo,
  onTutorial,
}: {
  save: GameSave | null;
  onContinue: () => void;
  onSolo: () => void;
  onLocal: () => void;
  onOnline: () => void;
  onHowTo: () => void;
  onTutorial: () => void;
}) {
  const { t, i18n } = useTranslation();
  const nextLang = i18n.language === 'th' ? 'en' : 'th';
  const [firstTime] = useState(() => !hasSeenTutorial());
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 px-4 pt-2 pb-10">
      <div aria-hidden className="relative h-10">
        <div className="absolute inset-x-0 top-3 h-px bg-card/30" />
        <div className="flex justify-between px-2">
          {Array.from({ length: LANTERNS }, (_, i) => (
            <span
              key={i}
              className="mt-2 size-4 rounded-full bg-lantern shadow-[0_0_14px_4px_rgb(255_200_87/0.45)]"
            />
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          variant="secondary"
          onClick={() => setLanguage(nextLang)}
          ariaLabel={t('lang.switchLabel')}
        >
          {t('lang.switchTo')}
        </Button>
      </div>

      <header className="flex flex-col items-center gap-3 text-center">
        <div className="flex -space-x-3" aria-hidden>
          {(['orange', 'black', 'white', 'calico'] as const).map((cat) => (
            <span key={cat} className="size-20">
              <CatArt color={cat} mood="happy" />
            </span>
          ))}
        </div>
        <h1 className="font-display text-4xl leading-tight font-semibold text-lantern">
          {t('game.title')}
        </h1>
        <p className="text-card/85">{t('game.tagline')}</p>
      </header>

      <nav className="mx-auto grid w-full max-w-sm gap-3">
        {firstTime && (
          <Button onClick={onTutorial}>
            {t('tutorial.start')}
            <span className="block text-sm opacity-80">{t('tutorial.firstTime')}</span>
          </Button>
        )}
        {save && (
          <Button onClick={onContinue}>
            {t('home.continue')}
            <span className="block text-sm opacity-80">
              {t(
                save.seats.filter((s) => !s.bot).length > 1
                  ? 'home.continueLocalHint'
                  : 'home.continueHint',
                { round: save.state.round, players: save.seats.length },
              )}
            </span>
          </Button>
        )}
        <Button variant={save || firstTime ? 'secondary' : 'primary'} onClick={onSolo}>
          {t('mode.solo')}
        </Button>
        <Button variant="secondary" onClick={onLocal}>
          {t('mode.local')}
        </Button>
        <Button variant="secondary" onClick={onOnline}>
          {t('mode.online')}
        </Button>
        <Button variant="secondary" onClick={onHowTo}>
          {t('home.howTo')}
        </Button>
      </nav>
    </main>
  );
}
