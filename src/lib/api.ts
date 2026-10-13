// Every call to the server goes through here. The database enforces who may
// do what; these functions only shape requests and turn errors into plain
// language.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../config/env';
import type {
  AppSettings, Card, Content, ExamConfig, ExamForm, ExamOverview, ExamReview, ExamState, Lesson, Profile,
  ProgressEvent, Question, RoadmapStep, Role, Subtopic, Term, Topic, Unit, VerifyItem,
} from './types';

export const supabase: SupabaseClient = createClient(SUPABASE_URL || 'http://localhost:54321', SUPABASE_ANON_KEY || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
});

const MESSAGES: Record<string, string> = {
  YPFG_NOT_INVITED: 'That email has not been invited. Ask the person who invited you to check the address.',
  YPFG_GATE_CLOSED: 'Student invites open once the launch gate is met. You can invite a Reviewer now.',
  YPFG_FORBIDDEN: "You don't have permission to do that.",
  YPFG_EXAM_LOCKED: 'Finish every unit once to unlock Exam Day.',
  YPFG_NO_UNSEEN_FORMS: "You've taken every available form for this portion. New forms are on the way.",
  YPFG_LAST_ADMIN: 'There must always be at least one Admin.',
  YPFG_SELF: "You can't remove your own access.",
  YPFG_POOL_LOCKED: 'A question cannot move between the Lesson Pool and the Exam Pool.',
  YPFG_EXAM_ACTIVE: 'Submit the exam to see the review.',
  YPFG_NOT_FOUND: "We couldn't find that.",
};

export class ApiError extends Error {}
export function friendly(err: unknown): string {
  const msg = (err as { message?: string })?.message ?? String(err);
  const code = Object.keys(MESSAGES).find((k) => msg.includes(k));
  if (code) return MESSAGES[code];
  if (/Invalid login credentials/i.test(msg)) return "That email and password don't match. Try again or reset your password.";
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return "You're offline. We'll finish this when you're back online.";
  if (/Password should be/i.test(msg)) return 'Use at least 8 characters for your password.';
  if (/rate limit/i.test(msg)) return 'Too many tries. Wait a minute and try again.';
  return msg || 'Something went wrong. Try again.';
}
function check<R extends { error: unknown }>(r: R): R extends { data: infer D } ? D : never {
  if (r.error) throw new ApiError(friendly(r.error));
  return (r as unknown as { data: R extends { data: infer D } ? D : never }).data;
}

// ---------------------------------------------------------------- auth
export const auth = {
  session: async () => (await supabase.auth.getSession()).data.session,
  signIn: async (email: string, password: string) => check(await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })),
  signOut: () => supabase.auth.signOut(),
  sendReset: async (email: string) => check(await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo: `${location.origin}/set-password?mode=reset` })),
  setPassword: async (password: string) => check(await supabase.auth.updateUser({ password })),
  verifyToken: async (token_hash: string, type: 'invite' | 'recovery') => check(await supabase.auth.verifyOtp({ token_hash, type })),
};

// ---------------------------------------------------------------- content
async function all<T>(table: string, order = 'id'): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const rows = check(await supabase.from(table).select('*').order(order).range(from, from + 999)) as T[];
    out.push(...rows);
    if (rows.length < 1000) return out;
  }
}

export async function loadContent(): Promise<Content> {
  const [topics, subtopics, units, lessons, terms, cards, questions, verify, settings, examConfig] = await Promise.all([
    all<Topic>('outline_topics', 'sort'), all<Subtopic>('outline_subtopics', 'sort'), all<Unit>('units', 'sort'),
    all<Lesson>('lessons', 'sort'), all<Term>('terms', 'term'), all<Card>('concept_cards'),
    // Lesson Pool only here. Staff load the Exam Pool separately in the editor.
    (async () => {
      const out: Question[] = [];
      for (let from = 0; ; from += 1000) {
        const rows = check(await supabase.from('questions').select('*').eq('pool', 'lesson').neq('status', 'rejected').order('id').range(from, from + 999)) as Question[];
        out.push(...rows);
        if (rows.length < 1000) return out;
      }
    })(),
    all<VerifyItem>('verify_items', 'sort'),
    supabase.from('app_settings').select('*').single().then((r) => check(r) as AppSettings),
    all<ExamConfig>('exam_config', 'portion'),
  ]);
  const visibleTerms = terms.filter((t) => t.status !== 'rejected');
  const visibleCards = cards.filter((c) => c.status !== 'rejected');
  return { topics, subtopics, units, lessons, terms: visibleTerms, cards: visibleCards, questions, verify, settings, examConfig, loadedAt: new Date().toISOString() };
}

// ---------------------------------------------------------------- profile & sync
export const profileApi = {
  get: async (id: string) => check(await supabase.from('profiles').select('*').eq('id', id).single()) as Profile,
  update: async (id: string, patch: Partial<Profile>) => check(await supabase.from('profiles').update(patch).eq('id', id).select('*').single()) as Profile,
  mergePrefs: async (prefs: unknown, at: string) => check(await supabase.rpc('merge_prefs', { p_prefs: prefs, p_at: at })) as { prefs: Profile['prefs']; at: string },
  touch: async (tz: string) => { await supabase.rpc('touch_active', { p_tz: tz }); },
  requestDeletion: async () => check(await supabase.rpc('request_account_deletion')),
};

export const syncApi = {
  push: async (list: ProgressEvent[]) => {
    const rows = list.map(({ id, kind, occurred_at, local_date, xp, payload }) => ({ id, kind, occurred_at, local_date, xp, payload }));
    check(await supabase.from('progress_events').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }));
  },
  pull: async (userId: string, afterSeq: number) =>
    check(await supabase.from('progress_events').select('id, kind, occurred_at, local_date, xp, payload, seq').eq('user_id', userId).gt('seq', afterSeq).order('seq').limit(1000)) as ProgressEvent[],
  roadmap: async () => check(await supabase.from('roadmap_steps').select('step_key, status, started_on, done_on, notes, data, updated_at')) as RoadmapStep[],
  upsertRoadmap: async (s: RoadmapStep) =>
    check(await supabase.rpc('upsert_roadmap_step', { p_key: s.step_key, p_status: s.status, p_started: s.started_on, p_done: s.done_on, p_notes: s.notes, p_data: s.data, p_at: s.updated_at })),
  stats: async (row: Record<string, unknown>) => check(await supabase.from('user_stats').upsert(row, { onConflict: 'user_id' })),
  flag: async (item_type: string, item_id: string, note: string) => check(await supabase.from('flags').insert({ item_type, item_id, note })),
};

// ---------------------------------------------------------------- exam
export const examApi = {
  overview: async () => check(await supabase.rpc('my_exam_overview')) as ExamOverview,
  start: async (portion: 'national' | 'state') => check(await supabase.rpc('start_exam', { p_portion: portion })) as string,
  state: async (id: string) => check(await supabase.rpc('exam_state', { p_session: id })) as ExamState,
  save: async (id: string, q: string, a: number | null, marked: boolean, secs: number) =>
    check(await supabase.rpc('exam_save', { p_session: id, p_question: q, p_answer: a, p_marked: marked, p_seconds: secs })) as { ok: boolean; status?: string; deadline?: string; server_now?: string },
  submit: async (id: string) => check(await supabase.rpc('exam_submit', { p_session: id })) as { id: string; score_pct: number; passed: boolean },
  review: async (id: string) => check(await supabase.rpc('exam_review', { p_session: id })) as ExamReview,
};

export const leaderboardApi = {
  weekly: async () => check(await supabase.rpc('weekly_leaderboard')) as Array<{ name: string; xp: number; me: boolean }>,
};

// ---------------------------------------------------------------- admin & staff
export interface UserRow {
  id: string; name: string; email: string; role: Role; disabled: boolean; invited_at: string; joined_at: string | null;
  last_active_at: string | null; deletion_requested_at: string | null; streak: number; xp: number; units_completed: number;
  roadmap_step: string | null; last_study_date: string | null;
  national: { score: number; passed: boolean; at: string } | null; state: { score: number; passed: boolean; at: string } | null;
  unseen_national: number; unseen_state: number; ready: boolean;
}
export interface GateStatus { subtopics_total: number; subtopics_ready: number; national_forms: number; state_forms: number; forms_required: number; met: boolean }
export interface CoverageRow {
  id: string; title: string; topic_id: string; topic: string; portion: 'national' | 'state'; items: number; items_verified: boolean;
  cc_target: number; lp_target: number; cc_verified: number; cc_total: number; lp_verified: number; lp_total: number;
  exam_verified: number; exam_target: number; terms_verified: number; verify_note: string | null;
}
export interface QuestionStat {
  id: string; pool: 'lesson' | 'exam'; form: string | null; subtopic: string; type: string; status: string; version: number;
  prompt: string; options: string[]; correct: unknown; answered: number; pct_correct: number | null; choices: Record<string, number>; flags: number;
}
export interface FlagRow { id: string; user_id: string | null; item_type: 'question' | 'card' | 'term'; item_id: string; note: string; status: 'open' | 'resolved'; created_at: string }

async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* keep message */ }
    throw new ApiError(friendly({ message: msg }));
  }
  if ((data as { error?: string })?.error) throw new ApiError(friendly({ message: (data as { error: string }).error }));
  return data as T;
}

export const adminApi = {
  users: async () => check(await supabase.rpc('admin_overview')) as UserRow[],
  gate: async () => check(await supabase.rpc('launch_gate_status')) as GateStatus,
  invites: async () => check(await supabase.from('invites').select('*').order('created_at', { ascending: false })) as Array<{ email: string; role: Role; created_at: string; accepted_at: string | null }>,
  invite: (email: string, role: Role, name: string) => callFunction<{ ok: true }>('admin-users', { action: 'invite', email, role, name, redirectTo: `${location.origin}/set-password?mode=invite` }),
  deleteUser: (userId: string) => callFunction<{ ok: true }>('admin-users', { action: 'delete', userId }),
  setRole: async (userId: string, role: Role) => check(await supabase.rpc('set_user_role', { p_user: userId, p_role: role })),
  setAccess: async (userId: string, disabled: boolean) => check(await supabase.rpc('set_user_access', { p_user: userId, p_disabled: disabled })),
  userDetail: async (userId: string) => {
    const [profile, roadmap, sessions, stats] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single().then((r) => check(r) as Profile),
      supabase.from('roadmap_steps').select('*').eq('user_id', userId).then((r) => check(r) as RoadmapStep[]),
      supabase.from('exam_sessions').select('id, portion, started_at, submitted_at, score_pct, passed').eq('user_id', userId).order('started_at', { ascending: false }).then((r) => check(r) as Array<{ id: string; portion: string; started_at: string; submitted_at: string | null; score_pct: number | null; passed: boolean | null }>),
      supabase.from('user_stats').select('*').eq('user_id', userId).maybeSingle().then((r) => check(r) as Record<string, unknown> | null),
    ]);
    return { profile, roadmap, sessions, stats };
  },
};

export const staffApi = {
  allQuestions: async (pool?: 'lesson' | 'exam') => {
    const out: Question[] = [];
    for (let from = 0; ; from += 1000) {
      let q = supabase.from('questions').select('*').order('id').range(from, from + 999);
      if (pool) q = q.eq('pool', pool);
      const rows = check(await q) as Question[];
      out.push(...rows);
      if (rows.length < 1000) return out;
    }
  },
  allCards: async () => check(await supabase.from('concept_cards').select('*').order('id')) as Card[],
  allTerms: async () => check(await supabase.from('terms').select('*').order('term')) as Term[],
  saveQuestion: async (q: Partial<Question> & { id: string }, isNew: boolean) =>
    check(isNew ? await supabase.from('questions').insert(q).select('*').single() : await supabase.from('questions').update(q).eq('id', q.id).select('*').single()) as Question,
  saveCard: async (c: Partial<Card> & { id: string }, isNew: boolean) =>
    check(isNew ? await supabase.from('concept_cards').insert(c).select('*').single() : await supabase.from('concept_cards').update(c).eq('id', c.id).select('*').single()) as Card,
  saveTerm: async (t: Partial<Term> & { id: string }, isNew: boolean) =>
    check(isNew ? await supabase.from('terms').insert(t).select('*').single() : await supabase.from('terms').update(t).eq('id', t.id).select('*').single()) as Term,
  setStatus: async (table: 'questions' | 'concept_cards' | 'terms', id: string, status: 'verified' | 'rejected' | 'unverified', userId: string) =>
    check(await supabase.from(table).update({ status, reviewed_by: status === 'unverified' ? null : userId, reviewed_at: status === 'unverified' ? null : new Date().toISOString() }).eq('id', id)),
  remove: async (table: 'questions' | 'concept_cards' | 'terms', id: string) => check(await supabase.from(table).delete().eq('id', id)),
  flags: async () => check(await supabase.from('flags').select('*').order('created_at', { ascending: false })) as FlagRow[],
  resolveFlag: async (id: string, userId: string) => check(await supabase.from('flags').update({ status: 'resolved', resolved_by: userId, resolved_at: new Date().toISOString() }).eq('id', id)),
  versions: async (id: string) => check(await supabase.from('question_versions').select('*').eq('question_id', id).order('version', { ascending: false })) as Array<{ version: number; snapshot: Question; replaced_at: string }>,
  forms: async () => check(await supabase.from('exam_forms').select('*').order('id')) as ExamForm[],
  saveForm: async (f: Partial<ExamForm> & { id: string }, isNew: boolean) =>
    check(isNew ? await supabase.from('exam_forms').insert(f) : await supabase.from('exam_forms').update(f).eq('id', f.id)),
  deleteForm: async (id: string) => check(await supabase.from('exam_forms').delete().eq('id', id)),
  assignToForm: async (ids: string[], formId: string | null, pretest?: boolean) => {
    const patch: Record<string, unknown> = { exam_form_id: formId };
    if (pretest !== undefined) patch.is_pretest = pretest;
    check(await supabase.from('questions').update(patch).in('id', ids));
  },
  formCheck: async (id: string) => check(await supabase.rpc('form_check', { p_form: id })) as { complete: boolean; scored: number; pretest: number; unverified: number; topics: Array<{ topic: string; title: string; target: number; have: number }>; issues: string[] },
  analytics: async () => check(await supabase.rpc('question_analytics')) as QuestionStat[],
  coverage: async () => check(await supabase.rpc('coverage_report')) as CoverageRow[],
  saveVerify: async (key: string, patch: Partial<VerifyItem>) => check(await supabase.from('verify_items').update(patch).eq('key', key)),
  saveSettings: async (patch: Partial<AppSettings>) => check(await supabase.from('app_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', 1)),
  saveTopic: async (id: string, patch: Partial<Topic>) => check(await supabase.from('outline_topics').update(patch).eq('id', id)),
};
