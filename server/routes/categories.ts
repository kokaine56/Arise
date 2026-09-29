/**
 * Category endpoints.
 *
 * Categories are global rather than per-user, since there is only one user. The
 * built-in eight are seeded by the migration and cannot be deleted, which stops
 * a goal's category reference from being quietly emptied out from under it.
 */

import { randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import { badRequest, notFound, sendJson, sendNoContent, type Router } from '../http.ts';
import { asString, requireObject } from '../validate.ts';

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

/**
 * Derive a slug the way the schema's CHECK expects: lowercase, alphanumeric
 * runs joined by underscores, no leading or trailing underscore. A label made
 * entirely of punctuation degrades to 'custom' rather than failing the insert.
 */
const slugify = (label: string): string =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'custom';

export const registerCategoryRoutes = (router: Router, db: Db): void => {
  router.get('/api/categories', ({ res }) => {
    const rows = db
      .prepare('SELECT * FROM categories ORDER BY sort_order ASC, slug ASC')
      .all() as DbCategory[];
    sendJson(res, 200, rows.map(toCategory));
  });

  router.post('/api/categories', ({ body, res }) => {
    const input = requireObject(body);
    const label = asString(input['label'], 'label', 24).trim();
    if (label.length === 0) throw badRequest('A category needs a name.');

    const slug = slugify(label);
    const existing = db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug);
    if (existing) throw badRequest(`A category called "${label}" already exists.`);

    const id = randomUUID();
    // Custom categories sort after the built-ins but before anything added later.
    db.prepare(
      'INSERT INTO categories (id, slug, label, is_builtin, sort_order) VALUES (?, ?, ?, 0, 90)',
    ).run(id, slug, label);

    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as DbCategory;
    sendJson(res, 201, toCategory(row));
  });

  router.delete('/api/categories/:id', ({ params, res }) => {
    const id = params['id'] as string;
    const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id) as
      | DbCategory
      | undefined;

    if (!row) throw notFound('That category no longer exists.');
    if (row.is_builtin === 1) throw badRequest('Built-in categories cannot be deleted.');

    // Goals keep working: the column is ON DELETE SET NULL, so a goal in this
    // category becomes uncategorised rather than being deleted with it.
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    sendNoContent(res);
  });
};
