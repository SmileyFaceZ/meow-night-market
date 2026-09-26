import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN } from '@meow/protocol';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui';
import { cleanCode, hasSeatToken, type Profile } from '../game/online';
import { loadSetup, storeSetup } from '../game/setup';
import { NAME_MAX_LENGTH } from '../game/types';

/**
 * "Play online": choose a nickname, then create a room or join one by code (the cat is
 * picked in the waiting room — DECISIONS 052).
 * Opened from a shared link (/room/ABCD), it goes straight to joining that room.
 */
export function OnlineScreen({
  linkCode,
  onCreate,
  onJoin,
  onBack,
}: {
  linkCode: string | null;
  onCreate: (profile: Profile) => Promise<void>;
  onJoin: (code: string, profile: Profile) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [profile, setProfile] = useState<Profile>(() => {
    return { name: loadSetup().name };
  });
  const [code, setCode] = useState(linkCode ?? '');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const remember = () => storeSetup({ ...loadSetup(), name: profile.name });
  const codeReady = ROOM_CODE_PATTERN.test(code);

  // A refresh inside a room: this tab still holds the seat, so go straight back in.
  const rejoined = useRef(false);
  useEffect(() => {
    if (rejoined.current || !linkCode || !hasSeatToken(linkCode)) return;
    rejoined.current = true;
    onJoin(linkCode, profile);
  }, [linkCode, onJoin, profile]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-5 px-4 pt-4 pb-10">
      <header className="flex items-center justify-between gap-3">
        <h1 className="text-2xl text-lantern">{t('mode.online')}</h1>
        <Button variant="secondary" onClick={onBack}>
          {t('setup.back')}
        </Button>
      </header>

      <section className="grid gap-2">
        <label htmlFor="online-name" className="font-display">
          {t('setup.yourName')}
        </label>
        <input
          id="online-name"
          value={profile.name}
          maxLength={NAME_MAX_LENGTH}
          placeholder={t('setup.namePlaceholder')}
          onChange={(e) =>
            setProfile((p) => ({ ...p, name: e.target.value.slice(0, NAME_MAX_LENGTH) }))
          }
          className="min-h-tap rounded-2xl border-2 border-card/30 bg-night-2 px-4 text-lg text-card placeholder:text-card/40 focus:border-lantern"
        />
        <p className="text-sm text-card/70">{t('online.catInRoom')}</p>
      </section>

      {linkCode ? (
        <Button
          onClick={() => {
            remember();
            onJoin(linkCode, profile);
          }}
        >
          {t('online.joinRoom', { code: linkCode })}
        </Button>
      ) : (
        <>
          <section className="grid gap-2">
            <Button
              disabledReason={busy ? t('online.creating') : null}
              onClick={() => {
                remember();
                setBusy(true);
                setFailed(false);
                onCreate(profile).catch(() => {
                  setBusy(false);
                  setFailed(true);
                });
              }}
            >
              {busy ? t('online.creating') : t('online.create')}
            </Button>
            {failed && (
              <p role="alert" className="text-center text-sm text-alert">
                {t('online.createFailed')}
              </p>
            )}
          </section>

          <p className="text-center text-sm text-card/60">{t('online.or')}</p>

          <section className="grid gap-2">
            <label htmlFor="room-code" className="font-display">
              {t('online.codeLabel')}
            </label>
            <div className="flex gap-2">
              <input
                id="room-code"
                value={code}
                inputMode="text"
                autoCapitalize="characters"
                autoComplete="off"
                placeholder={t('online.codePlaceholder')}
                onChange={(e) => setCode(cleanCode(e.target.value))}
                className="min-h-tap w-full min-w-0 rounded-2xl border-2 border-card/30 bg-night-2 px-4 text-center font-display text-2xl tracking-[0.4em] text-card uppercase placeholder:text-base placeholder:tracking-normal placeholder:text-card/40 focus:border-lantern"
              />
              <Button
                variant="secondary"
                className="shrink-0"
                disabledReason={codeReady ? null : t('online.codeHint', { n: ROOM_CODE_LENGTH })}
                onClick={() => {
                  remember();
                  onJoin(code, profile);
                }}
              >
                {t('online.join')}
              </Button>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
