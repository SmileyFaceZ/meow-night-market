import { CAT_IDS, CAT_POWER, type EventId } from '@meow/engine';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CatArt } from '../art/CatArt';
import { EventIcon } from '../art/EventIcon';
import { PowerIcon } from '../art/PowerIcon';
import { Button, Modal } from './ui';

const EXAMPLE_EVENTS: readonly EventId[] = ['downpour', 'blackout', 'kindVendor', 'gustyWind'];

/** Market Mayhem in two short pages: cat powers, then market events (v2 spec §5). */
export function MayhemIntro({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [page, setPage] = useState<1 | 2>(1);
  return (
    <Modal title={t('intro.title')} onClose={onClose} closeLabel={t('action.close')}>
      <p className="mb-2 text-right text-xs text-card/60">{t('intro.page', { n: page })}</p>
      {page === 1 ? (
        <section className="space-y-3" aria-label={t('term.power')}>
          <h3 className="font-display text-xl text-lantern">{t('term.power')}</h3>
          <ul className="grid grid-cols-4 gap-2" aria-hidden>
            {CAT_IDS.map((cat) => (
              <li key={cat} className="relative mx-auto size-14">
                <CatArt color={cat} mood="happy" />
                <span className="absolute -right-1 -bottom-1 size-6">
                  <PowerIcon power={CAT_POWER[cat]} />
                </span>
              </li>
            ))}
          </ul>
          <p className="leading-relaxed">{t('intro.powersText')}</p>
          <p className="text-sm leading-relaxed text-card/80">{t('intro.powersButton')}</p>
        </section>
      ) : (
        <section className="space-y-3" aria-label={t('term.event')}>
          <h3 className="font-display text-xl text-lantern">{t('term.event')}</h3>
          <ul className="flex justify-center gap-3" aria-hidden>
            {EXAMPLE_EVENTS.map((event) => (
              <li key={event} className="size-14">
                <EventIcon event={event} />
              </li>
            ))}
          </ul>
          <p className="leading-relaxed">{t('intro.eventsText')}</p>
          <p className="text-sm leading-relaxed text-card/80">{t('intro.eventsChip')}</p>
          <p className="text-sm leading-relaxed text-card/80">{t('intro.more')}</p>
        </section>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2">
        {page === 1 ? (
          <>
            <span />
            <Button onClick={() => setPage(2)}>{t('intro.next')}</Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={() => setPage(1)}>
              {t('intro.back')}
            </Button>
            <Button onClick={onClose}>{t('intro.done')}</Button>
          </>
        )}
      </div>
    </Modal>
  );
}
