/**
 * Daily completion records.
 *
 * At most one record may exist per (goal_id, date), enforced by a UNIQUE
 * constraint, so a double-tap or a retried request converges on the same row
 * instead of forking the day. The write path is an upsert for that reason.
 *
 * For measured goals the schema derives `completed` from `actual_value` in a
 * trigger, so the arithmetic is never the client's to get wrong. The value
 * returned below is read back *after* the trigger has run, which is why a client
 * that asked to record 1 km of a 3 km goal is told it is not complete rather than
 * being quietly believed.
 */

import { randomUUID } from 'node:crypto';
import type { Db } from '../db.ts';
import { transaction } from '../db.ts';
import { badRequest, notFound, sendJson, sendNoContent, type Router } from '../http.ts';
import { toRecordRow, type DbRecord } from '../rows.ts';
import {
  asBoolean,
  asCivilDate,
  asNumberOrNull,
  asStringOrNull,
  requireObject,
} from '../validate.ts';
import { goalExists } from './goals.ts';

const readRecord = (db: Db, goalId: string, date: string): DbRecord | undefined =>
  db
    .prepare('SELECT * FROM daily_goal_records WHERE goal_id = ? AND date = ?')
    .get(goalId, date) as DbRecord | undefined;

const requireRecord = (db: Db, goalId: string, date: string): DbRecord => {
  const row = readRecord(db, goalId, date);
  if (!row) throw notFound('There is no record for that goal on that day.');
  return row;
};

/**
 * Insert or replace the single record for this goal and day.
 *
 * `completed_at` is accepted from the caller so the "late" determination for a
 * time-based goal is made from one agreed instant, but the trigger owns whether
 * it is set at all.
 */
const upsert = (db: Db, input: Record<string, unknown>): DbRecord => {
  const goalId = asStringOrNull(input['goalId'], 'goalId', 64);
  if (!goalId) throw badRequest('goalId is required.');
  if (!goalExists(db, goalId)) throw notFound('That goal no longer exists.');

  const date = asCivilDate(input['date'], 'date');
  const actualValue = asNumberOrNull(input['actualValue'], 'actualValue');
  const notes = asStringOrNull(input['notes'], 'notes', 280);
  const completedAt = asStringOrNull(input['completedAt'], 'completedAt', 40);
  const completed = input['completed'] === undefined ? false : asBoolean(input['completed'], 'completed');

  return transaction(db, () => {
    // SQLite has no upsert statement, so this is an explicit check-then-write.
    // The UNIQUE constraint is what actually makes it safe; the branch is only
    // an optimisation, and a race would still converge.
    const existing = readRecord(db, goalId, date);

    if (existing) {
      db.prepare(
        `UPDATE daily_goal_records
            SET completed = ?, actual_value = ?, notes = ?, completed_at = ?
          WHERE goal_id = ? AND date = ?`,
      ).run(completed ? 1 : 0, actualValue, notes, completedAt, goalId, date);
    } else {
      db.prepare(
        `INSERT INTO daily_goal_records
           (id, goal_id, date, completed, actual_value, notes, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(randomUUID(), goalId, date, completed ? 1 : 0, actualValue, notes, completedAt);
    }

    return requireRecord(db, goalId, date);
  });
};

export const registerRecordRoutes = (router: Router, db: Db): void => {
  /**
   * Three different reads, one collection, so the dashboard, the history
   * calendar and a single-day lookup are each a single indexed query.
   */
  router.get('/api/records', ({ query, res }) => {
    const from = query.get('from');
    const to = query.get('to');
    const date = query.get('date');
    const goalId = query.get('goalId');

    if (goalId && date) {
      const row = readRecord(db, goalId, date);
      sendJson(res, 200, row ? toRecordRow(row) : null);
      return;
    }

    if (date) {
      const rows = db
        .prepare('SELECT * FROM daily_goal_records WHERE date = ? ORDER BY goal_id ASC')
        .all(date) as DbRecord[];
      sendJson(res, 200, rows.map(toRecordRow));
      return;
    }

    if (!from || !to) {
      throw badRequest('Provide either date, or both from and to.');
    }

    const rows = db
      .prepare(
        `SELECT * FROM daily_goal_records
          WHERE date >= ? AND date <= ?
          ORDER BY date ASC`,
      )
      .all(asCivilDate(from, 'from'), asCivilDate(to, 'to')) as DbRecord[];

    sendJson(res, 200, rows.map(toRecordRow));
  });

  router.put('/api/records', ({ body, res }) => {
    const input = requireObject(body);
    sendJson(res, 200, toRecordRow(upsert(db, input)));
  });

  /** Attach or clear a private note without disturbing the rest of the day. */
  router.put('/api/records/notes', ({ body, res }) => {
    const input = requireObject(body);
    const goalId = asStringOrNull(input['goalId'], 'goalId', 64);
    if (!goalId) throw badRequest('goalId is required.');
    if (!goalExists(db, goalId)) throw notFound('That goal no longer exists.');

    const date = asCivilDate(input['date'], 'date');
    const notes = asStringOrNull(input['notes'], 'notes', 280);

    const row = transaction(db, () => {
      const existing = readRecord(db, goalId, date);
      if (existing) {
        db.prepare(
          'UPDATE daily_goal_records SET notes = ? WHERE goal_id = ? AND date = ?',
        ).run(notes, goalId, date);
      } else {
        // A note on a day with no completion is still a record, so it is created
        // incomplete rather than dropped.
        db.prepare(
          `INSERT INTO daily_goal_records (id, goal_id, date, completed, actual_value, notes, completed_at)
           VALUES (?, ?, ?, 0, NULL, ?, NULL)`,
        ).run(randomUUID(), goalId, date, notes);
      }
      return requireRecord(db, goalId, date);
    });

    sendJson(res, 200, toRecordRow(row));
  });

  /** Clear a day back to "not recorded". */
  router.delete('/api/records', ({ query, res }) => {
    const goalId = query.get('goalId');
    const date = query.get('date');
    if (!goalId || !date) throw badRequest('Both goalId and date are required.');

    db.prepare('DELETE FROM daily_goal_records WHERE goal_id = ? AND date = ?').run(
      goalId,
      asCivilDate(date, 'date'),
    );
    sendNoContent(res);
  });
};
