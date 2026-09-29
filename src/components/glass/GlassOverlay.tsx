import { useCallback, useEffect, useId, useRef, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/format';
import { IconClose } from '@/components/ui/Icon';
import { IconButton } from '@/components/glass/GlassButton';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface GlassOverlayProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Supporting line under the title. Keep it short and factual. */
  description?: string | undefined;
  children: ReactNode;
  footer?: ReactNode | undefined;
  /** Sheet is the right choice for a focused task on a phone. */
  variant?: 'sheet' | 'modal';
  /** Disables the scrim/Escape close, for destructive confirmations. */
  dismissible?: boolean | undefined;
}

/**
 * One overlay, two presentations: a bottom sheet on a phone, a centred dialog
 * from `sm` up. Both trap focus, close on Escape, restore focus on exit and
 * lock background scroll — none of which is optional for a dialog.
 */
export const GlassOverlay = ({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'sheet',
  dismissible = true,
}: GlassOverlayProps) => {
  const reduceMotion = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusTo = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const requestClose = useCallback(() => {
    if (dismissible) onClose();
  }, [dismissible, onClose]);

  // Remember what had focus, move focus into the panel, put it back on close.
  useEffect(() => {
    if (!open) return;
    restoreFocusTo.current = document.activeElement as HTMLElement | null;

    const focusFirst = (): void => {
      const panel = panelRef.current;
      if (!panel) return;
      const target = panel.querySelector<HTMLElement>('[data-autofocus]') ??
        panel.querySelector<HTMLElement>(FOCUSABLE);
      target?.focus();
    };
    // Wait for the entrance before stealing focus, or the browser fights it.
    const timer = window.setTimeout(focusFirst, 60);

    return () => {
      window.clearTimeout(timer);
      restoreFocusTo.current?.focus?.();
    };
  }, [open]);

  // Escape closes; Tab cycles within the panel.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        requestClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;
      const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (element) => element.offsetParent !== null,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open, requestClose]);

  // Background scroll lock, compensating for the scrollbar so the page
  // underneath does not visibly shift.
  useEffect(() => {
    if (!open) return;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingRight;
    const scrollbar = window.innerWidth - document.documentElement.clientWidth;
    body.style.overflow = 'hidden';
    if (scrollbar > 0) body.style.paddingRight = `${scrollbar}px`;
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingRight = previousPadding;
    };
  }, [open]);

  const isSheet = variant === 'sheet';

  return (
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-50 pointer-events-none flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            className="scrim pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            onClick={requestClose}
            aria-hidden
          />

          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            initial={reduceMotion ? { opacity: 0 } : isSheet ? { y: '100%' } : { opacity: 0, scale: 0.98, y: 8 }}
            animate={reduceMotion ? { opacity: 1 } : isSheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : isSheet ? { y: '100%' } : { opacity: 0, scale: 0.98, y: 6 }}
            transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.32, 0.72, 0, 1] }}
            className={cn(
              'glass glass--strong flex flex-col overflow-hidden pointer-events-auto',
              isSheet
                ? 'fixed bottom-0 left-0 right-0 w-full max-h-[85dvh] safe-b rounded-t-[var(--radius-glass-lg)] sm:relative sm:max-h-[90dvh] sm:max-w-lg sm:rounded-[var(--radius-glass-lg)]'
                : 'fixed left-4 right-4 top-1/2 -translate-y-1/2 max-h-[90dvh] rounded-[var(--radius-glass-lg)] sm:relative sm:top-auto sm:-translate-y-0 sm:max-w-md w-full',
            )}
          >
            {/* Drag affordance: a sheet should look graspable. */}
            {isSheet ? (
              <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
                <span className="h-1 w-9 rounded-full bg-glass-border-strong" />
              </div>
            ) : null}

            <header className="flex items-start justify-between gap-4 px-5 pb-3 pt-4 sm:px-6 sm:pt-5">
              <div className="min-w-0">
                <h2 id={titleId} className="text-title text-foreground">
                  {title}
                </h2>
                {description ? (
                  <p id={descriptionId} className="mt-1 text-caption text-muted">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton label="Close" size="sm" onClick={requestClose} className="-mr-1.5 -mt-0.5 shrink-0">
                <IconClose className="size-4" />
              </IconButton>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto scrollbar-slim px-5 pb-5 sm:px-6">
              {children}
            </div>

            {footer ? (
              <footer className="border-t border-glass-border px-5 py-4 sm:px-6">{footer}</footer>
            ) : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  );
};
