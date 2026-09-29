import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

/**
 * 44px is the floor for the primary interactive target on a phone. Sizes below
 * `md` are for dense desktop chrome only, never for a tap-first control.
 */
const SIZE: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-caption gap-1.5',
  md: 'h-11 px-4 text-body gap-2',
  lg: 'h-12 px-5 text-body-lg gap-2',
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-accent-contrast font-medium hover:brightness-108 active:brightness-95',
  secondary:
    'glass glass--hover text-foreground font-medium [--glass-sheen:transparent]',
  ghost: 'text-muted hover:text-foreground hover:bg-glass-hover',
  danger: 'text-danger bg-danger-quiet hover:bg-danger-quiet/70 font-medium',
};

const BASE =
  'relative inline-flex select-none items-center justify-center rounded-[var(--radius-control)] ' +
  'transition-[background-color,color,opacity,filter,box-shadow] duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] ' +
  'disabled:pointer-events-none disabled:opacity-45 whitespace-nowrap';

export interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Renders at full width — used for the single action in a sheet. */
  block?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
}

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(function GlassButton(
  {
    variant = 'secondary',
    size = 'md',
    block = false,
    leading,
    trailing,
    className,
    type = 'button',
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(BASE, SIZE[size], VARIANT[variant], block && 'w-full', className)}
      {...rest}
    >
      {leading}
      {children}
      {trailing}
    </button>
  );
});

export interface GlassLinkProps {
  to: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}

/** A link that looks like a button, so navigation and action share one style. */
export const GlassLink = ({
  to,
  variant = 'secondary',
  size = 'md',
  block = false,
  className,
  children,
  ...rest
}: GlassLinkProps) => (
  <Link
    to={to}
    className={cn(BASE, SIZE[size], VARIANT[variant], block && 'w-full', className)}
    {...rest}
  >
    {children}
  </Link>
);

/** A square icon-only control. Always needs an `aria-label`. */
export const IconButton = forwardRef<
  HTMLButtonElement,
  GlassButtonProps & { label: string }
>(function IconButton({ label, size = 'md', className, children, ...rest }, ref) {
  return (
    <GlassButton
      ref={ref}
      size={size}
      variant="ghost"
      aria-label={label}
      title={label}
      className={cn('aspect-square !px-0', className)}
      {...rest}
    >
      {children}
    </GlassButton>
  );
});
