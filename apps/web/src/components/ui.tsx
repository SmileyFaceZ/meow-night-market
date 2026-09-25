import { type ReactNode, type Ref, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANT: Record<Variant, string> = {
  primary:
    'bg-lantern text-ink shadow-[0_0_18px_rgb(255_200_87/0.45)] hover:brightness-105 active:translate-y-px',
  secondary: 'bg-night-2 text-card border-2 border-card/30 hover:border-lantern',
  danger: 'bg-danger text-card hover:brightness-105',
  ghost: 'text-card/90 underline-offset-4 hover:underline',
};

/**
 * Button with a 44px minimum touch target. A disabled button stays tappable and explains
 * why it is disabled (docs/ART_DIRECTION.md › เลย์เอาต์).
 */
export function Button({
  children,
  onClick,
  variant = 'primary',
  disabledReason,
  className = '',
  ariaLabel,
  ref,
}: {
  children: ReactNode;
  onClick: () => void;
  variant?: Variant;
  /** When set, the button looks disabled and tapping it shows this reason. */
  disabledReason?: string | null;
  className?: string;
  ariaLabel?: string;
  ref?: Ref<HTMLButtonElement>;
}) {
  const [showReason, setShowReason] = useState(false);
  useEffect(() => {
    if (!showReason) return;
    const timer = window.setTimeout(() => setShowReason(false), 2500);
    return () => window.clearTimeout(timer);
  }, [showReason]);

  const disabled = Boolean(disabledReason);
  return (
    <span className={`relative inline-flex ${className}`}>
      <button
        ref={ref}
        type="button"
        aria-disabled={disabled || undefined}
        aria-label={ariaLabel}
        onClick={() => (disabled ? setShowReason(true) : onClick())}
        className={`min-h-tap w-full rounded-2xl px-4 py-2 font-display text-base leading-tight transition ${VARIANT[variant]} ${disabled ? 'opacity-45 shadow-none' : ''}`}
      >
        {children}
      </button>
      {showReason && disabledReason && (
        <span
          role="status"
          className="absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-[16rem] -translate-x-1/2 rounded-xl bg-ink px-3 py-2 text-center text-sm text-card shadow-lg"
        >
          {disabledReason}
        </span>
      )}
    </span>
  );
}

export function Modal({
  title,
  onClose,
  closeLabel,
  children,
}: {
  title: string;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/70 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-lg overflow-y-auto rounded-3xl bg-night-2 p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl text-lantern">{title}</h2>
          <Button variant="secondary" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** A labelled on/off switch (≥ 44px tall). */
export function Switch({
  label,
  hint,
  checked,
  disabled = false,
  silent = false,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  /** Plays its own sound instead of the generic tap. */
  silent?: boolean;
  onChange: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled || undefined}
      data-sound={silent ? 'none' : undefined}
      onClick={() => !disabled && onChange(!checked)}
      className={`flex min-h-tap w-full items-center justify-between gap-3 rounded-2xl bg-night px-3 py-2 text-left ${disabled ? 'opacity-45' : ''}`}
    >
      <span className="min-w-0">
        <span className="block font-display leading-tight">{label}</span>
        {hint && <span className="block text-xs leading-tight text-card/70">{hint}</span>}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-sm text-card/80">
        {checked ? t('sound.on') : t('sound.off')}
        <span
          aria-hidden
          className={`relative h-7 w-12 rounded-full transition ${checked ? 'bg-lantern' : 'bg-card/25'}`}
        >
          <span
            className={`absolute top-1 size-5 rounded-full bg-card shadow transition-all ${checked ? 'left-6' : 'left-1'}`}
          />
        </span>
      </span>
    </button>
  );
}
