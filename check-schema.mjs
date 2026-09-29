// Scratch harness: applies the SQLite schema and probes each design rule.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';

const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys = ON');
db.exec('PRAGMA recursive_triggers = OFF');
db.exec(readFileSync('server/migrations/0001_initial_schema.sql', 'utf8'));

let pass = 0;
let fail = 0;

const check = (label, fn) => {
  try {
    fn();
    pass += 1;
  } catch (err) {
    fail += 1;
    console.log(`FAIL  ${label}: ${err.message}`);
  }
};

// Expects the statement to be rejected by a constraint.
const rejects = (label, sql, ...params) =>
  check(label, () => {
    try {
      db.prepare(sql).run(...params);
    } catch {
      return;
    }
    throw new Error('statement was accepted but should have been rejected');
  });

const accepts = (label, sql, ...params) => check(label, () => db.prepare(sql).run(...params));

const NUMERIC_GOAL = `
  INSERT INTO goals (id, name, goal_type, target_value, unit, frequency_type,
                     frequency_config, start_date)
  VALUES (?, ?, 'numeric', 3, 'km', 'daily', '{"kind":"daily"}', '2024-01-01')`;

accepts('numeric goal with a target is accepted', NUMERIC_GOAL, 'g1', 'Run');
rejects(
  'measured goal without a target is rejected',
  `INSERT INTO goals (id,name,goal_type,frequency_type,frequency_config,start_date)
   VALUES ('g2','X','numeric','daily','{"kind":"daily"}','2024-01-01')`,
);
rejects(
  'checkbox goal carrying a target is rejected',
  `INSERT INTO goals (id,name,goal_type,target_value,frequency_type,frequency_config,start_date)
   VALUES ('g3','X','checkbox',5,'daily','{"kind":"daily"}','2024-01-01')`,
);
rejects(
  'time goal without target_time is rejected',
  `INSERT INTO goals (id,name,goal_type,frequency_type,frequency_config,start_date)
   VALUES ('g4','X','time','daily','{"kind":"daily"}','2024-01-01')`,
);
rejects(
  'reminder hour 25 is rejected (stricter than the Postgres original)',
  `INSERT INTO goals (id,name,goal_type,frequency_type,frequency_config,start_date,reminder_time)
   VALUES ('g5','X','checkbox','daily','{"kind":"daily"}','2024-01-01','25:00')`,
);
accepts(
  'reminder 23:59 is accepted',
  `INSERT INTO goals (id,name,goal_type,frequency_type,frequency_config,start_date,reminder_time)
   VALUES ('g6','X','checkbox','daily','{"kind":"daily"}','2024-01-01','23:59')`,
);
rejects(
  'end_date before start_date is rejected',
  `INSERT INTO goals (id,name,goal_type,frequency_type,frequency_config,start_date,end_date)
   VALUES ('g7','X','checkbox','daily','{"kind":"daily"}','2024-03-01','2024-02-01')`,
);
rejects(
  'archiving while still active is rejected',
  `UPDATE goals SET archived_at = '2024-02-01' WHERE id = 'g1'`,
);
rejects(
  'frequency_config.kind disagreeing with frequency_type is rejected',
  `INSERT INTO goals (id,name,goal_type,target_value,frequency_type,frequency_config,start_date)
   VALUES ('g8','X','numeric',1,'daily','{"kind":"weekly"}','2024-01-01')`,
);
rejects(
  'selected_days with an empty days array is rejected',
  `INSERT INTO goals (id,name,goal_type,target_value,frequency_type,frequency_config,start_date)
   VALUES ('g9','X','numeric',1,'selected_days','{"kind":"selected_days","days":[]}','2024-01-01')`,
);
rejects(
  'selected_days containing weekday 8 is rejected',
  `INSERT INTO goals (id,name,goal_type,target_value,frequency_type,frequency_config,start_date)
   VALUES ('g10','X','numeric',1,'selected_days','{"kind":"selected_days","days":[1,8]}','2024-01-01')`,
);
accepts(
  'selected_days with valid weekdays is accepted',
  `INSERT INTO goals (id,name,goal_type,target_value,frequency_type,frequency_config,start_date)
   VALUES ('g11','X','numeric',1,'selected_days','{"kind":"selected_days","days":[1,7]}','2024-01-01')`,
);
rejects(
  'a non-existent calendar date is rejected',
  `INSERT INTO goals (id,name,goal_type,target_value,frequency_type,frequency_config,start_date)
   VALUES ('g12','X','numeric',1,'daily','{"kind":"daily"}','2023-02-30')`,
);

const ROW = (id) => db.prepare('SELECT * FROM daily_goal_records WHERE id = ?').get(id);

// Rule 3: a client claiming "not done" at 3 of 3 km must be overruled.
accepts(
  'record at exactly the target is accepted',
  `INSERT INTO daily_goal_records (id, goal_id, date, completed, actual_value)
   VALUES ('r1','g1','2024-01-05', 0, 3)`,
);
check('measured completion is derived upward (claimed 0, actually 3/3)', () => {
  const row = ROW('r1');
  if (row.completed !== 1) throw new Error(`completed = ${row.completed}, want 1`);
  if (typeof row.completed_at !== 'string') throw new Error('completed_at was not stamped');
});

accepts(
  'under-target record is accepted',
  `INSERT INTO daily_goal_records (id, goal_id, date, completed, actual_value)
   VALUES ('r2','g1','2024-01-06', 1, 1)`,
);
check('measured completion is derived downward (claimed 1, actually 1/3)', () => {
  const row = ROW('r2');
  if (row.completed !== 0) throw new Error(`completed = ${row.completed}, want 0`);
  if (row.completed_at !== null) throw new Error(`completed_at = ${row.completed_at}, want null`);
});

accepts(
  'checkbox record is accepted',
  `INSERT INTO daily_goal_records (id, goal_id, date, completed)
   VALUES ('r3','g6','2024-01-05', 1)`,
);
check('checkbox completion is left to the client and stamps completed_at', () => {
  const row = ROW('r3');
  if (row.completed !== 1) throw new Error(`completed = ${row.completed}, want 1`);
  if (typeof row.completed_at !== 'string') throw new Error('completed_at was not stamped');
});

check('un-completing a checkbox clears completed_at', () => {
  db.prepare("UPDATE daily_goal_records SET completed = 0 WHERE id = 'r3'").run();
  const row = ROW('r3');
  if (row.completed_at !== null) throw new Error(`completed_at = ${row.completed_at}, want null`);
});

rejects(
  'a second record for the same goal and date is rejected (rule 2)',
  `INSERT INTO daily_goal_records (id, goal_id, date, completed)
   VALUES ('r4','g1','2024-01-05', 1)`,
);
rejects(
  'a record for a goal that does not exist is rejected',
  `INSERT INTO daily_goal_records (id, goal_id, date, completed)
   VALUES ('r5','ghost','2024-01-05', 1)`,
);

check('updated_at moves on update', () => {
  const before = ROW('r1').updated_at;
  db.prepare("UPDATE daily_goal_records SET notes = 'hi' WHERE id = 'r1'").run();
  const after = ROW('r1').updated_at;
  if (before === after) throw new Error(`updated_at unchanged at ${after}`);
});

check('seeded categories are present', () => {
  const n = db.prepare('SELECT count(*) AS n FROM categories').get().n;
  if (n !== 8) throw new Error(`expected 8 built-ins, found ${n}`);
});

check('profile and settings rows exist', () => {
  if (!db.prepare('SELECT * FROM profiles WHERE id = 1').get()) throw new Error('no profile');
  if (!db.prepare('SELECT * FROM user_settings WHERE id = 1').get()) throw new Error('no settings');
});

check('profiles cannot grow a second row', () => {
  try {
    db.prepare('INSERT INTO profiles (id) VALUES (2)').run();
  } catch {
    return;
  }
  throw new Error('a second profile row was accepted');
});

check('mismatched record update is re-derived, not trusted', () => {
  db.prepare("UPDATE daily_goal_records SET actual_value = 99 WHERE id = 'r2'").run();
  const row = ROW('r2');
  if (row.completed !== 1) throw new Error(`completed = ${row.completed}, want 1`);
  if (typeof row.completed_at !== 'string') throw new Error('completed_at was not re-stamped');
});

check('deleting a goal cascades to its records', () => {
  db.prepare("DELETE FROM goals WHERE id = 'g1'").run();
  const n = db.prepare("SELECT count(*) AS n FROM daily_goal_records WHERE goal_id = 'g1'").get().n;
  if (n !== 0) throw new Error(`${n} orphaned records survived`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
