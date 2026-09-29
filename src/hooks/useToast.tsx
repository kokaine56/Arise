import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { IconCheck, IconAlert, IconInfo } from '@/components/ui/Icon';

export type ToastTone = 'neutral' | 'success' | 'error';

export interface Toast {
  id: number;
  message: string;
  /** Optional second line: what to do next. */
  detail?: string;
  tone: ToastTone;
  action?: { label: string; onSelect: () => void };
}

interface ToastContextValue {
  notify: (toast: Omit<Toast, 'id'>) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 4000;

const TONE_ICON = {
  neutral: IconInfo,
  success: IconCheck,
  error: IconAlert,
} as const;

const TONE_COLOUR = {
  neutral: 'text-muted',
  success: 'text-accent',
  error: 'text-danger',
} as const;

/**
 * Transient confirmations. The only place the interface speaks unprompted, and
 * only ever to confirm something the user just did or to explain a failure —
 * never to scold, and never with a raw database error.
 */
export const ToastProvider = ({ children }: { children: ReactNode }): ReactNode => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());
  const reduceMotion = useReducedMotion();

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const notify = useCallback<ToastContextValue['notify']>(
    ({ message, detail, tone, action }) => {
      const id = nextId.current;
      nextId.current += 1;
      // Spreading conditionally rather than passing `undefined` keeps the
      // optional fields genuinely absent, so the renderer can tell "no detail"
      // from "empty detail".
      setToasts((current) => [
        ...current.slice(-2),
        {
          id,
          message,
          tone,
          ...(detail !== undefined && { detail }),
          ...(action !== undefined && { action }),
        },
      ]);
      timers.current.set(
        id,
        window.setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        // Polite: a toast supplements the change, it does not announce it.
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+5.5rem)] sm:pb-6"
      >
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const Icon = TONE_ICON[toast.tone];
            return (
              <motion.div
                key={toast.id}
                layout={!reduceMotion}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.98 }}
                transition={{ duration: 0.18, ease: [0.32, 0.72, 0, 1] }}
                className="glass glass--strong pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-[var(--radius-control)] px-4 py-3"
              >
                <Icon
                  className={`mt-0.5 size-4 shrink-0 ${TONE_COLOUR[toast.tone]}`}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="text-caption font-medium text-foreground">{toast.message}</p>
                  {toast.detail ? (
                    <p className="mt-0.5 text-caption text-muted">{toast.detail}</p>
                  ) : null}
                </div>
                {toast.action ? (
                  <button
                    type="button"
                    onClick={() => {
                      toast.action?.onSelect();
                      dismiss(toast.id);
                    }}
                    className="shrink-0 rounded-[var(--radius-chip)] px-2 py-1 text-caption font-medium text-accent transition-opacity hover:opacity-80"
                  >
                    {toast.action.label}
                  </button>
                ) : null}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside <ToastProvider>');
  return context;
};
