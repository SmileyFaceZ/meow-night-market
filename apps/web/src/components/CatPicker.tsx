import { CAT_POWER } from '@meow/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { PowerIcon } from '../art/PowerIcon';
import { CAT_COLORS, type CatColor, type CatHolder } from '../game/types';

/**
 * The waiting room's cat picker (online, solo, pass-and-play — DECISIONS 052). Cats other
 * people have are faded with their name; a bot's cat can be taken (the bot draws another).
 * With cat powers, each cat shows its power and a one-line description.
 */
export function CatPicker({
  value,
  holders,
  powers,
  onPick,
  label,
}: {
  value: CatColor | null;
  holders: Partial<Record<CatColor, CatHolder>>;
  powers: boolean;
  onPick: (cat: CatColor) => void;
  label?: string;
}) {
  const { t } = useTranslation();
  const [refused, setRefused] = useState<string | null>(null);
  return (
    <div className="grid gap-1.5">
      <div
        className={`grid gap-2 ${powers ? 'grid-cols-2' : 'grid-cols-4'}`}
        role="radiogroup"
        aria-label={label ?? t('cats.title')}
      >
        {CAT_COLORS.map((cat) => {
          const holder = holders[cat];
          const mine = value === cat;
          const blocked = holder !== undefined && !holder.bot;
          const power = CAT_POWER[cat];
          const holderLine = holder
            ? t(holder.bot ? 'cats.botHas' : 'cats.takenBy', { name: holder.name })
            : null;
          return (
            <button
              key={cat}
              type="button"
              role="radio"
              aria-checked={mine}
              aria-disabled={blocked || undefined}
              aria-label={[t(`cat.${cat}`), powers ? t(`powerName.${power}`) : null, holderLine]
                .filter(Boolean)
                .join(' · ')}
              data-sound={blocked ? undefined : 'meow'}
              onClick={() => {
                if (blocked) return setRefused(t('cats.taken', { name: holder.name }));
                setRefused(null);
                if (!mine) onPick(cat);
              }}
              className={`flex min-h-tap min-w-0 rounded-2xl p-1.5 text-left ${powers ? 'items-start gap-2' : 'flex-col items-center'} ${mine ? 'bg-night-2 ring-2 ring-lantern' : 'bg-night-2/50'} ${blocked ? 'opacity-40' : ''}`}
            >
              <span className={`relative shrink-0 ${powers ? 'size-12' : 'size-11'}`}>
                <CatArt color={cat} mood={mine ? 'happy' : 'normal'} />
                {powers && (
                  <span className="absolute -right-1 -bottom-1 size-6">
                    <PowerIcon power={power} />
                  </span>
                )}
              </span>
              <span className={`min-w-0 ${powers ? '' : 'w-full text-center'}`}>
                <span className="block truncate text-xs">{t(`cat.${cat}`)}</span>
                {powers && (
                  <>
                    <span className="block font-display text-sm leading-tight text-lantern">
                      {t(`powerName.${power}`)}
                    </span>
                    <span className="block text-[0.7rem] leading-snug text-card/75">
                      {t(`powerDesc.${power}`)}
                    </span>
                  </>
                )}
                {holderLine && (
                  <span
                    className={`block truncate text-[0.7rem] leading-tight ${holder?.bot ? 'text-card/70' : 'font-display text-alert'}`}
                  >
                    {holder!.name}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {refused && (
        <p role="status" className="text-sm text-alert">
          {refused}
        </p>
      )}
    </div>
  );
}
