import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { badRequest, notFound, sendJson, sendNoContent, type Router } from '../http.js';
import { asString, requireObject } from '../validate.js';

interface DbCategory {
  id: string;
  slug: string;
  label: string;
  is_builtin: number;
  sort_order: number;
}

const toCategory = (row: DbCategory): Record<string, unknown> => ({
  id: row.id,
  slug: row.slug,
  label: row.label,
  is_builtin: row.is_builtin === 1,
  sort_order: row.sort_order,
});

const slugify = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'custom';

const seedCategoriesIfEmpty = async (db: Db): Promise<void> => {
  const count = await db.collection('categories').countDocuments();
  if (count === 0) {
    const builtins = [
      { id: randomUUID(), slug: 'fitness', label: 'Fitness', is_builtin: 1, sort_order: 1 },
      { id: randomUUID(), slug: 'mindfulness', label: 'Mindfulness', is_builtin: 1, sort_order: 2 },
      { id: randomUUID(), slug: 'health', label: 'Health', is_builtin: 1, sort_order: 3 },
      { id: randomUUID(), slug: 'productivity', label: 'Productivity', is_builtin: 1, sort_order: 4 },
      { id: randomUUID(), slug: 'learning', label: 'Learning', is_builtin: 1, sort_order: 5 },
      { id: randomUUID(), slug: 'finance', label: 'Finance', is_builtin: 1, sort_order: 6 },
      { id: randomUUID(), slug: 'social', label: 'Social', is_builtin: 1, sort_order: 7 },
      { id: randomUUID(), slug: 'chores', label: 'Chores', is_builtin: 1, sort_order: 8 }
    ];
    await db.collection('categories').insertMany(builtins);
  }
};

export const registerCategoryRoutes = (router: Router, db: Db): void => {
  router.get('/api/categories', async ({ res }) => {
    await seedCategoriesIfEmpty(db);
    const rows = await db.collection('categories').find().sort({ sort_order: 1, slug: 1 }).toArray();
    sendJson(res, 200, rows.map(r => toCategory(r as unknown as DbCategory)));
  });

  router.post('/api/categories', async ({ body, res }) => {
    const input = requireObject(body);
    const label = asString(input['label'], 'label', 24).trim();
    if (label.length === 0) throw badRequest('A category needs a name.');

    const slug = slugify(label);
    const existing = await db.collection('categories').findOne({ slug });
    if (existing) throw badRequest(`A category called "${label}" already exists.`);

    const id = randomUUID();
    const newCategory = { id, slug, label, is_builtin: 0, sort_order: 90 };
    await db.collection('categories').insertOne(newCategory);

    const row = await db.collection('categories').findOne({ id });
    sendJson(res, 201, toCategory(row as unknown as DbCategory));
  });

  router.delete('/api/categories/:id', async ({ params, res }) => {
    const id = params['id'] as string;
    const row = await db.collection('categories').findOne({ id }) as unknown as DbCategory | undefined;

    if (!row) throw notFound('That category no longer exists.');
    if (row.is_builtin === 1) throw badRequest('Built-in categories cannot be deleted.');

    await db.collection('categories').deleteOne({ id });
    
    // Goals keep working because we just clear the category_id from them
    await db.collection('goals').updateMany({ category_id: id }, { $set: { category_id: null } });
    
    sendNoContent(res);
  });
};
