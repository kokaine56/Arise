import { randomUUID } from 'node:crypto';
import { badRequest, notFound, sendJson, sendNoContent } from '../http.js';
import { requireAccessSession } from '../auth.js';
import { asString, requireObject } from '../validate.js';
const toCategory = (row) => ({
    id: row.id,
    slug: row.slug,
    label: row.label,
    is_builtin: row.is_builtin === 1,
    sort_order: row.sort_order,
});
const slugify = (label) => label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32) || 'custom';
const seedCategoriesIfEmpty = async (db) => {
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
export const registerCategoryRoutes = (router, db) => {
    router.get('/api/categories', async (ctx) => {
        requireAccessSession(ctx);
        const { res } = ctx;
        await seedCategoriesIfEmpty(db);
        const rows = await db.collection('categories').find().sort({ sort_order: 1, slug: 1 }).toArray();
        sendJson(res, 200, rows.map(r => toCategory(r)));
    });
    router.post('/api/categories', async (ctx) => {
        requireAccessSession(ctx);
        const { body, res } = ctx;
        const input = requireObject(body);
        const label = asString(input['label'], 'label', 24).trim();
        if (label.length === 0)
            throw badRequest('A category needs a name.');
        const slug = slugify(label);
        const existing = await db.collection('categories').findOne({ slug });
        if (existing)
            throw badRequest(`A category called "${label}" already exists.`);
        const id = randomUUID();
        const newCategory = { id, slug, label, is_builtin: 0, sort_order: 90 };
        await db.collection('categories').insertOne(newCategory);
        const row = await db.collection('categories').findOne({ id });
        sendJson(res, 201, toCategory(row));
    });
    router.delete('/api/categories/:id', async (ctx) => {
        requireAccessSession(ctx);
        const { params, res } = ctx;
        const id = params['id'];
        const row = await db.collection('categories').findOne({ id });
        if (!row)
            throw notFound('That category no longer exists.');
        if (row.is_builtin === 1)
            throw badRequest('Built-in categories cannot be deleted.');
        await db.collection('categories').deleteOne({ id });
        // Goals keep working because we just clear the category_id from them
        await db.collection('goals').updateMany({ category_id: id }, { $set: { category_id: null } });
        sendNoContent(res);
    });
};
//# sourceMappingURL=categories.js.map