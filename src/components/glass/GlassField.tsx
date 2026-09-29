import {
  forwardRef,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/format';
import { IconChevronDown } from '@/components/ui/Icon';

const CONTROL =
  'glass--sunken w-full rounded-[var(--radius-control)] px-3.5 text-body text-foreground ' +
  'placeholder:text-subtle transition-colors duration-200 ' +
  'focus:outline-none focus-visible:border-accent/50';

const FIELD = 'flex flex-col gap-1.5';

export interface FieldProps {
  label: string;
  hint?: ReactNode | undefined;
  error?: string | undefined;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * A labelled control with its hint and error wired through `aria-describedby`,
 * so a screen reader hears the same information a sighted reader does.
 */
export const Field = ({ label, hint, error, children }: FieldProps) => {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ');

  return (
    <div className={FIELD}>
      <label htmlFor={id} className="text-caption font-medium text-muted">
        {label}
      </label>
      {children({ id, describedBy: describedBy || undefined, invalid: Boolean(error) })}
      {hint ? (
        <p id={hintId} className="text-caption text-subtle">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-caption text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export interface GlassInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean | undefined;
  /** Right-aligned adornment, e.g. a unit such as "km". */
  suffix?: ReactNode | undefined;
  /** Large numeric entry for targets and measured values. */
  numeric?: boolean | undefined;
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(function GlassInput(
  { invalid, suffix, numeric, className, ...rest },
  ref,
) {
  const field = (
    <input
      ref={ref}
      inputMode={numeric ? 'decimal' : undefined}
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL,
        'h-11',
        numeric && 'tabular text-title',
        suffix && 'pr-12',
        invalid && 'border-danger/60',
        className,
      )}
      {...rest}
    />
  );

  if (!suffix) return field;

  return (
    <div className="relative">
      {field}
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-caption text-subtle">
        {suffix}
      </span>
    </div>
  );
});

export interface GlassSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean | undefined;
}

export const GlassSelect = forwardRef<HTMLSelectElement, GlassSelectProps>(function GlassSelect(
  { invalid, className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL,
          'h-11 appearance-none pr-10',
          invalid && 'border-danger/60',
          className,
        )}
        {...rest}
      >
        {children}
      </select>
      <IconChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-subtle"
        aria-hidden
      />
    </div>
  );
});

export interface GlassTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean | undefined;
}

export const GlassTextarea = forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  function GlassTextarea({ invalid, className, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(CONTROL, 'min-h-20 py-2.5', invalid && 'border-danger/60', className)}
        {...rest}
      />
    );
  },
);
