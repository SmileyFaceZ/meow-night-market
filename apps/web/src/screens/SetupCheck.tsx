import { useTranslation } from 'react-i18next';
import { setLanguage } from '../i18n';

// Phase 0 placeholder: proves Tailwind, design tokens, fonts and i18n are wired up.
// Replaced by the real Home screen in Phase 3.

const SWATCHES = [
  { key: 'card.fish', color: 'var(--fish)' },
  { key: 'card.chicken', color: 'var(--chicken)' },
  { key: 'card.shrimp', color: 'var(--shrimp)' },
  { key: 'card.milk', color: 'var(--milk)', edge: 'var(--milk-edge)' },
  { key: 'card.snack', color: 'var(--snack)' },
  { key: 'card.goldfish', color: 'var(--gold)' },
  { key: 'card.bone', color: 'var(--card)' },
  { key: 'card.dog', color: 'var(--danger)' },
] as const;

const LANTERNS = 9;

export function SetupCheck() {
  const { t, i18n } = useTranslation();
  const nextLang = i18n.language === 'th' ? 'en' : 'th';

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

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl leading-tight font-semibold text-lantern">
            {t('game.title')}
          </h1>
          <p className="mt-1 text-card/85">{t('game.tagline')}</p>
        </div>
        <button
          type="button"
          onClick={() => setLanguage(nextLang)}
          aria-label={t('lang.switchLabel')}
          className="min-h-tap min-w-tap shrink-0 rounded-full border-2 border-lantern px-4 text-lantern transition-colors hover:bg-lantern hover:text-ink"
        >
          {t('lang.switchTo')}
        </button>
      </header>

      <section className="rounded-2xl bg-night-2 p-4">
        <p className="font-display text-lg text-lantern">{t('dev.setupDone')}</p>
        <p className="text-card/85">{t('dev.comingSoon')}</p>
      </section>

      <section>
        <h2 className="mb-3 text-xl">{t('dev.palette')}</h2>
        <ul className="grid grid-cols-4 gap-3">
          {SWATCHES.map(({ key, color, ...rest }) => (
            <li
              key={key}
              className="flex aspect-[var(--card-ratio)] flex-col overflow-hidden rounded-card border-[length:var(--stroke)] border-ink bg-card shadow-lg"
            >
              <span
                className="flex-1"
                style={{
                  background: color,
                  borderBottom: `var(--stroke) solid ${'edge' in rest ? rest.edge : 'var(--ink)'}`,
                }}
              />
              <span className="px-1 py-1 text-center font-display text-xs leading-snug text-ink sm:text-sm">
                {t(key)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl">{t('dev.fonts')}</h2>
        <p className="font-display text-2xl">{t('dev.fontDisplay')}</p>
        <p>{t('dev.fontBody')}</p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {(['mode.solo', 'mode.local', 'mode.online'] as const).map((key) => (
            <li key={key} className="rounded-full bg-lantern px-4 py-2 font-display text-ink">
              {t(key)}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
