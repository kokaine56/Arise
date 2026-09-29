import { randomUUID } from 'node:crypto';
import type { Db } from '../db.js';
import { badRequest, notFound, sendJson, sendNoContent, type Router } from '../http.js';
import { toRecordRow, type DbRecord } from '../rows.js';
import {
  asBoolean,
  asCivilDate,
  asNumberOrNull,
  asStringOrNull,
  requireObject,
} from '../validate.js';
import { goalExists } from './goals.js';

const readRecord = async (db: Db, goalId: string, date: string): Promise<DbRecord | undefined> => {
  const doc = await db.collection('daily_records').findOne({ goal_id: goalId, date });
  return doc as unknown as DbRecord | undefined;
};

const requireRecord = async (db: Db, goalId: string, date: string): Promise<DbRecord> => {
  const row = await readRecord(db, goalId, date);
  if (!row) throw notFound('There is no record for that goal on that day.');
  return row;
};

const upsert = async (db: Db, input: Record<string, unknown>): Promise<DbRecord> => {
  const goalId = asStringOrNull(input['goalId'], 'goalId', 64);
  if (!goalId) throw badRequest('goalId is required.');
  if (!(await goalExists(db, goalId))) throw notFound('That goal no longer exists.');

  const date = asCivilDate(input['date'], 'date');
  const actualValue = asNumberOrNull(input['actualValue'], 'actualValue');
  const notes = asStringOrNull(input['notes'], 'notes', 280);
  const completedAt = asStringOrNull(input['completedAt'], 'completedAt', 40);
  const completed = input['completed'] === undefined ? false : asBoolean(input['completed'], 'completed');

  const existing = await readRecord(db, goalId, date);
  if (existing) {
    await db.collection('daily_records').updateOne(
      { goal_id: goalId, date },
      { $set: { completed: completed ? 1 : 0, actual_value: actualValue, notes, completed_at: completedAt, updated_at: new Date().toISOString() } }
    );
  } else {
    await db.collection('daily_records').insertOne({
      id: randomUUID(),
      goal_id: goalId,
      date,
      completed: completed ? 1 : 0,
      actual_value: actualValue,
      notes,
      completed_at: completedAt,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  return await requireRecord(db, goalId, date);
};

export const registerRecordRoutes = (router: Router, db: Db): void => {
  router.get('/api/records', async ({ query, res }) => {
    const from = query.get('from');
    const to = query.get('to');
    const date = query.get('date');
    const goalId = query.get('goalId');

    if (goalId && date) {
      const row = await readRecord(db, goalId, date);
      sendJson(res, 200, row ? toRecordRow(row) : null);
      return;
    }

    if (date) {
      const rows = await db.collection('daily_records').find({ date }).sort({ goal_id: 1 }).toArray();
      sendJson(res, 200, rows.map(r => toRecordRow(r as unknown as DbRecord)));
      return;
    }

    if (!from || !to) {
      throw badRequest('Provide either date, or both from and to.');
    }

    const rows = await db.collection('daily_records')
      .find({ date: { $gte: asCivilDate(from, 'from'), $lte: asCivilDate(to, 'to') } })
      .sort({ date: 1 })
      .toArray();

    sendJson(res, 200, rows.map(r => toRecordRow(r as unknown as DbRecord)));
  });

  router.put('/api/records', async ({ body, res }) => {
    const input = requireObject(body);
    const row = await upsert(db, input);
    sendJson(res, 200, toRecordRow(row));
  });

  router.put('/api/records/notes', async ({ body, res }) => {
    const input = requireObject(body);
    const goalId = asStringOrNull(input['goalId'], 'goalId', 64);
    if (!goalId) throw badRequest('goalId is required.');
    if (!(await goalExists(db, goalId))) throw notFound('That goal no longer exists.');

    const date = asCivilDate(input['date'], 'date');
    const notes = asStringOrNull(input['notes'], 'notes', 280);

    const existing = await readRecord(db, goalId, date);
    if (existing) {
      await db.collection('daily_records').updateOne(
        { goal_id: goalId, date },
        { $set: { notes, updated_at: new Date().toISOString() } }
      );
    } else {
      await db.collection('daily_records').insertOne({
        id: randomUUID(),
        goal_id: goalId,
        date,
        completed: 0,
        actual_value: null,
        notes,
        completed_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    const row = await requireRecord(db, goalId, date);
    sendJson(res, 200, toRecordRow(row));
  });

  router.delete('/api/records', async ({ query, res }) => {
    const goalId = query.get('goalId');
    const date = query.get('date');
    if (!goalId || !date) throw badRequest('Both goalId and date are required.');

    await db.collection('daily_records').deleteOne({ goal_id: goalId, date: asCivilDate(date, 'date') });
    sendNoContent(res);
  });
};
