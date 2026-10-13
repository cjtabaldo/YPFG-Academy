-- YPFG Academy: server functions (RPCs). Each one checks who is calling.

alter table public.profiles add column if not exists last_streak_email_on date;

-- ---------------------------------------------------------------------------
-- Exam forms and the launch gate
-- ---------------------------------------------------------------------------
create or replace function public.form_check_internal(p_form text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  f public.exam_forms;
  cfg public.exam_config;
  n_scored int; n_pretest int; n_unverified int; n_topic_sum int;
  issues text[] := '{}';
  topic_rows jsonb;
begin
  select * into f from public.exam_forms where id = p_form;
  if not found then return jsonb_build_object('complete', false, 'issues', jsonb_build_array('Form not found.')); end if;
  select * into cfg from public.exam_config where portion = f.portion;
  select count(*) filter (where not is_pretest), count(*) filter (where is_pretest),
         count(*) filter (where status <> 'verified')
    into n_scored, n_pretest, n_unverified
    from public.questions where exam_form_id = p_form;
  select coalesce(sum(items), 0) into n_topic_sum from public.outline_topics where portion = f.portion;

  select coalesce(jsonb_agg(jsonb_build_object(
           'topic', t.id, 'title', t.title, 'target', t.items,
           'have', (select count(*) from public.questions q
                    where q.exam_form_id = p_form and q.topic_id = t.id and not q.is_pretest))
           order by t.sort), '[]'::jsonb)
    into topic_rows
    from public.outline_topics t where t.portion = f.portion;

  if n_scored <> cfg.scored_items then
    issues := issues || format('Needs %s scored questions; has %s.', cfg.scored_items, n_scored);
  end if;
  if n_pretest < cfg.pretest_min or n_pretest > cfg.pretest_max then
    issues := issues || format('Needs %s–%s pretest questions; has %s.', cfg.pretest_min, cfg.pretest_max, n_pretest);
  end if;
  if n_unverified > 0 then
    issues := issues || format('%s question(s) on this form are not verified.', n_unverified);
  end if;
  if n_topic_sum = cfg.scored_items then
    if exists (select 1 from jsonb_array_elements(topic_rows) r where (r ->> 'have')::int <> (r ->> 'target')::int) then
      issues := issues || 'Topic counts do not match the official outline weighting.'::text;
    end if;
  end if;
  if f.status <> 'verified' then
    issues := issues || 'The form itself has not been verified.'::text;
  end if;

  return jsonb_build_object(
    'complete', coalesce(array_length(issues, 1), 0) = 0,
    'scored', n_scored, 'pretest', n_pretest, 'unverified', n_unverified,
    'topics', topic_rows, 'issues', to_jsonb(issues));
end $$;

create or replace function public.form_is_complete(p_form text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((public.form_check_internal(p_form) ->> 'complete')::boolean, false)
$$;

-- Form builder status (staff only).
create or replace function public.form_check(p_form text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'YPFG_FORBIDDEN'; end if;
  return public.form_check_internal(p_form);
end $$;

create or replace function public.launch_gate_status() returns jsonb
language sql stable security definer set search_path = public as $$
  with sub as (
    select s.id,
      (select count(*) from public.questions q
        where q.subtopic_id = s.id and q.pool = 'lesson' and q.status = 'verified') as lp,
      (select count(*) from public.concept_cards c
        where c.subtopic_id = s.id and c.status = 'verified') as cc
    from public.outline_subtopics s
  ), forms as (
    select portion, count(*) filter (where public.form_is_complete(id)) as n
    from public.exam_forms group by portion
  ), agg as (
    select
      (select count(*) from sub) as total,
      (select count(*) from sub where lp >= 10 and cc >= 2) as ready,
      coalesce((select n from forms where portion = 'national'), 0) as nat,
      coalesce((select n from forms where portion = 'state'), 0) as st
  )
  select jsonb_build_object(
    'subtopics_total', total,
    'subtopics_ready', ready,
    'national_forms', nat,
    'state_forms', st,
    'forms_required', 4,
    'met', total > 0 and ready = total and nat >= 4 and st >= 4)
  from agg
$$;

-- ---------------------------------------------------------------------------
-- Exam Day
-- ---------------------------------------------------------------------------
create or replace function public.exam_unlocked_for(p_user uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.units)
     and not exists (
       select 1 from public.units u
       where not exists (
         select 1 from public.progress_events e
         where e.user_id = p_user and e.kind = 'unit_complete' and e.payload ->> 'unit' = u.id))
$$;

create or replace function public.unseen_forms_for(p_user uuid, p_portion text) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.exam_forms f
  where f.portion = p_portion and public.form_is_complete(f.id)
    and not exists (select 1 from public.exam_sessions e where e.user_id = p_user and e.form_id = f.id)
$$;

create or replace function public.ready_status_for(p_user uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with ranked as (
    select portion, passed,
           row_number() over (partition by portion order by submitted_at desc) as rn
    from public.exam_sessions
    where user_id = p_user and submitted_at is not null
  ), c as (
    select
      (select count(*) from ranked where portion = 'national' and rn <= 2 and passed) as nat,
      (select count(*) from ranked where portion = 'state' and rn <= 2 and passed) as st
  )
  select jsonb_build_object('national_passes_in_a_row', nat, 'state_passes_in_a_row', st,
                            'ready', nat = 2 and st = 2)
  from c
$$;

-- Grades a session. Internal: callers use exam_submit() or exam_state().
create or replace function public.exam_finalize(p_session uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  s public.exam_sessions;
  cfg public.exam_config;
  total_q int;
  res jsonb;
begin
  select * into s from public.exam_sessions where id = p_session for update;
  if not found or s.submitted_at is not null then return; end if;
  select * into cfg from public.exam_config where portion = s.portion;
  total_q := coalesce(array_length(s.question_order, 1), 0);

  with items as (
    select q.id, q.topic_id, q.is_pretest, (q.correct #>> '{}')::int as correct_idx,
           case when s.answers -> q.id ->> 'a' is null then null
                else (s.option_orders -> q.id ->> ((s.answers -> q.id ->> 'a')::int))::int end as choice,
           coalesce((s.answers -> q.id ->> 't')::int, 0) as secs
    from public.questions q where q.id = any (s.question_order)
  ), graded as (
    select *, (choice is not null and choice = correct_idx) as ok from items
  ), scored as (select * from graded where not is_pretest),
  topics as (
    select t.id, t.title, t.sort,
           count(sc.id) as total, count(sc.id) filter (where sc.ok) as correct,
           coalesce(avg(sc.secs), 0) as avg_secs
    from public.outline_topics t join scored sc on sc.topic_id = t.id
    group by t.id, t.title, t.sort
  )
  select jsonb_build_object(
    'scored_correct', (select count(*) from scored where ok),
    'scored_total', (select count(*) from scored),
    'by_topic', (select coalesce(jsonb_agg(jsonb_build_object(
        'topic', id, 'title', title, 'correct', correct, 'total', total,
        'pct', round(100.0 * correct / nullif(total, 0), 1), 'avg_seconds', round(avg_secs, 1))
        order by sort), '[]'::jsonb) from topics),
    'pacing', jsonb_build_object(
        'total_seconds', (select coalesce(sum(secs), 0) from graded),
        'elapsed_seconds', round(extract(epoch from (least(now(), s.deadline) - s.started_at))),
        'avg_seconds', round((select coalesce(avg(secs), 0) from graded), 1),
        'budget_seconds', round(cfg.minutes * 60.0 / nullif(total_q, 0), 1),
        'slowest_topics', (select coalesce(jsonb_agg(title order by avg_secs desc), '[]'::jsonb)
                           from (select title, avg_secs from topics order by avg_secs desc limit 3) x)),
    'items', (select coalesce(jsonb_agg(jsonb_build_object(
        'q', id, 'choice', choice, 'ok', ok, 't', secs, 'pretest', is_pretest)), '[]'::jsonb) from graded)
  ) into res;

  update public.exam_sessions set
    submitted_at = least(now(), deadline),
    scored_correct = (res ->> 'scored_correct')::int,
    scored_total = (res ->> 'scored_total')::int,
    score_pct = round(100.0 * (res ->> 'scored_correct')::int / nullif((res ->> 'scored_total')::int, 0), 1),
    passed = (100.0 * (res ->> 'scored_correct')::int / nullif((res ->> 'scored_total')::int, 0)) >= cfg.pass_pct,
    results = res
  where id = p_session;
end $$;

-- Starts (or resumes) an Exam Day session on a form the caller has never seen.
create or replace function public.start_exam(p_portion text) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  cfg public.exam_config;
  s public.exam_sessions;
  v_form text;
  v_order text[];
  v_opts jsonb := '{}'::jsonb;
  q record;
  v_id uuid;
begin
  if not public.is_active_user() then raise exception 'YPFG_FORBIDDEN: Sign in to start Exam Day.'; end if;
  if p_portion not in ('national', 'state') then raise exception 'YPFG_BAD_INPUT'; end if;

  select * into s from public.exam_sessions
   where user_id = auth.uid() and portion = p_portion and submitted_at is null;
  if found then
    if s.deadline > now() then return s.id; end if;
    perform public.exam_finalize(s.id);
  end if;

  if not public.exam_unlocked_for(auth.uid()) then
    raise exception 'YPFG_EXAM_LOCKED: Finish every unit once to unlock Exam Day.';
  end if;

  select * into cfg from public.exam_config where portion = p_portion;
  select f.id into v_form from public.exam_forms f
   where f.portion = p_portion and public.form_is_complete(f.id)
     and not exists (select 1 from public.exam_sessions e where e.user_id = auth.uid() and e.form_id = f.id)
   order by random() limit 1;
  if v_form is null then
    raise exception 'YPFG_NO_UNSEEN_FORMS: You have taken every available form for this portion.';
  end if;

  select array_agg(id order by random()) into v_order from public.questions where exam_form_id = v_form;
  for q in select id, jsonb_array_length(options) as n from public.questions where exam_form_id = v_form loop
    v_opts := v_opts || jsonb_build_object(q.id,
      (select jsonb_agg(i order by random()) from generate_series(0, q.n - 1) i));
  end loop;

  insert into public.exam_sessions (user_id, form_id, portion, deadline, question_order, option_orders)
  values (auth.uid(), v_form, p_portion, now() + make_interval(mins => cfg.minutes), v_order, v_opts)
  returning id into v_id;
  return v_id;
end $$;

-- The only way to read Exam Pool questions as a student: your own active
-- session, in its shuffled order, with no answers, no topics, and no
-- pretest markers.
create or replace function public.exam_state(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.exam_sessions;
begin
  select * into s from public.exam_sessions where id = p_session and user_id = auth.uid();
  if not found then raise exception 'YPFG_NOT_FOUND'; end if;
  if s.submitted_at is null and s.deadline <= now() then
    perform public.exam_finalize(s.id);
    select * into s from public.exam_sessions where id = p_session;
  end if;
  if s.submitted_at is not null then
    return jsonb_build_object('id', s.id, 'status', 'submitted', 'portion', s.portion);
  end if;
  return jsonb_build_object(
    'id', s.id, 'status', 'active', 'portion', s.portion,
    'started_at', s.started_at, 'deadline', s.deadline, 'server_now', now(),
    'answers', s.answers,
    'questions', (
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'prompt', q.prompt,
        'options', (select jsonb_agg(q.options -> (o.v::int) order by o.ord)
                    from jsonb_array_elements_text(s.option_orders -> q.id) with ordinality as o(v, ord)))
        order by array_position(s.question_order, q.id))
      from public.questions q where q.id = any (s.question_order)));
end $$;

create or replace function public.exam_save(p_session uuid, p_question text, p_answer int, p_marked boolean, p_seconds int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.exam_sessions;
begin
  select * into s from public.exam_sessions where id = p_session and user_id = auth.uid() for update;
  if not found then raise exception 'YPFG_NOT_FOUND'; end if;
  if s.submitted_at is not null or s.deadline <= now() then
    return jsonb_build_object('ok', false, 'status', 'closed');
  end if;
  if not (p_question = any (s.question_order)) then raise exception 'YPFG_BAD_INPUT'; end if;
  if p_answer is not null and (p_answer < 0 or p_answer >= jsonb_array_length(s.option_orders -> p_question)) then
    raise exception 'YPFG_BAD_INPUT';
  end if;
  update public.exam_sessions set answers = answers || jsonb_build_object(p_question, jsonb_build_object(
      'a', p_answer, 'm', coalesce(p_marked, false),
      't', coalesce((answers -> p_question ->> 't')::int, 0) + least(greatest(coalesce(p_seconds, 0), 0), 900)))
  where id = p_session;
  return jsonb_build_object('ok', true, 'deadline', s.deadline, 'server_now', now());
end $$;

create or replace function public.exam_submit(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.exam_sessions where id = p_session and user_id = auth.uid()) then
    raise exception 'YPFG_NOT_FOUND';
  end if;
  perform public.exam_finalize(p_session);
  return (select jsonb_build_object('id', id, 'portion', portion, 'score_pct', score_pct, 'passed', passed)
          from public.exam_sessions where id = p_session);
end $$;

-- Results and full review for a submitted session (owner or Admin only).
create or replace function public.exam_review(p_session uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare s public.exam_sessions;
begin
  select * into s from public.exam_sessions where id = p_session;
  if not found or (s.user_id <> auth.uid() and not public.is_admin()) then raise exception 'YPFG_NOT_FOUND'; end if;
  if s.submitted_at is null then raise exception 'YPFG_EXAM_ACTIVE: Submit the exam to see the review.'; end if;
  return jsonb_build_object(
    'id', s.id, 'portion', s.portion, 'form_id', s.form_id, 'started_at', s.started_at,
    'submitted_at', s.submitted_at, 'score_pct', s.score_pct, 'passed', s.passed,
    'scored_correct', s.scored_correct, 'scored_total', s.scored_total,
    'pass_pct', (select pass_pct from public.exam_config where portion = s.portion),
    'results', s.results - 'items',
    'items', (
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'prompt', q.prompt, 'options', q.options, 'correct', q.correct,
        'explanation', q.explanation, 'wrong_explanations', q.wrong_explanations,
        'memory_hook', q.memory_hook, 'citation', q.citation, 'topic_id', q.topic_id,
        'subtopic_id', q.subtopic_id, 'pretest', q.is_pretest,
        'choice', (it ->> 'choice')::int, 'ok', (it ->> 'ok')::boolean, 'seconds', (it ->> 't')::int)
        order by array_position(s.question_order, q.id))
      from public.questions q
      join lateral (select x as it from jsonb_array_elements(s.results -> 'items') x
                    where x ->> 'q' = q.id limit 1) j on true
      where q.id = any (s.question_order)));
end $$;

create or replace function public.my_exam_overview() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'unlocked', public.exam_unlocked_for(auth.uid()),
    'unseen_national', public.unseen_forms_for(auth.uid(), 'national'),
    'unseen_state', public.unseen_forms_for(auth.uid(), 'state'),
    'ready', public.ready_status_for(auth.uid()),
    'config', (select jsonb_object_agg(portion, to_jsonb(c) - 'portion') from public.exam_config c),
    'sessions', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'portion', portion, 'started_at', started_at, 'deadline', deadline,
        'submitted_at', submitted_at, 'score_pct', score_pct, 'passed', passed,
        'by_topic', results -> 'by_topic') order by started_at desc), '[]'::jsonb)
      from public.exam_sessions where user_id = auth.uid()))
  where public.is_active_user()
$$;

-- ---------------------------------------------------------------------------
-- Profile, roadmap, activity
-- ---------------------------------------------------------------------------
create or replace function public.touch_active(p_tz text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform now() at time zone p_tz; -- raises if the time zone name is invalid
  update public.profiles
     set last_active_at = now(), joined_at = coalesce(joined_at, now()), timezone = p_tz
   where id = auth.uid();
end $$;

create or replace function public.merge_prefs(p_prefs jsonb, p_at timestamptz) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  update public.profiles set prefs = p_prefs, prefs_updated_at = p_at
   where id = auth.uid() and p_at > prefs_updated_at;
  select jsonb_build_object('prefs', prefs, 'at', prefs_updated_at) into r from public.profiles where id = auth.uid();
  return r;
end $$;

-- Last write wins per Roadmap step.
create or replace function public.upsert_roadmap_step(
  p_key text, p_status text, p_started date, p_done date, p_notes text, p_data jsonb, p_at timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_active_user() then raise exception 'YPFG_FORBIDDEN'; end if;
  insert into public.roadmap_steps (user_id, step_key, status, started_on, done_on, notes, data, updated_at)
  values (auth.uid(), p_key, p_status, p_started, p_done, coalesce(p_notes, ''), coalesce(p_data, '{}'), p_at)
  on conflict (user_id, step_key) do update set
    status = excluded.status, started_on = excluded.started_on, done_on = excluded.done_on,
    notes = excluded.notes, data = excluded.data, updated_at = excluded.updated_at
  where public.roadmap_steps.updated_at < excluded.updated_at;
end $$;

create or replace function public.request_account_deletion() returns void
language sql security definer set search_path = public as $$
  update public.profiles set deletion_requested_at = now() where id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Leaderboard (opt-in): weekly XP only. Never exam scores or Roadmap details.
-- ---------------------------------------------------------------------------
create or replace function public.weekly_leaderboard() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me public.profiles; wk timestamptz;
begin
  select * into me from public.profiles where id = auth.uid() and not disabled;
  if not found or not me.leaderboard_opt_in then return '[]'::jsonb; end if;
  wk := date_trunc('week', now() at time zone me.timezone) at time zone me.timezone;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('name', name, 'xp', xp, 'me', is_me) order by xp desc, name), '[]'::jsonb)
    from (
      select coalesce(nullif(p.leaderboard_name, ''), split_part(p.full_name, ' ', 1), 'Student') as name,
             coalesce((select sum(e.xp) from public.progress_events e
                       where e.user_id = p.id and e.occurred_at >= wk), 0)::int as xp,
             p.id = me.id as is_me
      from public.profiles p where p.leaderboard_opt_in and not p.disabled
    ) r);
end $$;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'YPFG_FORBIDDEN'; end if;
  return (
    select coalesce(jsonb_agg(row order by row ->> 'name'), '[]'::jsonb) from (
      select jsonb_build_object(
        'id', p.id, 'name', p.full_name, 'email', p.email, 'role', p.role, 'disabled', p.disabled,
        'invited_at', p.created_at, 'joined_at', p.joined_at, 'last_active_at', p.last_active_at,
        'deletion_requested_at', p.deletion_requested_at,
        'streak', coalesce(st.streak, 0), 'xp', coalesce(st.xp_total, 0),
        'units_completed', coalesce(st.units_completed, 0), 'roadmap_step', st.roadmap_step,
        'last_study_date', st.last_study_date,
        'national', (select jsonb_build_object('score', score_pct, 'passed', passed, 'at', submitted_at)
                     from public.exam_sessions where user_id = p.id and portion = 'national' and submitted_at is not null
                     order by submitted_at desc limit 1),
        'state', (select jsonb_build_object('score', score_pct, 'passed', passed, 'at', submitted_at)
                  from public.exam_sessions where user_id = p.id and portion = 'state' and submitted_at is not null
                  order by submitted_at desc limit 1),
        'unseen_national', public.unseen_forms_for(p.id, 'national'),
        'unseen_state', public.unseen_forms_for(p.id, 'state'),
        'ready', (public.ready_status_for(p.id) ->> 'ready')::boolean) as row
      from public.profiles p left join public.user_stats st on st.user_id = p.id
    ) x);
end $$;

create or replace function public.set_user_role(p_user uuid, p_role public.user_role) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'YPFG_FORBIDDEN'; end if;
  if p_role <> 'admin' and (select role from public.profiles where id = p_user) = 'admin'
     and (select count(*) from public.profiles where role = 'admin' and not disabled) <= 1 then
    raise exception 'YPFG_LAST_ADMIN: There must always be at least one Admin.';
  end if;
  update public.profiles set role = p_role where id = p_user;
  update public.invites set role = p_role where email = (select email from public.profiles where id = p_user);
end $$;

create or replace function public.set_user_access(p_user uuid, p_disabled boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'YPFG_FORBIDDEN'; end if;
  if p_user = auth.uid() then raise exception 'YPFG_SELF: You cannot remove your own access.'; end if;
  update public.profiles set disabled = p_disabled where id = p_user;
end $$;

-- ---------------------------------------------------------------------------
-- Content analytics and coverage (Admin and Reviewer)
-- ---------------------------------------------------------------------------
create or replace function public.question_analytics() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'YPFG_FORBIDDEN'; end if;
  return (
    with lesson as (
      select e.payload ->> 'q' as q, (e.payload ->> 'v')::int as v,
             (e.payload ->> 'c')::boolean as ok, e.payload ->> 'ch' as ch
      from public.progress_events e where e.kind = 'answer'
    ), exam as (
      select it ->> 'q' as q, (it ->> 'ok')::boolean as ok, it ->> 'choice' as ch
      from public.exam_sessions s, jsonb_array_elements(s.results -> 'items') it
      where s.submitted_at is not null and s.submitted_at >= coalesce(
        (select max(replaced_at) from public.question_versions qv where qv.question_id = it ->> 'q'), '-infinity')
    ), answers as (
      select l.q, l.ok, l.ch from lesson l join public.questions qq on qq.id = l.q and qq.version = l.v
      union all select q, ok, ch from exam
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', q.id, 'pool', q.pool, 'form', q.exam_form_id, 'subtopic', q.subtopic_id, 'type', q.exercise_type,
      'status', q.status, 'version', q.version, 'prompt', left(q.prompt, 160), 'options', q.options,
      'correct', q.correct,
      'answered', (select count(*) from answers a where a.q = q.id),
      'pct_correct', (select round(100.0 * count(*) filter (where a.ok) / nullif(count(*), 0), 1) from answers a where a.q = q.id),
      'choices', (select coalesce(jsonb_object_agg(ch, n), '{}'::jsonb)
                  from (select a.ch, count(*) as n from answers a where a.q = q.id and a.ch is not null group by a.ch) c),
      'flags', (select count(*) from public.flags f where f.item_type = 'question' and f.item_id = q.id)
    )), '[]'::jsonb)
    from public.questions q);
end $$;

create or replace function public.coverage_report() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare forms int;
begin
  if not public.is_staff() then raise exception 'YPFG_FORBIDDEN'; end if;
  select planned_forms_per_portion into forms from public.app_settings where id = 1;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'title', s.title, 'topic_id', t.id, 'topic', t.title, 'portion', t.portion,
      'items', t.items, 'items_verified', t.items_verified,
      'cc_target', s.cc_target, 'lp_target', s.lp_target,
      'cc_verified', (select count(*) from public.concept_cards c where c.subtopic_id = s.id and c.status = 'verified'),
      'cc_total', (select count(*) from public.concept_cards c where c.subtopic_id = s.id and c.status <> 'rejected'),
      'lp_verified', (select count(*) from public.questions q where q.subtopic_id = s.id and q.pool = 'lesson' and q.status = 'verified'),
      'lp_total', (select count(*) from public.questions q where q.subtopic_id = s.id and q.pool = 'lesson' and q.status <> 'rejected'),
      'exam_verified', (select count(*) from public.questions q where q.subtopic_id = s.id and q.pool = 'exam' and q.status = 'verified' and not q.is_pretest),
      'exam_target', ceil(t.items::numeric * forms / greatest((select count(*) from public.outline_subtopics x where x.topic_id = t.id), 1)),
      'terms_verified', (select count(*) from public.terms m where m.subtopic_id = s.id and m.status = 'verified'),
      'verify_note', s.verify_note
    ) order by t.sort, s.sort), '[]'::jsonb)
    from public.outline_subtopics s join public.outline_topics t on t.id = s.topic_id);
end $$;

-- ---------------------------------------------------------------------------
-- Streak-saver email (called only by the scheduled server function)
-- ---------------------------------------------------------------------------
create or replace function public.streak_saver_due() returns setof jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', p.id, 'email', p.email, 'name', p.full_name,
                            'streak', st.streak, 'token', p.unsubscribe_token)
  from public.profiles p join public.user_stats st on st.user_id = p.id
  cross join public.app_settings a
  where public.is_backend()
    and p.streak_email_opt_in and not p.disabled
    and st.streak >= 3
    and extract(hour from now() at time zone p.timezone) = a.streak_email_local_hour
    and coalesce(st.last_study_date, '-infinity') < (now() at time zone p.timezone)::date
    and coalesce(p.last_streak_email_on, '-infinity') < (now() at time zone p.timezone)::date
$$;

create or replace function public.mark_streak_email_sent(p_user uuid) returns void
language sql security definer set search_path = public as $$
  update public.profiles set last_streak_email_on = (now() at time zone timezone)::date
  where id = p_user and public.is_backend()
$$;

create or replace function public.unsubscribe_streak_email(p_token uuid) returns boolean
language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set streak_email_opt_in = false where unsubscribe_token = p_token;
  return found;
end $$;

-- ---------------------------------------------------------------------------
-- Function permissions: nothing for anonymous visitors; internals for the
-- server only.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;

revoke execute on function public.exam_finalize(uuid) from authenticated;
revoke execute on function public.form_check_internal(text) from authenticated;
revoke execute on function public.form_is_complete(text) from authenticated;
revoke execute on function public.exam_unlocked_for(uuid) from authenticated;
revoke execute on function public.unseen_forms_for(uuid, text) from authenticated;
revoke execute on function public.ready_status_for(uuid) from authenticated;
revoke execute on function public.streak_saver_due() from authenticated;
revoke execute on function public.mark_streak_email_sent(uuid) from authenticated;
revoke execute on function public.unsubscribe_streak_email(uuid) from authenticated;
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.guard_invite() from authenticated;

grant execute on function
  public.my_role(), public.is_staff(), public.is_admin(), public.is_active_user(), public.is_backend(),
  public.form_check(text), public.launch_gate_status(),
  public.start_exam(text), public.exam_state(uuid), public.exam_save(uuid, text, int, boolean, int),
  public.exam_submit(uuid), public.exam_review(uuid), public.my_exam_overview(),
  public.touch_active(text), public.merge_prefs(jsonb, timestamptz),
  public.upsert_roadmap_step(text, text, date, date, text, jsonb, timestamptz),
  public.request_account_deletion(), public.weekly_leaderboard(), public.admin_overview(),
  public.set_user_role(uuid, public.user_role), public.set_user_access(uuid, boolean),
  public.question_analytics(), public.coverage_report()
to authenticated;

grant execute on all functions in schema public to service_role;
