import { GlassButton, type ButtonVariant } from '@/components/glass/GlassButton';
import { GlassOverlay } from '@/components/glass/GlassOverlay';
import { IconAlert } from '@/components/ui/Icon';

export interface ErrorStateProps {
  title?: string | undefined;
  message: string;
  onRetry?: (() => void) | undefined;
  className?: string | undefined;
  compact?: boolean | undefined;
}

/**
 * Failures are stated in the interface's voice, with a way forward. The raw
 * cause is logged for developers and never rendered here.
 */
export const ErrorState = ({
  title = "We couldn't load this",
  message,
  onRetry,
  className,
  compact = false,
}: ErrorStateProps) => (
  <div
    role="alert"
    className={`glass flex flex-col items-start gap-3 ${compact ? 'p-4' : 'px-6 py-8'} ${className ?? ''}`}
  >
    <div className="flex items-start gap-3">
      <IconAlert className="mt-0.5 size-4 shrink-0 text-danger" />
      <div>
        <h3 className="text-body font-medium text-foreground">{title}</h3>
        <p className="mt-1 text-caption text-muted">{message}</p>
      </div>
    </div>
    {onRetry ? (
      <GlassButton size="sm" onClick={onRetry}>
        Try again
      </GlassButton>
    ) : null}
  </div>
);

/**
 * A small resting indicator for a single in-flight action, sized to sit inline
 * next to a control without shifting anything around it.
 */
export const InlineSpinner = ({ label = 'Working' }: { label?: string }) => (
  <span role="status" className="inline-flex items-center gap-2 text-caption text-subtle">
    <span
      aria-hidden
      className="size-3.5 animate-[spin_700ms_linear_infinite] rounded-full border-[1.5px] border-glass-border border-t-accent"
    />
    <span className="sr-only">{label}</span>
  </span>
);

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** State the consequence plainly, especially for anything destructive. */
  body: string;
  confirmLabel: string;
  cancelLabel?: string | undefined;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: ButtonVariant | undefined;
  busy?: boolean | undefined;
}

/**
 * A confirmation that names what will happen, rather than a generic "Are you
 * sure?". Destructive actions must not be one stray tap away.
 */
export const ConfirmDialog = ({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'primary',
  busy = false,
}: ConfirmDialogProps) => (
  <GlassOverlay
    open={open}
    onClose={onCancel}
    title={title}
    variant="modal"
    // A destructive confirmation is not dismissible by tapping the scrim.
    dismissible={false}
    footer={
      <div className="flex justify-end gap-2">
        <GlassButton onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </GlassButton>
        <GlassButton variant={variant} onClick={onConfirm} disabled={busy} data-autofocus>
          {busy ? 'Working…' : confirmLabel}
        </GlassButton>
      </div>
    }
  >
    <p className="text-body text-muted">{body}</p>
  </GlassOverlay>
);
