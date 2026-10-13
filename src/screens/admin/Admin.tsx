// Admin and Reviewer tools. Every action here is also enforced by the
// database: hiding a button is never the only protection.
import { useEffect, useMemo, useState } from 'react';
import { OUTLINE_REMINDER_DAYS } from '../../config/app';
import { adminApi, friendly, staffApi, type GateStatus, type UserRow } from '../../lib/api';
import { toCsv } from '../../lib/csv';
import { download } from '../../lib/ics';
import { ROADMAP_STEPS } from '../../lib/roadmap';
import { daysBetween, formatDateTime, formatDay, localDate, relative } from '../../lib/time';
import type { Profile, Role, RoadmapStep } from '../../lib/types';
import { useStore } from '../../state/store';
import { Bar, Empty, ErrorText, Sheet, toast } from '../../ui/common';
import * as I from '../../ui/icons';
import { Link, match, navigate } from '../../ui/router';
import { Analytics, ContentLibrary, Coverage, FormBuilder, ReviewQueue } from './Content';

export function AdminRoutes({ path }: { path: string }) {
  const { profile } = useStore();
  const isAdmin = profile?.role === 'admin';
  const tabs = [
    ...(isAdmin ? [['/admin', 'Users'], ['/admin/invite', 'Invite']] : []),
    ['/admin/review', 'Review queue'], ['/admin/content', 'Questions & cards'], ['/admin/forms', 'Exam forms'],
    ['/admin/analytics', 'Analytics'], ['/admin/coverage', 'Coverage'],
    ...(isAdmin ? [['/admin/verify', '[verify] items'], ['/admin/settings', 'Outline'], ['/admin/export', 'Export']] : []),
  ];
  let m: Record<string, string> | null;
  let body: React.ReactNode;
  const adminOnly = (el: React.ReactNode) => (isAdmin ? el : <Empty title="Admins only" body="Reviewers can review content, build exam forms, and see analytics and coverage." />);
  if (path === '/admin') body = isAdmin ? <Users /> : <ReviewQueue />;
  else if (path === '/admin/invite') body = adminOnly(<Invite />);
  else if ((m = match('/admin/user/:id', path))) body = adminOnly(<UserDetail id={m.id} />);
  else if (path === '/admin/review') body = <ReviewQueue />;
  else if (path === '/admin/content') body = <ContentLibrary />;
  else if (path === '/admin/forms') body = <FormBuilder />;
  else if (path === '/admin/analytics') body = <Analytics />;
  else if (path === '/admin/coverage') body = <Coverage />;
  else if (path === '/admin/verify') body = adminOnly(<VerifyItems />);
  else if (path === '/admin/settings') body = adminOnly(<OutlineSettings />);
  else if (path === '/admin/export') body = adminOnly(<Export />);
  else body = <Empty title="Not found" body="That admin page doesn't exist." />;
  const current = tabs.find(([to]) => to === path)?.[0] ?? (path.startsWith('/admin/user') ? '/admin' : '');
  return (
    <main className="page wide" id="main">
      <h1>{isAdmin ? 'Admin' : 'Reviewer'}</h1>
      <nav className="admin-nav" aria-label="Admin sections">
        {tabs.map(([to, label]) => <Link key={to} to={to} aria-current={to === current ? 'page' : undefined}>{label}</Link>)}
      </nav>
      {isAdmin && <OutlineReminder />}
      {body}
    </main>
  );
}

function OutlineReminder() {
  const { content, reloadContent } = useStore();
  if (!content) return null;
  const days = daysBetween(content.settings.outline_checked_at, localDate());
  if (days < OUTLINE_REMINDER_DAYS) return null;
  return (
    <div className="notice mb">
      <I.Info />
      <div className="grow">
        <strong>Check for a newer content outline.</strong>
        <p className="small" style={{ margin: '0.25rem 0 0.5rem' }}>It's been {days} days since anyone confirmed "{content.settings.outline_version}" is current. Check Pearson VUE's Nevada real estate page for a newer Candidate Handbook.</p>
        <button className="btn sm" onClick={async () => { await staffApi.saveSettings({ outline_checked_at: localDate() }); await reloadContent(); toast('Marked as checked today.'); }}>I checked. It's current.</button>
        <Link to="/admin/settings" className="btn quiet sm">Update the version</Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- launch gate
export function GatePanel({ gate }: { gate: GateStatus | null }) {
  if (!gate) return null;
  return (
    <section className={`card ${gate.met ? 'inverse' : 'outline'} mb`} aria-label="Launch gate">
      <div className="row between"><h2 style={{ margin: 0 }}>Launch gate</h2><span className="head row">{gate.met ? <><I.Check /> Met</> : <><I.Lock /> Not met</>}</span></div>
      <p className="small" style={{ margin: '0.25rem 0 0.75rem' }}>Student invites open when every subtopic has 10+ verified Lesson Pool questions and 2+ verified Concept Cards, and 4+ complete verified forms exist for each portion.</p>
      <div className="stack" style={{ gap: '0.6rem' }}>
        <div><div className="row between small"><span>Subtopics at minimum</span><span className="num">{gate.subtopics_ready}/{gate.subtopics_total}</span></div><Bar value={gate.subtopics_ready} max={gate.subtopics_total} label="Subtopics ready" thin /></div>
        <div><div className="row between small"><span>National forms</span><span className="num">{gate.national_forms}/{gate.forms_required}</span></div><Bar value={gate.national_forms} max={gate.forms_required} label="National forms ready" thin /></div>
        <div><div className="row between small"><span>State forms</span><span className="num">{gate.state_forms}/{gate.forms_required}</span></div><Bar value={gate.state_forms} max={gate.forms_required} label="State forms ready" thin /></div>
      </div>
      {!gate.met && <Link to="/admin/coverage" className="btn sm ghost mt" style={gate.met ? undefined : {}}>See what's missing</Link>}
    </section>
  );
}

// ---------------------------------------------------------------- users
type SortKey = 'name' | 'joined_at' | 'last_active_at' | 'streak' | 'units_completed' | 'roadmap_step' | 'national' | 'state' | 'unseen' | 'ready';
function Users() {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [gate, setGate] = useState<GateStatus | null>(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'last_active_at', dir: -1 });
  const [fReady, setFReady] = useState(false);
  const [fForms, setFForms] = useState(false);
  useEffect(() => {
    adminApi.users().then(setRows).catch((e) => setErr(friendly(e)));
    adminApi.gate().then(setGate).catch(() => undefined);
  }, []);
  const view = useMemo(() => {
    if (!rows) return [];
    const val = (r: UserRow): string | number => {
      switch (sort.k) {
        case 'national': return r.national?.score ?? -1;
        case 'state': return r.state?.score ?? -1;
        case 'unseen': return Math.min(r.unseen_national, r.unseen_state);
        case 'ready': return r.ready ? 1 : 0;
        case 'name': return (r.name || r.email).toLowerCase();
        default: return (r[sort.k] as string | number | null) ?? '';
      }
    };
    return rows
      .filter((r) => !fReady || r.ready)
      .filter((r) => !fForms || Math.min(r.unseen_national, r.unseen_state) <= 1)
      .sort((a, b) => (val(a) > val(b) ? 1 : val(a) < val(b) ? -1 : 0) * sort.dir);
  }, [rows, sort, fReady, fForms]);
  const th = (k: SortKey, label: string) => (
    <th aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : -1 }))}>{label}{sort.k === k && (sort.dir === 1 ? ' ↑' : ' ↓')}</button>
    </th>
  );
  const deletion = rows?.filter((r) => r.deletion_requested_at) ?? [];
  return (
    <>
      <GatePanel gate={gate} />
      {deletion.length > 0 && <div className="notice mb"><I.Info /><div><strong>Deletion requested</strong><p className="small" style={{ margin: 0 }}>{deletion.map((d) => d.name || d.email).join(', ')}. Open their profile to delete the account.</p></div></div>}
      <div className="row wrap between mb">
        <h2 style={{ margin: 0 }}>Users {rows && <span className="muted small">({view.length})</span>}</h2>
        <div className="row wrap">
          <label className="check" style={{ minHeight: 44 }}><input type="checkbox" checked={fReady} onChange={(e) => setFReady(e.target.checked)} /> Ready to Test</label>
          <label className="check" style={{ minHeight: 44 }}><input type="checkbox" checked={fForms} onChange={(e) => setFForms(e.target.checked)} /> 1 or fewer unseen forms left</label>
        </div>
      </div>
      <ErrorText>{err}</ErrorText>
      {rows && rows.length === 0 && <Empty title="No users yet" body="Invite someone to get started." />}
      {rows && rows.length > 0 && (
        <div className="table-wrap">
          <table className="data">
            <thead><tr>{th('name', 'Name')}<th>Role</th>{th('joined_at', 'Joined')}{th('last_active_at', 'Last active')}{th('streak', 'Streak')}{th('units_completed', 'Units')}{th('roadmap_step', 'Roadmap step')}{th('national', 'National')}{th('state', 'State')}{th('unseen', 'Unseen forms N/S')}{th('ready', 'Ready to Test')}</tr></thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.id} className="clickable" onClick={() => navigate(`/admin/user/${r.id}`)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/admin/user/${r.id}`); }}>
                  <td><strong>{r.name || '—'}</strong><div className="tiny muted">{r.email}</div>{r.disabled && <span className="badge">Access off</span>}</td>
                  <td>{r.role}</td>
                  <td>{r.joined_at ? formatDay(r.joined_at) : <span className="muted">Invited {formatDay(r.invited_at)}</span>}</td>
                  <td>{relative(r.last_active_at)}</td>
                  <td className="num">{r.streak}</td>
                  <td className="num">{r.units_completed}</td>
                  <td>{r.roadmap_step ?? '—'}</td>
                  <td>{r.national ? <>{r.national.passed ? <I.Check size={14} style={{ display: 'inline' }} aria-label="passed" /> : <I.X size={14} style={{ display: 'inline' }} aria-label="not passed" />} {r.national.score}%</> : '—'}</td>
                  <td>{r.state ? <>{r.state.passed ? <I.Check size={14} style={{ display: 'inline' }} aria-label="passed" /> : <I.X size={14} style={{ display: 'inline' }} aria-label="not passed" />} {r.state.score}%</> : '—'}</td>
                  <td className="num">{Math.min(r.unseen_national, r.unseen_state) <= 1 && <I.Info size={14} style={{ display: 'inline' }} aria-label="Warning: 1 or fewer unseen forms" />} {r.unseen_national}/{r.unseen_state}</td>
                  <td>{r.ready ? <span className="badge solid"><I.Trophy size={14} /> Ready</span> : <span className="muted">Not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- invite
function Invite() {
  const [gate, setGate] = useState<GateStatus | null>(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('student');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [invites, setInvites] = useState<Awaited<ReturnType<typeof adminApi.invites>>>([]);
  const refresh = () => { adminApi.gate().then(setGate).catch(() => undefined); adminApi.invites().then(setInvites).catch(() => undefined); };
  useEffect(refresh, []);
  const blocked = role === 'student' && !gate?.met;
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  async function send() {
    setErr(''); setBusy(true);
    try { await adminApi.invite(email.trim().toLowerCase(), role, name.trim()); toast(`Invitation sent to ${email.trim()}.`); setEmail(''); setName(''); refresh(); }
    catch (e) { setErr(friendly(e)); } finally { setBusy(false); }
  }
  return (
    <div className="grid-2">
      <section className="stack">
        <h2 style={{ margin: 0 }}>Invite someone</h2>
        <p className="small muted" style={{ margin: 0 }}>Only invited people can create an account. They get an email with a link to set their password.</p>
        <label className="field">Email<input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label>
        <label className="field">Name (optional)<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="field">Role
          <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="student">Student</option>
            <option value="reviewer">Reviewer (licensed broker who checks content)</option>
            <option value="admin">Admin</option>
          </select>
        </label>
        {blocked && <p className="notice small" style={{ margin: 0 }}><I.Lock size={18} /> Student invites stay off until the launch gate is met. You can invite a Reviewer now to help verify content.</p>}
        <ErrorText>{err}</ErrorText>
        <button className="btn block lg" onClick={send} disabled={busy || blocked || !valid} aria-disabled={blocked}>{busy ? 'Sending…' : 'Send invitation'}</button>
      </section>
      <section>
        <GatePanel gate={gate} />
        <h3>Invitations</h3>
        {invites.length === 0 ? <p className="muted small">No invitations yet.</p> : (
          <div className="list">
            {invites.map((i) => <div key={i.email} className="list-row" style={{ cursor: 'default' }}><span className="grow">{i.email}<span className="tiny muted" style={{ display: 'block' }}>{i.role} · invited {formatDay(i.created_at)}</span></span>{i.accepted_at ? <span className="badge ok"><I.Check size={14} /> Joined</span> : <span className="badge">Pending</span>}</div>)}
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------- user detail
function UserDetail({ id }: { id: string }) {
  const { profile: me } = useStore();
  const [d, setD] = useState<Awaited<ReturnType<typeof adminApi.userDetail>> | null>(null);
  const [err, setErr] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);
  const [typed, setTyped] = useState('');
  const load = () => adminApi.userDetail(id).then(setD).catch((e) => setErr(friendly(e)));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <ErrorText>{err}</ErrorText>;
  if (!d) return <p className="muted">Loading…</p>;
  const p: Profile = d.profile;
  const steps: Record<string, RoadmapStep> = Object.fromEntries(d.roadmap.map((s) => [s.step_key, s]));
  const st = d.stats as Record<string, number | string | null> | null;
  async function act(fn: () => Promise<unknown>, ok: string) { try { await fn(); toast(ok); load(); } catch (e) { toast(friendly(e)); } }
  return (
    <div className="stack lg">
      <Link to="/admin" className="btn quiet" style={{ alignSelf: 'flex-start', paddingLeft: 0 }}><I.Back size={18} /> All users</Link>
      <div>
        <h2 style={{ margin: 0 }}>{p.full_name || p.email}</h2>
        <p className="muted" style={{ margin: 0 }}>{p.email} · {p.role}{p.disabled ? ' · access off' : ''} · joined {p.joined_at ? formatDay(p.joined_at) : 'not yet'} · last active {relative(p.last_active_at)}</p>
        {p.deletion_requested_at && <p className="badge solid mt">Deletion requested {relative(p.deletion_requested_at)}</p>}
      </div>
      <div className="stat-grid">
        <div className="card stat"><span className="num">{st?.streak ?? 0}</span><span className="small muted">Streak</span></div>
        <div className="card stat"><span className="num">{st?.xp_total ?? 0}</span><span className="small muted">XP</span></div>
        <div className="card stat"><span className="num">{st?.units_completed ?? 0}</span><span className="small muted">Units</span></div>
        <div className="card stat"><span className="num">{st?.accuracy ?? '—'}{st?.accuracy != null && '%'}</span><span className="small muted">Accuracy</span></div>
      </div>
      <div className="grid-2">
        <section>
          <h3>Roadmap</h3>
          <div className="list">
            {ROADMAP_STEPS.map((s) => <div key={s.key} className="list-row" style={{ cursor: 'default' }}><span className="grow">{s.number}. {s.title}</span><span className="small">{steps[s.key]?.status?.replace('_', ' ') ?? 'not started'}{steps[s.key]?.done_on ? ` · ${formatDay(steps[s.key].done_on)}` : ''}</span></div>)}
          </div>
          <p className="small muted">School: {p.school_name ?? '—'} · Broker: {p.broker_name ?? '—'} · Target exam: {p.target_exam_date ? formatDay(p.target_exam_date) : '—'}</p>
        </section>
        <section>
          <h3>Exam Day attempts</h3>
          {d.sessions.length === 0 ? <p className="muted small">None yet.</p> : (
            <div className="list">
              {d.sessions.map((s) => (
                <Link key={s.id} to={`/exam/results/${s.id}`} className="list-row">
                  {s.passed ? <I.Check aria-label="passed" /> : s.submitted_at ? <I.X aria-label="not passed" /> : <I.Clock aria-label="in progress" />}
                  <span className="grow">{s.portion} · {formatDateTime(s.started_at)}</span><span className="num">{s.score_pct ?? '—'}{s.score_pct != null && '%'}</span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
      <section className="card outline stack">
        <h3 style={{ margin: 0 }}>Manage</h3>
        <label className="field">Role
          <select className="input" value={p.role} disabled={p.id === me?.id} onChange={(e) => act(() => adminApi.setRole(p.id, e.target.value as Role), 'Role updated.')}>
            <option value="student">Student</option><option value="reviewer">Reviewer</option><option value="admin">Admin</option>
          </select>
        </label>
        {p.id !== me?.id && (
          <div className="row wrap">
            <button className="btn ghost" onClick={() => act(() => adminApi.setAccess(p.id, !p.disabled), p.disabled ? 'Access restored.' : 'Access removed.')}>{p.disabled ? 'Restore access' : 'Remove access'}</button>
            <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete account and all data</button>
          </div>
        )}
      </section>
      <Sheet open={confirmDel} onClose={() => setConfirmDel(false)} title="Delete this account?">
        <p>This permanently deletes {p.email} and every piece of their data: progress, Roadmap, stats, flags and Exam Day attempts. It can't be undone.</p>
        <label className="field">Type their email to confirm<input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" /></label>
        <button className="btn danger block mt" disabled={typed.trim().toLowerCase() !== p.email} onClick={async () => {
          try { await adminApi.deleteUser(p.id); toast('Account deleted.'); navigate('/admin'); } catch (e) { toast(friendly(e)); }
        }}>Delete permanently</button>
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- [verify] items
function VerifyItems() {
  const { content, reloadContent, profile } = useStore();
  const [edits, setEdits] = useState<Record<string, { value: string; source_url: string }>>({});
  if (!content) return null;
  async function save(key: string) {
    const e = edits[key];
    const url = e.source_url.trim();
    if (url && !/^https:\/\//.test(url)) { toast('Paste a full https:// link to the NRED or Pearson VUE source.'); return; }
    try {
      await staffApi.saveVerify(key, { value: e.value.trim() || null, source_url: url || null, verified_by: url ? profile!.id : null, verified_at: url ? new Date().toISOString() : null });
      await reloadContent(); toast(url ? 'Saved and marked verified.' : 'Saved. Still shows [verify] until a source link is added.');
    } catch (x) { toast(friendly(x)); }
  }
  const groups = [['roadmap', 'Roadmap facts'], ['exam_day', 'Exam-day rules']] as const;
  return (
    <div className="stack lg">
      <p className="muted" style={{ margin: 0 }}>Every fact here shows as "[verify]" in the app until you paste the official source link. Never fill a value from memory.</p>
      {groups.map(([cat, label]) => (
        <section key={cat}>
          <h2>{label}</h2>
          <div className="stack">
            {content.verify.filter((v) => v.category === cat).map((v) => {
              const e = edits[v.key] ?? { value: v.value ?? '', source_url: v.source_url ?? '' };
              return (
                <div key={v.key} className="card stack">
                  <div className="row between"><strong>{v.label}</strong>{v.source_url ? <span className="badge ok"><I.Check size={14} /> Verified {formatDay(v.verified_at)}</span> : <span className="badge verify">[verify]</span>}</div>
                  {v.note && <p className="tiny muted" style={{ margin: 0 }}>{v.note}</p>}
                  <label className="field">Value<textarea className="input" style={{ minHeight: 60 }} value={e.value} onChange={(x) => setEdits({ ...edits, [v.key]: { ...e, value: x.target.value } })} /></label>
                  <label className="field">Official source link<input className="input" type="url" placeholder="https://red.nv.gov/…" value={e.source_url} onChange={(x) => setEdits({ ...edits, [v.key]: { ...e, source_url: x.target.value } })} /></label>
                  <button className="btn sm" style={{ alignSelf: 'flex-start' }} disabled={!edits[v.key]} onClick={() => save(v.key)}>Save</button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- outline settings
function OutlineSettings() {
  const { content, reloadContent } = useStore();
  const [version, setVersion] = useState(content?.settings.outline_version ?? '');
  const [hour, setHour] = useState(content?.settings.streak_email_local_hour ?? 19);
  const [forms, setForms] = useState(content?.settings.planned_forms_per_portion ?? 6);
  const [items, setItems] = useState<Record<string, string>>({});
  if (!content) return null;
  async function save() {
    try {
      await staffApi.saveSettings({ outline_version: version.trim(), outline_checked_at: localDate(), streak_email_local_hour: hour, planned_forms_per_portion: forms });
      for (const [id, v] of Object.entries(items)) await staffApi.saveTopic(id, { items: Number(v), items_verified: true });
      await reloadContent(); setItems({}); toast('Settings saved.');
    } catch (e) { toast(friendly(e)); }
  }
  return (
    <div className="stack lg" style={{ maxWidth: 720 }}>
      <section className="stack">
        <h2 style={{ margin: 0 }}>Content outline</h2>
        <p className="small muted" style={{ margin: 0 }}>Every question and Concept Card is tagged with this version. Last confirmed current on {formatDay(content.settings.outline_checked_at)}. You'll get a reminder every {OUTLINE_REMINDER_DAYS} days to check Pearson VUE for a newer one.</p>
        <label className="field">Outline version<input className="input" value={version} onChange={(e) => setVersion(e.target.value)} /></label>
      </section>
      <section className="stack">
        <h2 style={{ margin: 0 }}>Official item counts</h2>
        <p className="small muted" style={{ margin: 0 }}>Enter the number of scored items per topic from the official outline. Exam forms and coverage targets follow these. Saving marks the count as confirmed.</p>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Topic</th><th>Items</th><th>Status</th></tr></thead>
            <tbody>
              {content.topics.map((t) => (
                <tr key={t.id}><td>{t.portion === 'state' ? 'NV · ' : ''}{t.title}</td>
                  <td><input className="input" style={{ width: 90, minHeight: 40 }} type="number" min={0} max={80} value={items[t.id] ?? String(t.items)} onChange={(e) => setItems({ ...items, [t.id]: e.target.value })} aria-label={`Items for ${t.title}`} /></td>
                  <td>{t.items_verified ? <span className="badge ok"><I.Check size={14} /> Confirmed</span> : <span className="badge verify">[verify]</span>}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="stack">
        <h2 style={{ margin: 0 }}>Other settings</h2>
        <label className="field">Streak-saver email goes out at (user's local time)
          <select className="input" value={hour} onChange={(e) => setHour(Number(e.target.value))}>
            {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}</option>)}
          </select>
        </label>
        <label className="field">Planned exam forms per portion<input className="input" type="number" min={4} max={20} value={forms} onChange={(e) => setForms(Number(e.target.value))} /></label>
      </section>
      <button className="btn lg" onClick={save}>Save settings</button>
    </div>
  );
}

// ---------------------------------------------------------------- export
function Export() {
  const [busy, setBusy] = useState('');
  async function run(kind: 'questions' | 'cards' | 'terms' | 'all', fmt: 'csv' | 'json') {
    setBusy(`${kind}-${fmt}`);
    try {
      const stamp = localDate();
      if (kind === 'all') {
        const [questions, cards, terms, forms, coverage] = await Promise.all([staffApi.allQuestions(), staffApi.allCards(), staffApi.allTerms(), staffApi.forms(), staffApi.coverage()]);
        download(`ypfg-backup-${stamp}.json`, JSON.stringify({ exported_at: new Date().toISOString(), questions, cards, terms, forms, coverage }, null, 2), 'application/json');
      } else {
        const rows = kind === 'questions' ? await staffApi.allQuestions() : kind === 'cards' ? await staffApi.allCards() : await staffApi.allTerms();
        if (fmt === 'json') download(`ypfg-${kind}-${stamp}.json`, JSON.stringify(rows, null, 2), 'application/json');
        else download(`ypfg-${kind}-${stamp}.csv`, toCsv(rows as unknown as Record<string, unknown>[]), 'text/csv;charset=utf-8');
      }
      toast('Download started.');
    } catch (e) { toast(friendly(e)); } finally { setBusy(''); }
  }
  const btn = (k: 'questions' | 'cards' | 'terms', f: 'csv' | 'json', label: string) => <button className="btn ghost" disabled={!!busy} onClick={() => run(k, f)}><I.Download size={18} /> {label}</button>;
  return (
    <div className="stack lg" style={{ maxWidth: 720 }}>
      <p className="muted" style={{ margin: 0 }}>The free database plan has no automatic backups. Export after every content session and keep the files somewhere safe. CSV opens in Excel and Google Sheets.</p>
      <section className="stack"><h2 style={{ margin: 0 }}>Question bank</h2><div className="row wrap">{btn('questions', 'csv', 'Questions CSV')}{btn('questions', 'json', 'Questions JSON')}</div></section>
      <section className="stack"><h2 style={{ margin: 0 }}>Concept Cards</h2><div className="row wrap">{btn('cards', 'csv', 'Cards CSV')}{btn('cards', 'json', 'Cards JSON')}</div></section>
      <section className="stack"><h2 style={{ margin: 0 }}>Term bank</h2><div className="row wrap">{btn('terms', 'csv', 'Terms CSV')}{btn('terms', 'json', 'Terms JSON')}</div></section>
      <section className="stack"><h2 style={{ margin: 0 }}>Everything</h2><button className="btn" disabled={!!busy} onClick={() => run('all', 'json')}><I.Download size={18} /> Full backup (JSON)</button></section>
    </div>
  );
}
