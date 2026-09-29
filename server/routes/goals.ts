import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { notFound, sendJson, sendNoContent, type Router } from '../http.js';
import { requireAccessSession } from '../auth.js';
import { toGoalRow, type DbGoal } from '../rows.js';
import {
  asBoolean,
  asCivilDate,
  asCivilDateOrNull,
  asClockOrNull,
  asFrequencyConfig,
  asNumberOrNull,
  asOneOf,
  asString,
  asStringOrNull,
  requireObject,
} from '../validate.js';

const GOAL_TYPES = ['checkbox', 'numeric', 'duration', 'count', 'time'] as const;
const FREQUENCY_TYPES = [
  'daily',
  'weekdays',
  'weekends',
  'selected_days',
  'weekly',
  'custom_interval',
] as const;

type FrequencyType = (typeof FREQUENCY_TYPES)[number];

const readGoal = async (db: Db, id: string): Promise<DbGoal | undefined> => {
  const doc = await db.collection('goals').findOne({ id });
  return doc as unknown as DbGoal | undefined;
};

const requireGoal = async (db: Db, id: string): Promise<DbGoal> => {
  const row = await readGoal(db, id);
  if (!row) throw notFound('That goal no longer exists.');
  return row;
};

export const registerGoalRoutes = (router: Router, db: Db): void => {
  router.get('/api/goals', async (ctx) => {
    requireAccessSession(ctx);
    const { query, res } = ctx;
    const includeArchived = query.get('includeArchived') === '1';
    const includePaused = query.get('includePaused') !== '0';

    const filter: any = {};
    if (!includeArchived) filter.archived_at = null;
    if (!includePaused) filter.is_active = 1;

    const rows = await db
      .collection('goals')
      .find(filter)
      .sort({ sort_order: 1, created_at: 1 })
      .toArray() as unknown as DbGoal[];

    sendJson(res, 200, rows.map(toGoalRow));
  });

  router.get('/api/goals/:id', async (ctx) => {
    requireAccessSession(ctx);
    const { params, res } = ctx;
    const goal = await requireGoal(db, params['id'] as string);
    sendJson(res, 200, toGoalRow(goal));
  });

  router.post('/api/goals', async (ctx) => {
    requireAccessSession(ctx);
    const { body, res } = ctx;
    const input = requireObject(body);

    const name = asString(input['name'], 'name', 60);
    const goalType = asOneOf(input['type'], 'type', GOAL_TYPES);
    const frequencyType = asOneOf(input['frequencyType'], 'frequencyType', FREQUENCY_TYPES);
    const startDate = asCivilDate(input['startDate'], 'startDate');

    const id = randomUUID();
    const config = asFrequencyConfig(input['frequencyConfig'], frequencyType);

    const maxSortDoc = await db.collection('goals').find().sort({ sort_order: -1 }).limit(1).toArray();
    const top = maxSortDoc.length > 0 ? (maxSortDoc[0] as any).sort_order : -1;

    const newGoal = {
      id,
      name,
      description: asStringOrNull(input['description'], 'description', 280),
      goal_type: goalType,
      target_value: asNumberOrNull(input['targetValue'], 'targetValue'),
      unit: asStringOrNull(input['unit'], 'unit', 16),
      target_time: asClockOrNull(input['targetTime'], 'targetTime'),
      category_id: asStringOrNull(input['categoryId'], 'categoryId', 64),
      frequency_type: frequencyType,
      frequency_config: config,
      start_date: startDate,
      end_date: asCivilDateOrNull(input['endDate'], 'endDate'),
      reminder_time: asClockOrNull(input['reminderTime'], 'reminderTime'),
      is_active: input['isActive'] === undefined ? 1 : asBoolean(input['isActive'], 'isActive') ? 1 : 0,
      sort_order: top + 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      archived_at: null
    };

    await db.collection('goals').insertOne(newGoal);
    const savedGoal = await requireGoal(db, id);

    sendJson(res, 201, toGoalRow(savedGoal));
  });

  router.patch('/api/goals/:id', async (ctx) => {
    requireAccessSession(ctx);
    const { params, body, res } = ctx;
    const id = params['id'] as string;
    const patch = requireObject(body);
    const existing = await requireGoal(db, id);

    const sets: any = { updated_at: new Date().toISOString() };
    const push = (column: string, value: unknown): void => {
      sets[column] = value;
    };

    if (patch['name'] !== undefined) push('name', asString(patch['name'], 'name', 60));
    if (patch['description'] !== undefined) push('description', asStringOrNull(patch['description'], 'description', 280));
    if (patch['targetValue'] !== undefined) push('target_value', asNumberOrNull(patch['targetValue'], 'targetValue'));
    if (patch['unit'] !== undefined) push('unit', asStringOrNull(patch['unit'], 'unit', 16));
    if (patch['targetTime'] !== undefined) push('target_time', asClockOrNull(patch['targetTime'], 'targetTime'));
    if (patch['categoryId'] !== undefined) push('category_id', asStringOrNull(patch['categoryId'], 'categoryId', 64));
    if (patch['startDate'] !== undefined) push('start_date', asCivilDate(patch['startDate'], 'startDate'));
    if (patch['endDate'] !== undefined) push('end_date', asCivilDateOrNull(patch['endDate'], 'endDate'));
    if (patch['reminderTime'] !== undefined) push('reminder_time', asClockOrNull(patch['reminderTime'], 'reminderTime'));
    if (patch['isActive'] !== undefined) push('is_active', asBoolean(patch['isActive'], 'isActive') ? 1 : 0);
    if (patch['sortOrder'] !== undefined) push('sort_order', asNumberOrNull(patch['sortOrder'], 'sortOrder'));
    if (patch['archivedAt'] !== undefined) push('archived_at', asStringOrNull(patch['archivedAt'], 'archivedAt', 40));

    if (patch['frequencyType'] !== undefined || patch['frequencyConfig'] !== undefined) {
      const frequencyType = patch['frequencyType'] === undefined
        ? (existing.frequency_type as FrequencyType)
        : asOneOf(patch['frequencyType'], 'frequencyType', FREQUENCY_TYPES);

      const base = patch['frequencyConfig'] === undefined
          ? parseConfigSafe(existing.frequency_config as string)
          : requireObject(patch['frequencyConfig']);

      push('frequency_type', frequencyType);
      push('frequency_config', asFrequencyConfig(base, frequencyType));
    }

    if (patch['type'] !== undefined) {
      push('goal_type', asOneOf(patch['type'], 'type', GOAL_TYPES));
    }

    if (Object.keys(sets).length === 1) {
      sendJson(res, 200, toGoalRow(existing));
      return;
    }

    await db.collection('goals').updateOne({ id }, { $set: sets });
    const updated = await requireGoal(db, id);

    sendJson(res, 200, toGoalRow(updated));
  });

  router.delete('/api/goals/:id', async (ctx) => {
    requireAccessSession(ctx);
    const { params, res } = ctx;
    const id = params['id'] as string;
    await requireGoal(db, id);
    await db.collection('goals').deleteOne({ id });
    await db.collection('daily_records').deleteMany({ goal_id: id });
    sendNoContent(res);
  });
};

const parseConfigSafe = (raw: string | object): Record<string, unknown> => {
  if (typeof raw === 'object' && raw !== null) return raw as Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw as string);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

export const goalExists = async (db: Db, id: string): Promise<boolean> => {
  const count = await db.collection('goals').countDocuments({ id }, { limit: 1 });
  return count > 0;
};
