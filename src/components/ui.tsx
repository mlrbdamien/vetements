import { useEffect, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';

/** Concatène des classes en ignorant les valeurs vides. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div
      className={cn(
        'rounded-card bg-surface-1 border border-line shadow-card',
        padded && 'p-5',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  icon: Icon,
  title,
  action,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && <Icon size={17} strokeWidth={1.75} className="text-ink-3 shrink-0" />}
        <p className="font-medium truncate">{title}</p>
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold text-ink-3 uppercase tracking-[0.06em] mb-3">
      {children}
    </h2>
  );
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  type = 'button',
  className = '',
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'subtle' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
}) {
  const styles = {
    primary: 'bg-accent text-white hover:bg-accent-hover disabled:opacity-40',
    ghost:
      'bg-surface-1 border border-line text-ink hover:bg-surface-2 disabled:opacity-40',
    subtle: 'bg-surface-2 text-ink hover:bg-line disabled:opacity-40',
    danger:
      'bg-critical-soft text-critical-text hover:bg-critical hover:text-white disabled:opacity-40',
  }[variant];
  const tailles = {
    sm: 'px-3 py-1.5 text-[13px]',
    md: 'px-4 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  }[size];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-control font-medium transition-colors cursor-pointer disabled:cursor-not-allowed',
        tailles,
        styles,
        className,
      )}
    >
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  label,
  onClick,
  className = '',
  tone = 'muted',
  disabled,
}: {
  icon: LucideIcon;
  label: string;
  onClick?: () => void;
  className?: string;
  tone?: 'muted' | 'danger';
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded-control transition-colors cursor-pointer shrink-0 disabled:opacity-40 disabled:cursor-not-allowed',
        tone === 'danger'
          ? 'text-critical-text hover:bg-critical-soft'
          : 'text-ink-3 hover:text-ink hover:bg-surface-2',
        className,
      )}
    >
      <Icon size={16} strokeWidth={1.75} />
    </button>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-[18px] bg-surface-1 border border-line p-5 shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-5">
          <h3 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h3>
          <IconButton icon={X} label="Fermer" onClick={onClose} className="-mr-1" />
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block mb-4">
      <span className="block text-[13px] font-medium text-ink-2 mb-1.5">
        {label}
      </span>
      {children}
      {hint && <span className="block text-xs text-ink-3 mt-1.5">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'w-full rounded-control border border-line bg-surface-2 px-3.5 py-2.5 text-[15px] text-ink outline-none transition-colors placeholder:text-ink-3 focus:border-accent focus:bg-surface-1';

export function EmptyState({
  icon: Icon,
  titre,
  children,
}: {
  icon?: LucideIcon;
  titre: string;
  children?: ReactNode;
}) {
  return (
    <div className="text-center py-10 px-4">
      {Icon && (
        <Icon size={28} strokeWidth={1.5} className="text-ink-3 mx-auto mb-3" />
      )}
      <p className="font-medium mb-1">{titre}</p>
      {children && <p className="text-sm text-ink-3">{children}</p>}
    </div>
  );
}

/**
 * Message d'erreur métier. Le texte vient de la base et n'est jamais
 * reformulé : il porte la date, le nom ou le décompte qui rendent l'erreur
 * actionnable.
 */
export function Alerte({
  ton = 'critical',
  children,
}: {
  ton?: 'critical' | 'warning' | 'good';
  children: ReactNode;
}) {
  const styles = {
    critical: 'bg-critical-soft text-critical-text border-critical/25',
    warning: 'bg-warning-soft text-warning-text border-warning/30',
    good: 'bg-good-soft text-good-text border-good/25',
  }[ton];
  return (
    <div
      // `alert` interrompt la lecture en cours pour une erreur, `status`
      // attend une pause pour une confirmation : un refus de scan doit passer
      // devant, une réussite non.
      role={ton === 'critical' ? 'alert' : 'status'}
      aria-live={ton === 'critical' ? 'assertive' : 'polite'}
      className={cn('rounded-control border px-4 py-3 text-sm', styles)}
    >
      {children}
    </div>
  );
}


/**
 * Chargement en cours.
 *
 * Quatre écrans restaient blancs pendant leur lecture, puis se remplissaient
 * d'un coup : sur une base lente, c'est indiscernable d'une application figée.
 */
export function Chargement({ quoi = 'Chargement' }: { quoi?: string }) {
  return (
    <p
      role="status"
      aria-live="polite"
      className="flex items-center gap-2.5 text-[14px] text-ink-3 py-8"
    >
      <span
        aria-hidden="true"
        className="h-3.5 w-3.5 rounded-full border-2 border-line-strong border-t-accent animate-spin motion-reduce:animate-none"
      />
      {quoi}…
    </p>
  );
}
