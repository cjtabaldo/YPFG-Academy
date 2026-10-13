// Edge Function tests: invitations, deletion, invite acceptance, password
// reset, streak-saver email and one-click unsubscribe. Needs the local stack
// and scripts/local-stack/functions.sh running.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { URL as SB, ANON_KEY, anon, sql, makeUser, signIn, resetDb } from './helpers.mjs';

const STACK = process.env.STACK_DIR;
const mails = () => (fs.existsSync(`${STACK}/mail.jsonl`) ? fs.readFileSync(`${STACK}/mail.jsonl`, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const lastMailTo = (email) => mails().filter((m) => m.to.includes(email)).pop();
const decodeQP = (s) => s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
const linkIn = (m) => decodeQP(m.body).match(/https?:\/\/[^\s"<>]+verify\?[^\s"<>]+/)[0].replace(/&amp;/g, '&').replace(/^(https?:\/\/[^/]+)\/verify/, '$1/auth/v1/verify'); // local Auth omits the /auth/v1 prefix
async function follow(link) {
  const r = await fetch(link, { redirect: 'manual' });
  const loc = r.headers.get('location') ?? '';
  return new URLSearchParams(loc.split('#')[1] ?? '');
}
const fn = (name, token, body) => fetch(`${SB}/functions/v1/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON_KEY, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then(async (r) => ({ status: r.status, body: await r.json() }));

let admin, reviewer, student, studentUser, adminToken;
before(async () => {
  resetDb();
  if (fs.existsSync(`${STACK}/mail.jsonl`)) fs.unlinkSync(`${STACK}/mail.jsonl`);
  await makeUser('owner@test.dev', 'admin');
  await makeUser('broker@test.dev', 'reviewer');
  studentUser = await makeUser('student@test.dev', 'student');
  admin = await signIn('owner@test.dev');
  reviewer = await signIn('broker@test.dev');
  student = await signIn('student@test.dev');
  adminToken = (await admin.auth.getSession()).data.session.access_token;
});

test('only an Admin can call the admin function', async () => {
  const rt = (await reviewer.auth.getSession()).data.session.access_token;
  const st = (await student.auth.getSession()).data.session.access_token;
  assert.equal((await fn('admin-users', rt, { action: 'invite', email: 'x@test.dev', role: 'reviewer' })).status, 403);
  assert.equal((await fn('admin-users', st, { action: 'delete', userId: studentUser.id })).status, 403);
  assert.equal((await fn('admin-users', ANON_KEY, { action: 'invite', email: 'x@test.dev', role: 'reviewer' })).status, 403);
});

test('student invites are blocked by the launch gate', async () => {
  const r = await fn('admin-users', adminToken, { action: 'invite', email: 'newstudent@test.dev', role: 'student' });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /YPFG_GATE_CLOSED/);
  assert.equal(sql(`select count(*) from auth.users where email = 'newstudent@test.dev'`), '0');
});

test('invite a reviewer, accept the invitation, set a password, sign in', async () => {
  const r = await fn('admin-users', adminToken, { action: 'invite', email: 'Broker2@Test.dev', role: 'reviewer', name: 'Pat Broker', redirectTo: 'http://localhost:4173/set-password?mode=invite' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(sql(`select role || '|' || full_name from profiles where email = 'broker2@test.dev'`), 'reviewer|Pat Broker');
  const mail = lastMailTo('broker2@test.dev');
  assert.ok(mail, 'invitation email sent');
  const params = await follow(linkIn(mail));
  assert.equal(params.get('type'), 'invite');
  const c = anon();
  await c.auth.setSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token') });
  assert.equal((await c.auth.updateUser({ password: 'Chosen-password-42' })).error, null);
  const again = await signIn('broker2@test.dev', 'Chosen-password-42');
  const me = await again.from('profiles').select('role');
  assert.equal(me.data[0].role, 'reviewer');
});

test('password reset by email works', async () => {
  const c = anon();
  assert.equal((await c.auth.resetPasswordForEmail('student@test.dev', { redirectTo: 'http://localhost:4173/set-password?mode=reset' })).error, null);
  const params = await follow(linkIn(lastMailTo('student@test.dev')));
  assert.equal(params.get('type'), 'recovery');
  await c.auth.setSession({ access_token: params.get('access_token'), refresh_token: params.get('refresh_token') });
  assert.equal((await c.auth.updateUser({ password: 'Brand-new-pass-9' })).error, null);
  await assert.rejects(signIn('student@test.dev'), 'old password stops working');
  await signIn('student@test.dev', 'Brand-new-pass-9');
});

test('streak-saver emails once, only when due, with a working one-click unsubscribe', async () => {
  const sent = `${STACK}/sent-emails.jsonl`;
  if (fs.existsSync(sent)) fs.unlinkSync(sent);
  const tz = 'America/Los_Angeles';
  const hour = Number(sql(`select extract(hour from now() at time zone '${tz}')::int`));
  sql(`update app_settings set streak_email_local_hour = ${hour};
       update profiles set timezone = '${tz}', streak_email_opt_in = true, full_name = 'Sam Student', last_streak_email_on = null where id = '${studentUser.id}';
       insert into user_stats (user_id, streak, last_study_date) values ('${studentUser.id}', 5, (now() at time zone '${tz}')::date - 1)
       on conflict (user_id) do update set streak = 5, last_study_date = excluded.last_study_date;`);
  const call = (secret) => fetch(`${SB}/functions/v1/streak-saver`, { method: 'POST', headers: { 'x-cron-secret': secret } });
  assert.equal((await call('wrong')).status, 403);
  let r = await (await call('local-cron-secret')).json();
  assert.deepEqual(r, { due: 1, sent: 1 });
  r = await (await call('local-cron-secret')).json();
  assert.deepEqual(r, { due: 0, sent: 0 }, 'at most one per day');
  const email = JSON.parse(fs.readFileSync(sent, 'utf8').trim().split('\n')[0]);
  assert.match(email.subject, /5-day streak/);
  assert.ok(email.headers['List-Unsubscribe'].includes('/functions/v1/unsubscribe?token='));
  // Studied today: no email even if due hour.
  sql(`update profiles set last_streak_email_on = null where id = '${studentUser.id}'; update user_stats set last_study_date = (now() at time zone '${tz}')::date where user_id = '${studentUser.id}'`);
  r = await (await call('local-cron-secret')).json();
  assert.equal(r.due, 0);
  // One-click unsubscribe (what mail apps send).
  const oneClick = email.headers['List-Unsubscribe'].slice(1, -1);
  const u = await fetch(oneClick, { method: 'POST', body: 'List-Unsubscribe=One-Click', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  assert.equal(u.status, 200);
  assert.equal(sql(`select streak_email_opt_in from profiles where id = '${studentUser.id}'`), 'f');
  const bad = await fetch(`${SB}/functions/v1/unsubscribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: 'nope' }) });
  assert.equal(bad.status, 400);
});

test('Admin can delete a user and all their data', async () => {
  const r = await fn('admin-users', adminToken, { action: 'delete', userId: studentUser.id });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  for (const [t, c] of [['profiles', 'id'], ['user_stats', 'user_id'], ['progress_events', 'user_id']]) assert.equal(sql(`select count(*) from ${t} where ${c} = '${studentUser.id}'`), '0');
  assert.equal(sql(`select count(*) from auth.users where id = '${studentUser.id}'`), '0');
  const self = await fn('admin-users', adminToken, { action: 'delete', userId: (await admin.auth.getUser()).data.user.id });
  assert.equal(self.status, 400);
});
