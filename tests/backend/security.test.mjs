// Backend access-rule tests. Runs against the local stack
// (scripts/local-stack/up.sh) with the real Supabase Auth server and PostgREST,
// so it exercises exactly what a phone's network requests can reach.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { anon, service, sql, makeUser, signIn, resetDb, makeForm } from './helpers.mjs';

let admin, reviewer, student, student2, adminUser, studentUser, student2User;

before(async () => {
  resetDb();
  adminUser = await makeUser('owner@test.dev', 'admin');
  await makeUser('broker@test.dev', 'reviewer');
  studentUser = await makeUser('student@test.dev', 'student');
  student2User = await makeUser('student2@test.dev', 'student');
  admin = await signIn('owner@test.dev');
  reviewer = await signIn('broker@test.dev');
  student = await signIn('student@test.dev');
  student2 = await signIn('student2@test.dev');
});

test('public sign-up is closed and an uninvited email cannot get an account', async () => {
  const { error } = await anon().auth.signUp({ email: 'stranger@test.dev', password: 'Whatever-123456' });
  assert.ok(error, 'sign-up should fail');
  const r = await service().auth.admin.createUser({ email: 'stranger2@test.dev', password: 'Whatever-123456', email_confirm: true });
  assert.ok(r.error, 'even the server cannot create an account for an uninvited email');
  assert.equal(sql(`select count(*) from auth.users where email like 'stranger%'`), '0');
});

test('anonymous visitors cannot read anything', async () => {
  const c = anon();
  for (const t of ['questions', 'concept_cards', 'terms', 'profiles', 'units', 'progress_events']) {
    const { data, error } = await c.from(t).select('*');
    assert.ok(error || data.length === 0, `anon read ${t}`);
  }
  const { error } = await c.rpc('launch_gate_status');
  assert.ok(error);
});

test('profiles: invited roles applied; students see only themselves', async () => {
  const { data } = await student.from('profiles').select('id, role');
  assert.equal(data.length, 1);
  assert.equal(data[0].role, 'student');
  const all = await admin.from('profiles').select('id');
  assert.equal(all.data.length, 4);
});

test('a student cannot promote themselves or disable others', async () => {
  await student.from('profiles').update({ role: 'admin', full_name: 'Sneaky' }).eq('id', studentUser.id);
  assert.equal(sql(`select role || '|' || full_name from profiles where id = '${studentUser.id}'`), 'student|Sneaky');
  const r = await student.rpc('set_user_role', { p_user: studentUser.id, p_role: 'admin' });
  assert.ok(r.error);
  const r2 = await student.from('profiles').update({ full_name: 'x' }).eq('id', adminUser.id).select();
  assert.equal(r2.data?.length ?? 0, 0);
});

test('students see verified Lesson Pool content only; staff see unverified too', async () => {
  let s = await student.from('questions').select('id');
  assert.equal(s.data.length, 0, 'nothing verified yet');
  const rv = await reviewer.from('questions').select('id, status');
  assert.ok(rv.data.length >= 60);
  const upd = await reviewer.from('questions').update({ status: 'verified', reviewed_at: new Date().toISOString() }).in('id', ['N1.1-01', 'N1.1-02']).select('id');
  assert.equal(upd.data.length, 2);
  s = await student.from('questions').select('id, pool, status');
  assert.deepEqual(s.data.map((q) => q.id).sort(), ['N1.1-01', 'N1.1-02']);
  const cards = await student.from('concept_cards').select('id');
  assert.equal(cards.data.length, 0);
});

test('students cannot write content', async () => {
  const r = await student.from('questions').update({ status: 'verified' }).eq('id', 'N1.1-03').select();
  assert.equal(r.data?.length ?? 0, 0);
  assert.equal(sql(`select status from questions where id = 'N1.1-03'`), 'unverified');
  const ins = await student.from('questions').insert({ id: 'hack', pool: 'lesson', portion: 'national', topic_id: 'N1', subtopic_id: 'N1.1', outline_version: 'x', course: 'PRIN', exercise_type: 'tf', level: 'recall', prompt: 'x', correct: 0, explanation: 'x', fact_key: 'hack' });
  assert.ok(ins.error);
});

test('editing a question creates a new version and sends it back to review', async () => {
  await reviewer.from('questions').update({ prompt: 'Which of these is most likely real property when a home is sold?' }).eq('id', 'N1.1-01');
  assert.equal(sql(`select version || '|' || status from questions where id = 'N1.1-01'`), '2|unverified');
  assert.equal(sql(`select count(*) from question_versions where question_id = 'N1.1-01'`), '1');
  const r = await reviewer.from('questions').update({ pool: 'exam' }).eq('id', 'N1.1-02');
  assert.ok(r.error, 'pool cannot change');
});

test('reviewers cannot manage users', async () => {
  const inv = await reviewer.from('invites').insert({ email: 'new@test.dev', role: 'student' });
  assert.ok(inv.error);
  const role = await reviewer.rpc('set_user_role', { p_user: studentUser.id, p_role: 'reviewer' });
  assert.ok(role.error);
  const acc = await reviewer.rpc('set_user_access', { p_user: studentUser.id, p_disabled: true });
  assert.ok(acc.error);
  const ov = await reviewer.rpc('admin_overview');
  assert.ok(ov.error);
  const prof = await reviewer.from('profiles').select('id');
  assert.equal(prof.data.length, 1);
});

test('launch gate blocks student invites but allows a reviewer invite', async () => {
  const s = await admin.from('invites').insert({ email: 'early@test.dev', role: 'student' });
  assert.ok(s.error);
  assert.match(s.error.message, /YPFG_GATE_CLOSED/);
  const r = await admin.from('invites').insert({ email: 'Broker2@Test.dev', role: 'reviewer' });
  assert.equal(r.error, null);
  assert.equal(sql(`select email from invites where email = 'broker2@test.dev'`), 'broker2@test.dev');
  const g = await admin.rpc('launch_gate_status');
  assert.equal(g.data.met, false);
});

test('progress events: own only, idempotent, append-only', async () => {
  const id = crypto.randomUUID();
  const ev = { id, kind: 'lesson_complete', occurred_at: new Date().toISOString(), local_date: '2026-10-12', xp: 15, payload: { lesson: 'U01-L01' } };
  assert.equal((await student.from('progress_events').upsert(ev, { onConflict: 'id', ignoreDuplicates: true })).error, null);
  assert.equal((await student.from('progress_events').upsert(ev, { onConflict: 'id', ignoreDuplicates: true })).error, null);
  assert.equal(sql(`select count(*) from progress_events where id = '${id}'`), '1');
  const forged = await student.from('progress_events').insert({ ...ev, id: crypto.randomUUID(), user_id: student2User.id });
  assert.ok(forged.error, 'cannot write events for someone else');
  const big = await student.from('progress_events').insert({ ...ev, id: crypto.randomUUID(), xp: 5000 });
  assert.ok(big.error, 'XP per event is capped');
  const other = await student2.from('progress_events').select('id');
  assert.equal(other.data.length, 0, 'cannot read another user\'s events');
  const del = await student.from('progress_events').delete().eq('id', id).select();
  assert.equal(del.data?.length ?? 0, 0);
  assert.equal(sql(`select count(*) from progress_events where id = '${id}'`), '1');
});

test('Exam Pool: locked, never readable directly, served without answers, scored server-side', async () => {
  makeForm('NAT-T1', 'national');
  makeForm('NAT-T2', 'national');
  makeForm('ST-T1', 'state');
  // Exam Pool is invisible to students through the table API.
  const direct = await student.from('questions').select('id').eq('pool', 'exam');
  assert.equal(direct.data.length, 0);
  const forms = await student.from('exam_forms').select('id');
  assert.equal(forms.data.length, 0);

  const locked = await student.rpc('start_exam', { p_portion: 'national' });
  assert.match(locked.error.message, /YPFG_EXAM_LOCKED/);

  const units = sql(`select string_agg(id, ',') from units`).split(',');
  const today = new Date().toISOString().slice(0, 10);
  await student.from('progress_events').insert(units.map((u) => ({ id: crypto.randomUUID(), kind: 'unit_complete', occurred_at: new Date().toISOString(), local_date: today, payload: { unit: u } })));

  const start = await student.rpc('start_exam', { p_portion: 'national' });
  assert.equal(start.error, null);
  const sid = start.data;
  const again = await student.rpc('start_exam', { p_portion: 'national' });
  assert.equal(again.data, sid, 'resumes the active session');

  const st = await student.rpc('exam_state', { p_session: sid });
  assert.equal(st.data.status, 'active');
  assert.equal(st.data.questions.length, 85);
  const raw = JSON.stringify(st.data);
  for (const leak of ['"correct"', 'explanation', 'pretest', 'topic', 'memory_hook', 'wrong_explanations']) assert.ok(!raw.includes(leak), `leaks ${leak}`);

  const row = await student.from('exam_sessions').select('*').eq('id', sid);
  assert.ok(row.error, 'select * must fail: order and shuffle columns are not granted');
  const ok = await student.from('exam_sessions').select('id, deadline').eq('id', sid);
  assert.equal(ok.data.length, 1);

  const peek = await student2.rpc('exam_state', { p_session: sid });
  assert.ok(peek.error, 'another student cannot open this session');
  const early = await student.rpc('exam_review', { p_session: sid });
  assert.ok(early.error, 'no review before submitting');

  // Answer exactly 60 of 80 scored items correctly (75%) and every pretest item wrong.
  const meta = sql(`select string_agg(q.id || ':' || (q.correct #>> '{}') || ':' || q.is_pretest || ':' || (s.option_orders -> q.id)::text, ';')
                    from questions q, exam_sessions s where s.id = '${sid}' and q.exam_form_id = s.form_id`).split(';');
  let scoredRight = 0;
  for (const m of meta) {
    const [qid, correct, pre, ordJson] = [m.split(':')[0], m.split(':')[1], m.split(':')[2], m.split(':').slice(3).join(':')];
    const order = JSON.parse(ordJson);
    const rightDisplay = order.indexOf(Number(correct));
    let pick;
    if (pre === 'true') pick = (rightDisplay + 1) % 4;
    else if (scoredRight < 60) { pick = rightDisplay; scoredRight++; }
    else pick = (rightDisplay + 1) % 4;
    const r = await student.rpc('exam_save', { p_session: sid, p_question: qid, p_answer: pick, p_marked: false, p_seconds: 30 });
    assert.equal(r.error, null);
  }
  const sub = await student.rpc('exam_submit', { p_session: sid });
  assert.equal(sub.data.passed, true);
  assert.equal(Number(sub.data.score_pct), 75);
  const rev = await student.rpc('exam_review', { p_session: sid });
  assert.equal(rev.data.scored_total, 80, 'pretest items excluded from scoring');
  assert.equal(rev.data.items.length, 85);
  assert.equal(rev.data.items.filter((i) => i.pretest).length, 5);
  assert.ok(rev.data.results.pacing.budget_seconds > 0);

  const late = await student.rpc('exam_save', { p_session: sid, p_question: meta[0].split(':')[0], p_answer: 0, p_marked: false, p_seconds: 1 });
  assert.equal(late.data.ok, false, 'no changes after submit');

  // Second attempt must use the other form; third must be refused.
  const s2 = await student.rpc('start_exam', { p_portion: 'national' });
  const form2 = sql(`select form_id from exam_sessions where id = '${s2.data}'`);
  assert.notEqual(form2, sql(`select form_id from exam_sessions where id = '${sid}'`));
  // Timer keeps running while the app is closed: push the deadline into the past.
  sql(`update exam_sessions set deadline = now() - interval '1 minute' where id = '${s2.data}'`);
  const expired = await student.rpc('exam_state', { p_session: s2.data });
  assert.equal(expired.data.status, 'submitted', 'expired session auto-submits on reopen');
  const s3 = await student.rpc('start_exam', { p_portion: 'national' });
  assert.match(s3.error.message, /YPFG_NO_UNSEEN_FORMS/);

  const ov = await student.rpc('my_exam_overview');
  assert.equal(ov.data.unseen_national, 0);
  assert.equal(ov.data.ready.ready, false);
});

test('Ready to Test needs two passes in a row on both portions; XP cannot earn it', async () => {
  sql(`set session_replication_role = replica;
       insert into progress_events (id, user_id, kind, occurred_at, local_date, xp) select gen_random_uuid(), '${student2User.id}', 'lesson_complete', now(), current_date, 60 from generate_series(1, 200);`);
  let r = sql(`select ready_status_for('${student2User.id}') ->> 'ready'`);
  assert.equal(r, 'false');
  const ins = (portion, form, passed, mins) => sql(`insert into exam_forms(id, portion, name, status) values ('${form}', '${portion}', '${form}', 'verified') on conflict do nothing;
      insert into exam_sessions(user_id, form_id, portion, started_at, deadline, submitted_at, question_order, passed, score_pct)
      values ('${student2User.id}', '${form}', '${portion}', now() - interval '${mins + 60} minutes', now(), now() - interval '${mins} minutes', '{}', ${passed}, ${passed ? 80 : 60});`);
  ins('national', 'RT-N1', true, 50); ins('national', 'RT-N2', true, 40); ins('state', 'RT-S1', true, 30);
  assert.equal(sql(`select ready_status_for('${student2User.id}') ->> 'ready'`), 'false');
  ins('state', 'RT-S2', false, 20);
  assert.equal(sql(`select ready_status_for('${student2User.id}') ->> 'ready'`), 'false');
  ins('state', 'RT-S3', true, 10); ins('state', 'RT-S4', true, 5);
  assert.equal(sql(`select ready_status_for('${student2User.id}') ->> 'ready'`), 'true');
  const ov = await admin.rpc('admin_overview');
  assert.equal(ov.data.find((u) => u.id === student2User.id).ready, true);
});

test('leaderboard is opt-in and shows XP only', async () => {
  let lb = await student.rpc('weekly_leaderboard');
  assert.deepEqual(lb.data, []);
  await student.from('profiles').update({ leaderboard_opt_in: true, leaderboard_name: 'Sam' }).eq('id', studentUser.id);
  lb = await student.rpc('weekly_leaderboard');
  assert.equal(lb.data.length, 1);
  assert.deepEqual(Object.keys(lb.data[0]).sort(), ['me', 'name', 'xp']);
});

test('removing access blocks content; deleting a user removes all their data', async () => {
  const off = await admin.rpc('set_user_access', { p_user: student2User.id, p_disabled: true });
  assert.equal(off.error, null);
  const u = await student2.from('units').select('id');
  assert.equal(u.data.length, 0);
  const svc = service();
  const del = await svc.auth.admin.deleteUser(student2User.id);
  assert.equal(del.error, null);
  for (const t of ['profiles', 'progress_events', 'exam_sessions', 'roadmap_steps', 'user_stats', 'flags']) {
    const col = t === 'profiles' ? 'id' : 'user_id';
    assert.equal(sql(`select count(*) from ${t} where ${col} = '${student2User.id}'`), '0', t);
  }
});

test('flags reach the review queue; students only see their own', async () => {
  const f = await student.from('flags').insert({ item_type: 'question', item_id: 'N1.1-01', note: 'Option B also looks right' });
  assert.equal(f.error, null);
  const staff = await reviewer.from('flags').select('id, note');
  assert.equal(staff.data.length, 1);
});
