-- YPFG Academy: access rules (RLS), protective triggers, invite-only sign-up.

create unique index if not exists exam_sessions_user_form on public.exam_sessions (user_id, form_id);

-- ---------------------------------------------------------------------------
-- Invite-only accounts: an auth user can only be created for an invited email.
-- This runs inside the database, so it holds even if public sign-up were
-- switched on by mistake.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv public.invites;
begin
  select * into inv from public.invites where email = lower(new.email);
  if not found then
    raise exception 'YPFG_NOT_INVITED: This email has not been invited to YPFG Academy.';
  end if;
  insert into public.profiles (id, email, role, full_name)
  values (new.id, lower(new.email), inv.role, coalesce(new.raw_user_meta_data ->> 'full_name', ''));
  update public.invites set accepted_at = coalesce(accepted_at, now()) where email = inv.email;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Students can only be invited once the launch gate is met. Reviewers and
-- admins can be invited any time (a Reviewer is needed to verify content
-- before launch).
create or replace function public.guard_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.email := lower(trim(new.email));
  if new.role = 'student' and not (public.launch_gate_status() ->> 'met')::boolean then
    raise exception 'YPFG_GATE_CLOSED: Student invites open when the launch gate is met.';
  end if;
  if not public.is_backend() and not public.is_admin() then
    raise exception 'YPFG_FORBIDDEN: Only an Admin can invite people.';
  end if;
  return new;
end $$;

drop trigger if exists guard_invite on public.invites;
create trigger guard_invite before insert or update of role, email on public.invites
  for each row execute function public.guard_invite();

-- Users may edit their own profile, but never their role, status, email or tokens.
create or replace function public.protect_profile() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_backend() then return new; end if;
  if not public.is_admin() then
    new.role := old.role;
    new.disabled := old.disabled;
    new.email := old.email;
    new.unsubscribe_token := old.unsubscribe_token;
    new.created_at := old.created_at;
  end if;
  if new.id <> old.id then raise exception 'YPFG_FORBIDDEN'; end if;
  return new;
end $$;

drop trigger if exists protect_profile on public.profiles;
create trigger protect_profile before update on public.profiles
  for each row execute function public.protect_profile();

-- ---------------------------------------------------------------------------
-- Question versioning: editing the content of a question snapshots the old
-- version, bumps the version number (which resets its stats, because stats are
-- counted per version), and sends it back to review unless the same save also
-- verifies it. A question's pool can never change.
-- ---------------------------------------------------------------------------
create or replace function public.version_question() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.pool <> old.pool then
    raise exception 'YPFG_POOL_LOCKED: A question cannot move between the Lesson Pool and the Exam Pool.';
  end if;
  if (new.prompt, new.options, new.correct, new.explanation, new.wrong_explanations,
      new.memory_hook, new.formula, new.worked_steps, new.exercise_type, new.subtopic_id, new.citation)
     is distinct from
     (old.prompt, old.options, old.correct, old.explanation, old.wrong_explanations,
      old.memory_hook, old.formula, old.worked_steps, old.exercise_type, old.subtopic_id, old.citation) then
    insert into public.question_versions (question_id, version, snapshot, replaced_by)
    values (old.id, old.version, to_jsonb(old), auth.uid())
    on conflict do nothing;
    new.version := old.version + 1;
    if new.status = old.status then
      new.status := 'unverified';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists version_question on public.questions;
create trigger version_question before update on public.questions
  for each row execute function public.version_question();

create or replace function public.version_content() returns trigger
language plpgsql as $$
begin
  if to_jsonb(new) - array['status', 'reviewed_by', 'reviewed_at', 'version', 'updated_at']
     is distinct from to_jsonb(old) - array['status', 'reviewed_by', 'reviewed_at', 'version', 'updated_at'] then
    new.version := old.version + 1;
    if new.status = old.status then
      new.status := 'unverified';
      new.reviewed_by := null;
      new.reviewed_at := null;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists version_card on public.concept_cards;
create trigger version_card before update on public.concept_cards
  for each row execute function public.version_content();
drop trigger if exists version_term on public.terms;
create trigger version_term before update on public.terms
  for each row execute function public.version_content();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.app_settings enable row level security;
alter table public.exam_config enable row level security;
alter table public.invites enable row level security;
alter table public.profiles enable row level security;
alter table public.outline_topics enable row level security;
alter table public.outline_subtopics enable row level security;
alter table public.units enable row level security;
alter table public.lessons enable row level security;
alter table public.terms enable row level security;
alter table public.concept_cards enable row level security;
alter table public.exam_forms enable row level security;
alter table public.questions enable row level security;
alter table public.question_versions enable row level security;
alter table public.verify_items enable row level security;
alter table public.progress_events enable row level security;
alter table public.roadmap_steps enable row level security;
alter table public.user_stats enable row level security;
alter table public.flags enable row level security;
alter table public.exam_sessions enable row level security;

-- Policies are recreated from scratch so this file can be re-run safely.
do $$ declare r record; begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Settings and structure: any active signed-in user reads; staff or admin write.
create policy settings_read on public.app_settings for select to authenticated using (public.is_active_user());
create policy settings_write on public.app_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy exam_config_read on public.exam_config for select to authenticated using (public.is_active_user());
create policy exam_config_write on public.exam_config for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy topics_read on public.outline_topics for select to authenticated using (public.is_active_user());
create policy topics_write on public.outline_topics for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy subtopics_read on public.outline_subtopics for select to authenticated using (public.is_active_user());
create policy subtopics_write on public.outline_subtopics for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy units_read on public.units for select to authenticated using (public.is_active_user());
create policy units_write on public.units for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy lessons_read on public.lessons for select to authenticated using (public.is_active_user());
create policy lessons_write on public.lessons for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy verify_read on public.verify_items for select to authenticated using (public.is_active_user());
create policy verify_write on public.verify_items for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Content: students see verified items only; staff see everything.
create policy terms_read on public.terms for select to authenticated
  using (public.is_staff() or (status = 'verified' and public.is_active_user()));
create policy terms_write on public.terms for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy cards_read on public.concept_cards for select to authenticated
  using (public.is_staff() or (status = 'verified' and public.is_active_user()));
create policy cards_write on public.concept_cards for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Exam Pool questions are never readable by students through any table.
-- During Exam Day they are served one session at a time by exam_state(),
-- without answers; after submission exam_review() returns that form only.
create policy questions_read on public.questions for select to authenticated
  using (public.is_staff() or (pool = 'lesson' and status = 'verified' and public.is_active_user()));
create policy questions_write on public.questions for all to authenticated using (public.is_staff()) with check (public.is_staff());
create policy question_versions_read on public.question_versions for select to authenticated using (public.is_staff());

create policy forms_staff on public.exam_forms for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- People
create policy invites_admin on public.invites for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Own data only (admin may read for the dashboard). No updates or deletes
-- on events: the log is append-only.
create policy events_read on public.progress_events for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy events_insert on public.progress_events for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user() and occurred_at <= now() + interval '1 day');

create policy roadmap_own on public.roadmap_steps for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_user());
create policy roadmap_admin_read on public.roadmap_steps for select to authenticated using (public.is_admin());

create policy stats_own on public.user_stats for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_active_user());
create policy stats_admin_read on public.user_stats for select to authenticated using (public.is_admin());

create policy flags_insert on public.flags for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());
create policy flags_read on public.flags for select to authenticated
  using (user_id = auth.uid() or public.is_staff());
create policy flags_update on public.flags for update to authenticated
  using (public.is_staff()) with check (public.is_staff());
create policy flags_delete on public.flags for delete to authenticated using (public.is_staff());

-- Exam sessions: read your own summary rows. All writes go through functions.
create policy sessions_read on public.exam_sessions for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- Column-level guard: even your own exam session row never exposes the
-- question order or option shuffle through the table API.
revoke select on public.exam_sessions from anon, authenticated;
grant select (id, user_id, form_id, portion, started_at, deadline, submitted_at,
              scored_correct, scored_total, score_pct, passed)
  on public.exam_sessions to authenticated;

-- Nothing is readable without signing in.
revoke all on all tables in schema public from anon;
