import { toAppError } from '@/lib/errors';
import { api } from '@/lib/api/client';
import type { CategoryRow } from '@/lib/api/types';

export interface Category {
  id: string;
  slug: string;
  label: string;
  isBuiltin: boolean;
  sortOrder: number;
}

const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  slug: row.slug,
  label: row.label,
  isBuiltin: row.is_builtin,
  sortOrder: row.sort_order,
});

/** The eight built-ins, plus any custom ones. */
export const listCategories = async (): Promise<Category[]> => {
  try {
    const rows = await api.get<CategoryRow[]>('/categories');
    return rows.map(toCategory);
  } catch (raw) {
    throw toAppError(raw, 'categories.load');
  }
};

export const createCategory = async (label: string): Promise<Category> => {
  try {
    return toCategory(await api.post<CategoryRow>('/categories', { label }));
  } catch (raw) {
    throw toAppError(raw, 'category.create');
  }
};

/**
 * The server refuses to delete a built-in, and un-categorises any goal using a
 * custom one rather than deleting it.
 */
export const deleteCategory = async (id: string): Promise<void> => {
  try {
    await api.delete<void>(`/categories/${encodeURIComponent(id)}`);
  } catch (raw) {
    throw toAppError(raw, 'category.delete');
  }
};
