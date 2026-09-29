import { useMemo } from 'react';
import { useAsync } from '@/hooks/useAsync';
import { listCategories, type Category } from '@/services/categories/categories.service';

export interface CategoriesController {
  categories: readonly Category[];
  byId: ReadonlyMap<string, Category>;
  labelFor: (id: string | null) => string | undefined;
  isInitialLoading: boolean;
  error: ReturnType<typeof useAsync<Category[]>>['error'];
  refetch: () => void;
}

/**
 * Categories are few and change rarely, so they are loaded once per session
 * and every screen reads the same list. A missing category resolves to
 * `undefined` rather than a placeholder string, so nothing renders "undefined".
 */
export const useCategories = (): CategoriesController => {
  const query = useAsync<Category[]>(() => listCategories(), []);

  const categories = useMemo(() => query.data ?? [], [query.data]);

  const byId = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  return {
    categories,
    byId,
    labelFor: (id) => (id === null ? undefined : byId.get(id)?.label),
    isInitialLoading: query.isInitialLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
