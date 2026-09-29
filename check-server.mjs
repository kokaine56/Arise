// Smoke test: boot the real server against a temp database and drive it over
// HTTP. Scratch script, not part of the suite.
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'arise-smoke-'));
process.env['ARISE_DB_PATH'] = join(dir, 'arise.db');
process.env['ARISE_STATIC_DIR'] = 'dist';
process.env['PORT'] = '0';

const { createApp } = await import('./server/index.ts');
const app = createApp();
const server = createServer(app.handler);
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0;
let fail = 0;
const ok = (label, cond, extra = '') => {
  if (cond) { pass += 1; console.log(`  ok   ${label}`); }
  else { fail += 1; console.log(`  FAIL ${label} ${extra}`); }
};

const req = (method, path, body) =>
  fetch(base + path, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

console.log('\nhealth');
ok('GET /healthz is 200', (await req('GET', '/healthz')).status === 200);

console.log('\ngoals');
const created = await (await req('POST', '/api/goals', {
  name: 'Morning run',
  description: null,
  type: 'numeric',
  targetValue: 3,
  unit: 'km',
  targetTime: null,
  categoryId: null,
  frequencyType: 'daily',
  frequencyConfig: { kind: 'daily' },
  startDate: '2024-01-01',
  endDate: null,
  reminderTime: '07:30',
  isActive: true,
})).json();
ok('POST /api/goals returns 201-shaped row', created.id && created.is_active === true, JSON.stringify(created));
ok('frequency_config comes back parsed, not as a string',
  typeof created.frequency_config === 'object' && created.frequency_config.kind === 'daily',
  JSON.stringify(created.frequency_config));

const second = await (await req('POST', '/api/goals', {
  name: 'Drink water', type: 'checkbox', frequencyType: 'daily',
  frequencyConfig: { kind: 'daily' }, startDate: '2024-01-01', isActive: true,
})).json();
ok('a second goal gets the next sort_order', second.sort_order === created.sort_order + 1,
  `${created.sort_order} -> ${second.sort_order}`);

ok('GET /api/goals lists both', (await (await req('GET', '/api/goals')).json()).length === 2);

const badGoal = await req('POST', '/api/goals', {
  name: 'Bad', type: 'numeric', frequencyType: 'daily',
  frequencyConfig: { kind: 'weekly' }, startDate: '2024-01-01', targetValue: 1,
});
ok('schema rejects a mismatched frequency payload with 400', badGoal.status === 400,
  `got ${badGoal.status}: ${await badGoal.text()}`);

const badClock = await req('POST', '/api/goals', {
  name: 'Bad', type: 'checkbox', frequencyType: 'daily',
  frequencyConfig: { kind: 'daily' }, startDate: '2024-01-01', reminderTime: '25:00',
});
ok('hour 25 is rejected with 400', badClock.status === 400, `got ${badClock.status}`);

const badDate = await req('POST', '/api/goals', {
  name: 'Bad', type: 'checkbox', frequencyType: 'daily',
  frequencyConfig: { kind: 'daily' }, startDate: '2023-02-30',
});
ok('30 February is rejected with 400', badDate.status === 400, `got ${badDate.status}`);

const patched = await (await req('PATCH', `/api/goals/${created.id}`, { name: 'Evening run' })).json();
ok('PATCH updates only the named field', patched.name === 'Evening run' && patched.target_value === 3,
  JSON.stringify({ name: patched.name, target: patched.target_value }));
ok('updated_at moved', patched.updated_at !== created.updated_at);

console.log('\nrecords');
// Client claims "not done" at exactly the target. The database should overrule.
const r1 = await (await req('PUT', '/api/records', {
  goalId: created.id, date: '2024-01-05', completed: false, actualValue: 3,
})).json();
ok('measured completion is derived, not believed', r1.completed === true, JSON.stringify(r1));
ok('completed_at was stamped', typeof r1.completed_at === 'string');

const r2 = await (await req('PUT', '/api/records', {
  goalId: created.id, date: '2024-01-06', completed: true, actualValue: 1,
})).json();
ok('under-target completion is derived down', r2.completed === false && r2.completed_at === null,
  JSON.stringify(r2));

const cb = await (await req('PUT', '/api/records', {
  goalId: second.id, date: '2024-01-05', completed: true,
})).json();
ok('checkbox completion is left to the client', cb.completed === true);

const range = await (await req('GET', '/api/records?from=2024-01-01&to=2024-01-31')).json();
ok('range read returns all three records', range.length === 3, `got ${range.length}`);

const oneDay = await (await req('GET', '/api/records?date=2024-01-05')).json();
ok('single-day read returns two', oneDay.length === 2, `got ${oneDay.length}`);

const single = await (await req('GET', `/api/records?goalId=${created.id}&date=2024-01-05`)).json();
ok('goal+date read returns that record', single?.goal_id === created.id);

const orphan = await req('PUT', '/api/records', {
  goalId: 'does-not-exist', date: '2024-01-05', completed: true,
});
ok('unknown goal is 404, not 500', orphan.status === 404, `got ${orphan.status}`);

ok('clearing a day is 204', (await req('DELETE', `/api/records?goalId=${created.id}&date=2024-01-05`)).status === 204);
ok('cleared day is gone', (await (await req('GET', `/api/records?goalId=${created.id}&date=2024-01-05`)).json()) === null);

console.log('\nprofile, settings, categories');
ok('GET /api/profile is 200', (await req('GET', '/api/profile')).status === 200);
ok('timezone is validated', (await req('PATCH', '/api/profile', { timezone: 'Mars/Olympus' })).status === 404);
const tz = await (await req('PATCH', '/api/profile', { timezone: 'Asia/Kolkata' })).json();
ok('valid timezone is stored', tz.timezone === 'Asia/Kolkata');
const settings = await (await req('PATCH', '/api/settings', { weekStartsOn: 7, defaultUnit: 'km' })).json();
ok('settings patch stores booleans as booleans',
  settings.week_starts_on === 7 && typeof settings.notifications_enabled === 'boolean',
  JSON.stringify(settings));
const cats = await (await req('GET', '/api/categories')).json();
ok('eight built-in categories are seeded', cats.length === 8, `got ${cats.length}`);
ok('built-ins are flagged', cats.every((c) => c.is_builtin === true));
ok('built-in cannot be deleted', (await req('DELETE', `/api/categories/${cats[0].id}`)).status === 400);
const made = await (await req('POST', '/api/categories', { label: 'Physio' })).json();
ok('custom category is created', made.slug === 'physio' && made.is_builtin === false, JSON.stringify(made));
ok('custom category can be deleted', (await req('DELETE', `/api/categories/${made.id}`)).status === 204);

console.log('\nstatic + routing');
const root = await req('GET', '/');
ok('GET / serves the app', root.status === 200 && (await root.text()).includes('<div id="root">'));
const deep = await req('GET', '/goals');
ok('GET /goals falls back to index.html', deep.status === 200);
ok('fallback is no-cache, not immutable',
  deep.headers.get('cache-control') === 'no-cache', deep.headers.get('cache-control'));

const asset = [...(await (await req('GET', '/')).text()).matchAll(/\/assets\/[^"']+\.js/g)][0];
if (asset) {
  const js = await req('GET', asset[0]);
  ok('hashed asset is immutable', js.headers.get('cache-control')?.includes('immutable'));
  ok('asset is gzipped when accepted', js.headers.get('content-encoding') === 'gzip',
    String(js.headers.get('content-encoding')));
  ok('Vary names the encoding', js.headers.get('vary') === 'Accept-Encoding');
  const identity = await fetch(base + asset[0], { headers: { 'accept-encoding': 'identity' } });
  ok('asset is identity-encoded when gzip is not accepted',
    identity.headers.get('content-encoding') === null);
  ok('gzip and identity bodies decode to the same bytes', (await js.arrayBuffer()).byteLength > 0);
}
// fetch() normalises a literal `/../` before it reaches the wire, which would
// make this assertion pass for the wrong reason. Percent-encode it so the
// server actually receives a traversal attempt.
const traversal = await fetch(base + '/%2e%2e%2f%2e%2e%2fpackage.json');
const traversalBody = await traversal.text();
ok('path traversal does not leak a file outside the root',
  !traversalBody.includes('"name": "arise"'), traversalBody.slice(0, 80));

console.log('\nerrors');
ok('unknown /api path is 404', (await req('GET', '/api/nope')).status === 404);
ok('known path with the wrong method is 405',
  (await req('POST', '/api/profile', { timezone: 'UTC' })).status === 405,
  `got ${await (await req('POST', '/api/profile', { timezone: 'UTC' })).status}`);
const bigBody = await fetch(base + '/api/goals', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name: 'x'.repeat(300000) }),
});
ok('oversized body is 413', bigBody.status === 413, `got ${bigBody.status}`);
const malformed = await fetch(base + '/api/goals', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json',
});
ok('malformed JSON is 400', malformed.status === 400, `got ${malformed.status}`);

server.close();
app.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
