-- YPFG Academy: core schema.
-- Every access rule is enforced here with Row Level Security (RLS) and
-- SECURITY DEFINER functions that check the caller. The app's interface only
-- mirrors these rules; it never relies on hiding things.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('admin', 'reviewer', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.review_status as enum ('unverified', 'verified', 'rejected');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Settings
-- ---------------------------------------------------------------------------
create table if not exists public.app_settings (
  id int primary key default 1 check (id = 1),
  outline_version text not null default 'Content Outlines 01/15/2025 (#092901) [verify]',
  outline_checked_at date not null default current_date,
  streak_email_local_hour int not null default 19 check (streak_email_local_hour between 0 and 23),
  planned_forms_per_portion int not null default 6 check (planned_forms_per_portion between 4 and 20),
  updated_at timestamptz not null default now()
);
insert into public.app_settings (id) values (1) on conflict do nothing;

create table if not exists public.exam_config (
  portion text primary key check (portion in ('national', 'state')),
  scored_items int not null,
  pretest_min int not null,
  pretest_max int not null,
  minutes int not null,
  pass_pct numeric not null default 75
);
insert into public.exam_config values
  ('national', 80, 5, 5, 150, 75),
  ('state', 40, 5, 10, 90, 75)
on conflict (portion) do nothing;

-- ---------------------------------------------------------------------------
-- People
-- ---------------------------------------------------------------------------
create table if not exists public.invites (
  email text primary key check (email = lower(email)),
  role public.user_role not null default 'student',
  invited_by uuid,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role public.user_role not null default 'student',
  disabled boolean not null default false,
  created_at timestamptz not null default now(),
  joined_at timestamptz,
  last_active_at timestamptz,
  timezone text not null default 'America/Los_Angeles',
  onboarded_at timestamptz,
  disclaimer_ack_at timestamptz,
  daily_goal int not null default 20 check (daily_goal in (10, 20, 30, 50)),
  reminder_time time not null default '19:00',
  target_exam_date date,
  plan_start_date date,
  school_name text,
  broker_name text,
  leaderboard_opt_in boolean not null default false,
  leaderboard_name text,
  streak_email_opt_in boolean not null default false,
  unsubscribe_token uuid not null default gen_random_uuid(),
  deletion_requested_at timestamptz,
  prefs jsonb not null default '{}'::jsonb,
  prefs_updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Role helpers (SECURITY DEFINER so policies can read roles without recursion)
-- ---------------------------------------------------------------------------
create or replace function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and not disabled
$$;

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() in ('admin', 'reviewer'), false)
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.my_role() = 'admin', false)
$$;

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() is not null
$$;

-- True when running as the database owner or the service role (server-side code).
-- (The service role key, or a direct database session such as the SQL editor.
-- Signed-in app users always arrive through the API as 'authenticator'.)
create or replace function public.is_backend() returns boolean
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
      or (nullif(current_setting('request.jwt.claims', true), '') is null and session_user <> 'authenticator')
$$;

-- ---------------------------------------------------------------------------
-- Coverage map and path
-- ---------------------------------------------------------------------------
create table if not exists public.outline_topics (
  id text primary key,
  portion text not null check (portion in ('national', 'state')),
  title text not null,
  items int not null default 0,
  items_verified boolean not null default false,
  course text not null check (course in ('PRIN', 'LAW', 'CON', 'AGY')),
  sort int not null default 0
);

create table if not exists public.outline_subtopics (
  id text primary key,
  topic_id text not null references public.outline_topics (id) on delete cascade,
  title text not null,
  sort int not null default 0,
  cc_target int not null default 2,
  lp_target int not null default 10,
  verify_note text
);

create table if not exists public.units (
  id text primary key,
  portion text not null check (portion in ('national', 'state')),
  title text not null,
  course text not null check (course in ('PRIN', 'LAW', 'CON', 'AGY')),
  topic_ids text[] not null default '{}',
  sort int not null default 0
);

create table if not exists public.lessons (
  id text primary key,
  unit_id text not null references public.units (id) on delete cascade,
  title text not null,
  kind text not null default 'lesson' check (kind in ('lesson', 'review')),
  subtopic_ids text[] not null default '{}',
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- Content: terms, Concept Cards, questions, exam forms
-- ---------------------------------------------------------------------------
create table if not exists public.terms (
  id text primary key,
  term text not null,
  definition text not null,
  subtopic_id text not null references public.outline_subtopics (id),
  citation text,
  outline_version text not null,
  status public.review_status not null default 'unverified',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.concept_cards (
  id text primary key,
  subtopic_id text not null references public.outline_subtopics (id),
  title text not null,
  body text not null,
  example text not null,
  memory_hook text not null,
  term_ids text[] not null default '{}',
  citation text,
  outline_version text not null,
  status public.review_status not null default 'unverified',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  version int not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_forms (
  id text primary key,
  portion text not null check (portion in ('national', 'state')),
  name text not null,
  status public.review_status not null default 'unverified',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.questions (
  id text primary key,
  pool text not null check (pool in ('lesson', 'exam')),
  exam_form_id text references public.exam_forms (id) on delete set null,
  is_pretest boolean not null default false,
  portion text not null check (portion in ('national', 'state')),
  topic_id text not null references public.outline_topics (id),
  subtopic_id text not null references public.outline_subtopics (id),
  outline_version text not null,
  course text not null check (course in ('PRIN', 'LAW', 'CON', 'AGY')),
  exercise_type text not null check (exercise_type in ('mcq', 'tf', 'number', 'order', 'scenario')),
  difficulty int not null default 2 check (difficulty between 1 and 3),
  level text not null check (level in ('recall', 'application', 'calculation')),
  prompt text not null,
  options jsonb not null default '[]'::jsonb,
  correct jsonb not null,
  explanation text not null,
  wrong_explanations jsonb not null default '[]'::jsonb,
  memory_hook text not null default '',
  formula text,
  worked_steps jsonb not null default '[]'::jsonb,
  citation text,
  fact_key text not null,
  status public.review_status not null default 'unverified',
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint questions_fact_key_unique unique (fact_key),
  constraint questions_pool_shape check (
    pool = 'exam' or (exam_form_id is null and not is_pretest)
  ),
  constraint questions_exam_type check (
    pool = 'lesson' or exercise_type in ('mcq', 'scenario')
  )
);
create index if not exists questions_subtopic_idx on public.questions (subtopic_id, pool, status);
create index if not exists questions_form_idx on public.questions (exam_form_id);

create table if not exists public.question_versions (
  question_id text not null references public.questions (id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  replaced_at timestamptz not null default now(),
  replaced_by uuid,
  primary key (question_id, version)
);

create table if not exists public.verify_items (
  key text primary key,
  category text not null default 'roadmap',
  label text not null,
  value text,
  note text,
  source_url text,
  verified_by uuid references public.profiles (id) on delete set null,
  verified_at timestamptz,
  sort int not null default 0
);

-- ---------------------------------------------------------------------------
-- Per-user data
-- ---------------------------------------------------------------------------
-- Append-only event log. Each event has a client-generated id, so the same
-- event arriving from two devices (or twice from one) is stored once. XP and
-- completions are sums over events, so devices add up and never overwrite.
create table if not exists public.progress_events (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'answer', 'lesson_complete', 'unit_complete', 'practice_complete', 'placement',
    'heart_lost', 'hearts_refilled', 'card_seen', 'term_seen', 'hours_logged', 'freeze_used'
  )),
  occurred_at timestamptz not null,
  local_date date not null,
  xp int not null default 0 check (xp between 0 and 60),
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default now(),
  seq bigserial
);
create index if not exists progress_events_user_seq on public.progress_events (user_id, seq);
create index if not exists progress_events_answers on public.progress_events ((payload ->> 'q')) where kind = 'answer';

create table if not exists public.roadmap_steps (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  step_key text not null,
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'done', 'failed')),
  started_on date,
  done_on date,
  notes text not null default '',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, step_key)
);

-- Snapshot the app writes after each sync, used for the Admin dashboard and the
-- streak-saver email. Readiness is never taken from here; it is computed from
-- exam sessions on the server.
create table if not exists public.user_stats (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  xp_total int not null default 0,
  streak int not null default 0,
  longest_streak int not null default 0,
  last_study_date date,
  units_completed int not null default 0,
  lessons_completed int not null default 0,
  roadmap_step text,
  accuracy numeric,
  updated_at timestamptz not null default now()
);

create table if not exists public.flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid default auth.uid() references public.profiles (id) on delete cascade,
  item_type text not null check (item_type in ('question', 'card', 'term')),
  item_id text not null,
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz
);

create table if not exists public.exam_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  form_id text not null references public.exam_forms (id),
  portion text not null check (portion in ('national', 'state')),
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  submitted_at timestamptz,
  question_order text[] not null,
  option_orders jsonb not null default '{}'::jsonb,
  answers jsonb not null default '{}'::jsonb,
  scored_correct int,
  scored_total int,
  score_pct numeric,
  passed boolean,
  results jsonb
);
create index if not exists exam_sessions_user on public.exam_sessions (user_id, portion, started_at);
create unique index if not exists exam_sessions_one_active
  on public.exam_sessions (user_id, portion) where submitted_at is null;
