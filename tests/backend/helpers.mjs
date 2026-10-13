import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

export const URL = process.env.SB_URL || 'http://localhost:54321';
const SECRET = 'super-secret-jwt-token-with-at-least-32-characters-long';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
export function jwt(payload) {
  const h = b64({ alg: 'HS256', typ: 'JWT' });
  const p = b64({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 * 24, ...payload });
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
export const ANON_KEY = jwt({ role: 'anon', iss: 'supabase' });
export const SERVICE_KEY = jwt({ role: 'service_role', iss: 'supabase' });

export const opts = { auth: { persistSession: false, autoRefreshToken: false } };
export const service = () => createClient(URL, SERVICE_KEY, opts);
export const anon = () => createClient(URL, ANON_KEY, opts);

export function sql(query) {
  return execFileSync('psql', ['-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1', '-Atqc', query], { encoding: 'utf8' }).trim();
}

// Invite (bypassing the launch gate for test setup only) and create a user.
export async function makeUser(email, role, password = 'Test-password-123') {
  sql(`set session_replication_role = replica; insert into invites(email, role) values ('${email}', '${role}') on conflict (email) do update set role = excluded.role;`);
  const svc = service();
  const { data, error } = await svc.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: email.split('@')[0] } });
  if (error) throw error;
  return data.user;
}
export async function signIn(email, password = 'Test-password-123') {
  const c = anon();
  const { error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return c;
}
export function resetDb() {
  sql(`set session_replication_role = replica;
    delete from exam_sessions; delete from progress_events; delete from flags; delete from roadmap_steps; delete from user_stats;
    delete from questions where pool = 'exam'; delete from exam_forms; delete from invites;
    set session_replication_role = origin;
    delete from auth.identities; delete from auth.users;
    set session_replication_role = replica;
    update questions set status = 'unverified', reviewed_by = null, reviewed_at = null;
    update concept_cards set status = 'unverified'; update terms set status = 'unverified';`);
}

// Builds a complete, verified exam form whose topic counts match the outline.
export function makeForm(formId, portion) {
  const cfg = sql(`select scored_items || ',' || pretest_min from exam_config where portion = '${portion}'`).split(',').map(Number);
  const topics = sql(`select t.id || ':' || t.items || ':' || (select min(s.id) from outline_subtopics s where s.topic_id = t.id) from outline_topics t where portion = '${portion}' order by sort`)
    .split('\n').map((l) => l.split(':'));
  let total = topics.reduce((n, [, items]) => n + Number(items), 0);
  const plan = [];
  if (total === cfg[0]) topics.forEach(([id, items, sub]) => { for (let i = 0; i < Number(items); i++) plan.push([id, sub, false]); });
  else for (let i = 0; i < cfg[0]; i++) { const [id, , sub] = topics[i % topics.length]; plan.push([id, sub, false]); }
  for (let i = 0; i < cfg[1]; i++) plan.push([topics[0][0], topics[0][2], true]);
  sql(`insert into exam_forms(id, portion, name, status) values ('${formId}', '${portion}', '${formId}', 'verified');`);
  const values = plan.map(([topic, sub, pre], i) => `('${formId}-Q${i}', 'exam', '${formId}', ${pre}, '${portion}', '${topic}', '${sub}', 'test', 'LAW', 'mcq', 2, 'recall',
     'Test question ${formId} ${i}', '["A","B","C","D"]', '${i % 4}', 'Because.', '["x","y","z","w"]', 'hook', 'test-${formId}-${i}', 'verified')`).join(',');
  sql(`insert into questions(id, pool, exam_form_id, is_pretest, portion, topic_id, subtopic_id, outline_version, course, exercise_type, difficulty, level, prompt, options, correct, explanation, wrong_explanations, memory_hook, fact_key, status) values ${values};`);
  return plan.length;
}
