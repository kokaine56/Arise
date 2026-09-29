import { toAppError } from '@/lib/errors';
import { requireSupabase } from '@/lib/supabase/client';
import { requireUserId } from '@/lib/supabase/session';
import type { CategoryRow } from '@/lib/supabase/database.types';

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

/** The signed-in user's categories: eight built-ins, plus any custom ones. */
export const listCategories = async (): Promise<Category[]> => {
  const { data, error } = await requireSupabase()
    .from('categories')
    .select('*')
    .order('sort_order', { ascending: true });

  if (error) throw toAppError(error, 'categories.load');
  return (data ?? []).map(toCategory);
};

export const createCategory = async (label: string): Promise<Category> => {
  const userId = requireUserId();
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);

  const { data, error } = await requireSupabase()
    .from('categories')
    .insert({ user_id: userId, slug: slug || 'custom', label, is_builtin: false, sort_order: 90 })
    .select('*')
    .single();

  if (error) throw toAppError(error, 'categories.create');
  return toCategory(data);
};

export const deleteCategory = async (id: string): Promise<void> => {
  const { error } = await requireSupabase().from('categories').delete().eq('id', id);
  if (error) throw toAppError(error, 'categories.delete');
};
