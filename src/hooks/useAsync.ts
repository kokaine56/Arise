import { useCallback, useEffect, useRef, useState } from 'react';
import { toAppError, type AppError } from '@/lib/errors';

export type AsyncStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AsyncResult<T> {
  data: T | null;
  error: AppError | null;
  status: AsyncStatus;
  /** True only on the first load, so refreshes do not blank the screen. */
  isInitialLoading: boolean;
  isRefreshing: boolean;
  refetch: () => void;
}

export interface UseAsyncOptions {
  /** Skip the fetch entirely — e.g. while signed out. */
  enabled?: boolean;
}

/**
 * A small data hook: run an async read, expose status, ignore results from a
 * superseded run, and let the caller refetch after a mutation.
 *
 * Deliberately not a cache. Every screen here owns exactly one query, and the
 * only invalidation that ever matters is "the user just changed something",
 * which is an explicit `refetch`. A general-purpose query cache would be
 * dependency weight without a benefit here.
 */
export const useAsync = <T>(
  run: () => Promise<T>,
  deps: readonly unknown[],
  { enabled = true }: UseAsyncOptions = {},
): AsyncResult<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<AppError | null>(null);
  const [status, setStatus] = useState<AsyncStatus>(enabled ? 'loading' : 'idle');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Guards against a slow response from a previous run overwriting a newer one.
  const runId = useRef(0);
  const mounted = useRef(true);
  const hasLoaded = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const execute = useCallback(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    runId.current += 1;
    const currentRun = runId.current;

    if (hasLoaded.current) setIsRefreshing(true);
    else setStatus('loading');

    run()
      .then((result) => {
        if (!mounted.current || currentRun !== runId.current) return;
        setData(result);
        setError(null);
        setStatus('ready');
        hasLoaded.current = true;
      })
      .catch((raw: unknown) => {
        if (!mounted.current || currentRun !== runId.current) return;
        setError(toAppError(raw));
        setStatus('error');
      })
      .finally(() => {
        if (!mounted.current || currentRun !== runId.current) return;
        setIsRefreshing(false);
      });
    // `run` is intentionally excluded: callers pass an inline closure, and
    // `deps` is the caller's declaration of what this query depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);

  useEffect(() => {
    execute();
  }, [execute]);

  return {
    data,
    error,
    status,
    isInitialLoading: status === 'loading' && !hasLoaded.current,
    isRefreshing,
    refetch: execute,
  };
};
