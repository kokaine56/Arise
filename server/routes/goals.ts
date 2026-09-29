/**
 * Goal endpoints.
 *
 * Ordering is explicit rather than alphabetical: the user controls the order of
 * their day, and history has to replay that same order.
 */

import { randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import { transaction } from '../db.ts';
import { notFound, sendJson, sendNoContent, type Router } from '../http.ts';
import { toGoalRow, type DbGoal } from '../rows.ts';
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
} from '../validate.ts';

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

const readGoal = (db: Db, id: string): DbGoal | undefined =>
  db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as DbGoal | undefined;

const requireGoal = (db: Db, id: string): DbGoal => {
  const row = readGoal(db, id);
  if (!row) throw notFound('That goal no longer exists.');
  return row;
};

export const registerGoalRoutes = (router: Router, db: Db): void => {
  router.get('/api/goals', ({ query, res }) => {
    // Archived goals are excluded by default; history still resolves them.
    const includeArchived = query.get('includeArchived') === '1';
    const includePaused = query.get('includePaused') !== '0';

    const where: string[] = [];
    if (!includeArchived) where.push('archived_at IS NULL');
    if (!includePaused) where.push('is_active = 1');

    const rows = db
      .prepare(
        `SELECT * FROM goals
         ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY sort_order ASC, created_at ASC`,
      )
      .all() as DbGoal[];

    sendJson(res, 200, rows.map(toGoalRow));
  });

  router.get('/api/goals/:id', ({ params, res }) => {
    sendJson(res, 200, toGoalRow(requireGoal(db, params['id'] as string)));
  });

  router.post('/api/goals', ({ body, res }) => {
    const input = requireObject(body);

    const name = asString(input['name'], 'name', 60);
    const goalType = asOneOf(input['type'], 'type', GOAL_TYPES);
    const frequencyType = asOneOf(input['frequencyType'], 'frequencyType', FREQUENCY_TYPES);
    const startDate = asCivilDate(input['startDate'], 'startDate');

    const id = randomUUID();
    const config = asFrequencyConfig(input['frequencyConfig'], frequencyType);

    // The next position is read inside the transaction so two goals created at
    // once cannot claim the same slot.
    const row = transaction(db, () => {
      const current = db
        .prepare('SELECT max(sort_order) AS top FROM goals')
        .get() as { top: number | null };

      db.prepare(
        `INSERT INTO goals (
           id, name, description, goal_type, target_value, unit, target_time,
           category_id, frequency_type, frequency_config, start_date, end_date,
           reminder_time, is_active, sort_order
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        name,
        asStringOrNull(input['description'], 'description', 280),
        goalType,
        asNumberOrNull(input['targetValue'], 'targetValue'),
        asStringOrNull(input['unit'], 'unit', 16),
        asClockOrNull(input['targetTime'], 'targetTime'),
        asStringOrNull(input['categoryId'], 'categoryId', 64),
        frequencyType,
        config,
        startDate,
        asCivilDateOrNull(input['endDate'], 'endDate'),
        asClockOrNull(input['reminderTime'], 'reminderTime'),
        input['isActive'] === undefined ? 1 : asBoolean(input['isActive'], 'isActive') ? 1 : 0,
        (current.top ?? -1) + 1,
      );

      return requireGoal(db, id);
    });

    sendJson(res, 201, toGoalRow(row));
  });

  router.patch('/api/goals/:id', ({ params, body, res }) => {
    const id = params['id'] as string;
    const patch = requireObject(body);
    const existing = requireGoal(db, id);

    // Only keys actually present in the patch are written. Sending null clears a
    // column; omitting the key leaves it alone, and the difference matters when
    // a caller changes one field of a goal.
    const sets: string[] = [];
    const values: unknown[] = [];
    const push = (column: string, value: unknown): void => {
      sets.push(`${column} = ?`);
      values.push(value);
    };

    if (patch['name'] !== undefined) push('name', asString(patch['name'], 'name', 60));
    if (patch['description'] !== undefined) {
      push('description', asStringOrNull(patch['description'], 'description', 280));
    }
    if (patch['targetValue'] !== undefined) {
      push('target_value', asNumberOrNull(patch['targetValue'], 'targetValue'));
    }
    if (patch['unit'] !== undefined) push('unit', asStringOrNull(patch['unit'], 'unit', 16));
    if (patch['targetTime'] !== undefined) {
      push('target_time', asClockOrNull(patch['targetTime'], 'targetTime'));
    }
    if (patch['categoryId'] !== undefined) {
      push('category_id', asStringOrNull(patch['categoryId'], 'categoryId', 64));
    }
    if (patch['startDate'] !== undefined) {
      push('start_date', asCivilDate(patch['startDate'], 'startDate'));
    }
    if (patch['endDate'] !== undefined) {
      push('end_date', asCivilDateOrNull(patch['endDate'], 'endDate'));
    }
    if (patch['reminderTime'] !== undefined) {
      push('reminder_time', asClockOrNull(patch['reminderTime'], 'reminderTime'));
    }
    if (patch['isActive'] !== undefined) {
      push('is_active', asBoolean(patch['isActive'], 'isActive') ? 1 : 0);
    }
    if (patch['sortOrder'] !== undefined) {
      push('sort_order', asNumberOrNull(patch['sortOrder'], 'sortOrder'));
    }
    if (patch['archivedAt'] !== undefined) {
      push('archived_at', asStringOrNull(patch['archivedAt'], 'archivedAt', 40));
    }

    // Frequency type and its config must change together, because the trigger
    // refuses a payload whose `kind` disagrees. When only the type is patched,
    // the existing payload is re-keyed rather than discarded, so changing a goal
    // from weekly to monthly does not silently reset its interval to 1.
    if (patch['frequencyType'] !== undefined || patch['frequencyConfig'] !== undefined) {
      const frequencyType = patch['frequencyType'] === undefined
        ? (existing.frequency_type as FrequencyType)
        : asOneOf(patch['frequencyType'], 'frequencyType', FREQUENCY_TYPES);

      const base =
        patch['frequencyConfig'] === undefined
          ? parseConfigSafe(existing.frequency_config)
          : requireObject(patch['frequencyConfig']);

      push('frequency_type', frequencyType);
      push('frequency_config', asFrequencyConfig(base, frequencyType));
    }

    if (patch['type'] !== undefined) {
      push('goal_type', asOneOf(patch['type'], 'type', GOAL_TYPES));
    }

    if (sets.length === 0) {
      sendJson(res, 200, toGoalRow(existing));
      return;
    }

    values.push(id);
    const updated = transaction(db, () => {
      db.prepare(`UPDATE goals SET ${sets.join(', ')} WHERE id = ?`).run(...values);
      return requireGoal(db, id);
    });

    sendJson(res, 200, toGoalRow(updated));
  });

  /**
   * Permanent, and cascades to the day's records. The client only offers it
   * behind a confirmation that names the consequence.
   */
  router.delete('/api/goals/:id', ({ params, res }) => {
    const id = params['id'] as string;
    requireGoal(db, id);
    db.prepare('DELETE FROM goals WHERE id = ?').run(id);
    sendNoContent(res);
  });
};

const parseConfigSafe = (raw: string): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
};

// Referenced by the records route to reject an unknown goal with a 404 rather
// than letting the foreign key surface as a 400.
export const goalExists = (db: Db, id: string): boolean =>
  db.prepare('SELECT 1 AS ok FROM goals WHERE id = ?').get(id) !== undefined;
