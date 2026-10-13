import { useEffect, useMemo, useState } from 'react';
import { BRAND, DISCLAIMER, PRIVACY_NOTE } from '../../config/brand';
import { COURSES, DAILY_GOALS, type CourseCode } from '../../config/app';
import { auth, examApi, friendly, leaderboardApi, profileApi } from '../../lib/api';
import { topicAccuracy } from '../../lib/derive';
import { buildIcs, download } from '../../lib/ics';
import { speak, ttsSupported } from '../../lib/tts';
import { daysBetween, deviceTimeZone, localDate, relative } from '../../lib/time';
import type { ExamOverview } from '../../lib/types';
import { useStore } from '../../state/store';
import { Bar, Empty, ErrorText, Seg, Sheet, Switch, Unverified, Wordmark, toast } from '../../ui/common';
import * as I from '../../ui/icons';
import { Link, navigate } from '../../ui/router';
import { allUnitsDone } from '../../lib/path';

// ---------------------------------------------------------------- glossary
export function Glossary() {
  const { content, prefs, isStaff } = useStore();
  const [q, setQ] = useState('');
  const terms = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = [...(content?.terms ?? [])].sort((a, b) => a.term.localeCompare(b.term));
    return s ? list.filter((t) => t.term.toLowerCase().includes(s) || t.definition.toLowerCase().includes(s)) : list;
  }, [content, q]);
  if (!content) return null;
  return (
    <main className="page" id="main">
      <h1>Glossary</h1>
      <div className="search">
        <label className="sr-only" htmlFor="gsearch">Search terms</label>
        <div className="row" style={{ gap: '0.5rem' }}>
          <I.Search />
          <input id="gsearch" className="input" type="search" placeholder={`Search ${content.terms.length} terms`} value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        </div>
      </div>
      {terms.length === 0 ? <Empty title="No matches" body={q ? `Nothing matches "${q}". Try a shorter word.` : 'No verified terms yet.'} /> : (
        <dl className="list">
          {terms.map((t) => (
            <div key={t.id} className="term-row">
              <div className="row between">
                <dt className="head" style={{ fontSize: '1.1rem' }}>{t.term} {isStaff && <Unverified status={t.status} />}</dt>
                {ttsSupported() && <button className="icon-btn" onClick={() => speak(`${t.term}. ${t.definition}`, prefs.listenRate ?? 1)} aria-label={`Listen to ${t.term}`}><I.Speaker /></button>}
              </div>
              <dd style={{ margin: 0 }}>{t.definition}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- leaderboard
export function Leaderboard() {
  const { profile, updateProfile, online } = useStore();
  const [rows, setRows] = useState<Array<{ name: string; xp: number; me: boolean }> | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!profile?.leaderboard_opt_in) return;
    if (!online) { setErr("You're offline. The leaderboard loads when you reconnect."); return; }
    leaderboardApi.weekly().then(setRows).catch((e) => setErr(friendly(e)));
  }, [profile?.leaderboard_opt_in, online]);
  if (!profile) return null;
  if (!profile.leaderboard_opt_in) {
    return (
      <main className="page" id="main">
        <h1>Weekly leaderboard</h1>
        <Empty title="The leaderboard is opt-in" body="Join to see how your XP this week stacks up against other invited students. Only your display name and weekly XP are shown. Never your exam scores or Roadmap."
          action={<button className="btn" onClick={() => updateProfile({ leaderboard_opt_in: true })}>Join the leaderboard</button>} />
      </main>
    );
  }
  return (
    <main className="page" id="main">
      <h1>This week</h1>
      <p className="muted">XP earned since Monday. Resets every week.</p>
      <ErrorText>{err}</ErrorText>
      {rows && rows.length === 0 && <Empty title="Quiet week so far" body="Finish a lesson to get on the board." />}
      {rows && (
        <ol className="list" style={{ listStyle: 'none', padding: 0 }}>
          {rows.map((r, i) => (
            <li key={i} className="list-row" style={{ fontWeight: r.me ? 800 : 500 }}>
              <span className="num" style={{ width: 32, fontSize: '1.2rem', fontWeight: 800 }}>{i + 1}</span>
              <span className="grow">{r.name}{r.me && ' (you)'}</span>
              <span className="num">{r.xp} XP</span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

// ---------------------------------------------------------------- stats
export function Stats() {
  const { content, derived, profile, online } = useStore();
  const [exam, setExam] = useState<ExamOverview | null>(null);
  useEffect(() => { if (online) examApi.overview().then(setExam).catch(() => undefined); }, [online]);
  if (!content || !profile) return null;
  const acc = topicAccuracy(derived, content);
  const totalHours = Object.values(derived.hoursByCourse).reduce((a, b) => a + b, 0);
  const days = profile.target_exam_date ? daysBetween(localDate(), profile.target_exam_date) : null;
  const pct = (a: { n: number; ok: number }) => (a.n ? Math.round((100 * a.ok) / a.n) : null);
  const readiness = (portion: 'national' | 'state') => {
    const units = content.units.filter((u) => u.portion === portion);
    const unitsDone = units.filter((u) => derived.completedUnits.has(u.id)).length;
    const passes = portion === 'national' ? exam?.ready.national_passes_in_a_row ?? 0 : exam?.ready.state_passes_in_a_row ?? 0;
    const last = exam?.sessions.find((s) => s.portion === portion && s.submitted_at);
    let verdict: string;
    if (passes >= 2) verdict = 'Ready: two passes in a row on unseen forms.';
    else if (passes === 1) verdict = 'Close: one more pass on a new form.';
    else if (unitsDone < units.length) verdict = `Not yet: ${units.length - unitsDone} unit${units.length - unitsDone === 1 ? '' : 's'} left before Exam Day.`;
    else verdict = 'Not yet: pass Exam Day twice in a row.';
    return { unitsDone, units: units.length, passes, last, verdict };
  };
  return (
    <main className="page" id="main">
      <h1>Your stats</h1>
      <div className="stat-grid">
        <div className="card stat"><span className="num">{derived.streak}</span><span className="small muted">Day streak{derived.freezeHeld ? ' · freeze ready' : ''}</span></div>
        <div className="card stat"><span className="num">{derived.xpTotal.toLocaleString()}</span><span className="small muted">Total XP</span></div>
        <div className="card stat"><span className="num">{derived.answeredCount ? Math.round((100 * derived.correctCount) / derived.answeredCount) : 0}%</span><span className="small muted">Accuracy ({derived.answeredCount} answers)</span></div>
        <div className="card stat"><span className="num">{totalHours}</span><span className="small muted">Class hours logged</span></div>
        <div className="card stat"><span className="num">{days ?? '—'}</span><span className="small muted">Days to target exam</span></div>
        <div className="card stat"><span className="num">{derived.longestStreak}</span><span className="small muted">Longest streak</span></div>
      </div>

      <h2 className="mt-lg">Readiness</h2>
      <p className="small muted">Honest version: you're ready when you pass both portions on two different unseen Exam Day forms in a row. XP and streaks don't count.</p>
      <div className="grid-2">
        {(['national', 'state'] as const).map((p) => {
          const r = readiness(p);
          return (
            <div key={p} className={`card ${r.passes >= 2 ? 'inverse' : ''}`}>
              <h3>{p === 'national' ? 'National' : 'State'}</h3>
              <p style={{ margin: '0 0 0.5rem' }}><strong>{r.verdict}</strong></p>
              <p className="small" style={{ margin: 0 }}>Units: {r.unitsDone}/{r.units} · Passes in a row: {r.passes}/2{r.last ? ` · Last Exam Day: ${r.last.score_pct}%` : ''}</p>
            </div>
          );
        })}
      </div>

      <h2 className="mt-lg">Confidence</h2>
      <div className="grid-2">
        <div className="card"><strong>When you said "Sure"</strong><p className="num" style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.25rem 0' }}>{pct(derived.confidence.sure) ?? '—'}{pct(derived.confidence.sure) !== null && '%'}</p><p className="small muted" style={{ margin: 0 }}>right, across {derived.confidence.sure.n} answers</p></div>
        <div className="card"><strong>When you said "Guessing"</strong><p className="num" style={{ fontSize: '1.8rem', fontWeight: 800, margin: '0.25rem 0' }}>{pct(derived.confidence.guess) ?? '—'}{pct(derived.confidence.guess) !== null && '%'}</p><p className="small muted" style={{ margin: 0 }}>right, across {derived.confidence.guess.n} answers</p></div>
      </div>

      <h2 className="mt-lg">Accuracy by topic</h2>
      <div className="stack">
        {acc.map(({ topic, n, pct }) => (
          <div key={topic.id}>
            <div className="row between small"><span>{topic.portion === 'state' ? 'NV · ' : ''}{topic.title}</span><span className="num">{pct === null ? 'Not started' : `${pct}% (${n})`}</span></div>
            <Bar value={pct ?? 0} label={`${topic.title} accuracy`} thin />
          </div>
        ))}
      </div>

      <h2 className="mt-lg">Hours by course</h2>
      <div className="stack">
        {(Object.keys(COURSES) as CourseCode[]).map((c) => (
          <div key={c}><div className="row between small"><span>{COURSES[c].name}</span><span className="num">{derived.hoursByCourse[c] ?? 0}/{COURSES[c].hours}</span></div><Bar value={derived.hoursByCourse[c] ?? 0} max={COURSES[c].hours} label={`${COURSES[c].name} hours`} thin /></div>
        ))}
      </div>
      <div className="row wrap mt-lg">
        <Link to="/leaderboard" className="btn ghost grow"><I.Trophy size={20} /> Leaderboard</Link>
        {allUnitsDone(content, derived) && <Link to="/exam" className="btn ghost grow"><I.Clock size={20} /> Exam Day</Link>}
      </div>
    </main>
  );
}

// ---------------------------------------------------------------- settings
export function Settings() {
  const { profile, prefs, setPrefs, updateProfile, signOut, lastSync, syncing, sync, online, syncError } = useStore();
  const [about, setAbout] = useState(false);
  const [del, setDel] = useState(false);
  const [msg, setMsg] = useState('');
  if (!profile) return null;
  const theme = prefs.theme ?? 'system', size = prefs.textSize ?? 'md';

  async function sendReset() {
    try { await auth.sendReset(profile!.email); setMsg(`We sent a reset link to ${profile!.email}.`); } catch (e) { setMsg(friendly(e)); }
  }
  function ics() {
    const text = buildIcs({ reminderTime: profile!.reminder_time.slice(0, 5), timezone: profile!.timezone || deviceTimeZone(), targetDate: profile!.target_exam_date, appUrl: location.origin, startDate: localDate() });
    download('ypfg-academy-reminders.ics', text, 'text/calendar;charset=utf-8');
    toast('Calendar file downloaded. Open it to add the reminders.');
  }
  return (
    <main className="page" id="main">
      <h1>Settings</h1>

      <p className="section-label">Study</p>
      <label className="field">Daily XP goal</label>
      <Seg label="Daily XP goal" value={profile.daily_goal} options={DAILY_GOALS.map((g) => ({ value: g, label: String(g) }))} onChange={(g) => updateProfile({ daily_goal: g })} />
      <label className="field mt">Target exam date<input type="date" className="input" value={profile.target_exam_date ?? ''} min={localDate()} onChange={(e) => updateProfile({ target_exam_date: e.target.value || null })} /></label>
      <Switch label="Unlimited hearts" hint="Wrong answers won't cost hearts." checked={!!prefs.heartsUnlimited} onChange={(v) => setPrefs({ heartsUnlimited: v })} />
      <Switch label="Sound" hint="Short tones on answers and finishes." checked={!!prefs.sound} onChange={(v) => setPrefs({ sound: v })} />
      <Switch label="Listen mode" hint="Read cards, questions and answer choices aloud." checked={!!prefs.listen} onChange={(v) => setPrefs({ listen: v })} />

      <p className="section-label">Display</p>
      <label className="field">Theme</label>
      <Seg label="Theme" value={theme} options={[{ value: 'system', label: 'Auto' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} onChange={(v) => setPrefs({ theme: v })} />
      <label className="field mt">Text size</label>
      <Seg label="Text size" value={size} options={[{ value: 'sm', label: 'A' }, { value: 'md', label: 'A+' }, { value: 'lg', label: 'A++' }, { value: 'xl', label: 'A+++' }]} onChange={(v) => setPrefs({ textSize: v })} />

      <p className="section-label">Reminders</p>
      <label className="field">Daily reminder time<input type="time" className="input" value={profile.reminder_time.slice(0, 5)} onChange={(e) => updateProfile({ reminder_time: e.target.value })} /></label>
      <button className="btn ghost block mt" onClick={ics}><I.Download size={20} /> Add reminders to my calendar (.ics)</button>
      <p className="tiny muted">Includes a daily 10-minute study reminder at your time and your target exam date. Works with Apple and Google Calendar.</p>
      <Switch label="Streak-saver email" hint="One email on days you haven't studied by evening, when your streak is 3+ days. Unsubscribe anytime." checked={profile.streak_email_opt_in} onChange={(v) => updateProfile({ streak_email_opt_in: v })} />

      <p className="section-label">Leaderboard</p>
      <Switch label="Join the weekly leaderboard" hint="Shows your display name and weekly XP to other members who joined." checked={profile.leaderboard_opt_in} onChange={(v) => updateProfile({ leaderboard_opt_in: v })} />
      {profile.leaderboard_opt_in && <label className="field mt">Display name<input className="input" value={profile.leaderboard_name ?? ''} placeholder={profile.full_name.split(' ')[0]} maxLength={30} onChange={(e) => updateProfile({ leaderboard_name: e.target.value })} /></label>}

      <p className="section-label">Account</p>
      <label className="field">Name<input className="input" value={profile.full_name} onChange={(e) => updateProfile({ full_name: e.target.value })} autoComplete="name" /></label>
      <p className="small muted">{profile.email}</p>
      <div className="stack">
        <button className="btn ghost block" onClick={sendReset}>Email me a password reset link</button>
        {msg && <p className="small" role="status">{msg}</p>}
        <button className="btn ghost block" onClick={() => setAbout(true)}><I.Info size={20} /> About, disclaimer and privacy</button>
        <button className="btn block" onClick={async () => { await signOut(); navigate('/'); }}>Sign out</button>
        <button className="btn quiet" onClick={() => setDel(true)}>Request account deletion</button>
      </div>
      <p className="tiny muted mt">
        {online ? (syncing ? 'Syncing…' : `Last synced ${relative(lastSync)}.`) : 'Offline. Progress saves on this device and syncs when you reconnect.'}
        {online && !syncing && <> <button className="btn quiet sm" onClick={sync}>Sync now</button></>}
      </p>
      {syncError && <p className="tiny muted">{syncError}</p>}

      <Sheet open={about} onClose={() => setAbout(false)} title="About">
        <About />
      </Sheet>
      <Sheet open={del} onClose={() => setDel(false)} title="Delete your account?">
        <p>We'll ask the Admin to delete your account and everything stored with it: your progress, Roadmap, and Exam Day results. This can't be undone.</p>
        {profile.deletion_requested_at ? <p className="badge solid">Requested {relative(profile.deletion_requested_at)}</p> : (
          <button className="btn danger block" onClick={async () => { try { await profileApi.requestDeletion(); await updateProfile({ deletion_requested_at: new Date().toISOString() }); toast('Deletion requested.'); setDel(false); } catch (e) { toast(friendly(e)); } }}>Request deletion</button>
        )}
      </Sheet>
    </main>
  );
}

export function About() {
  return (
    <div className="stack">
      <Wordmark size={28} />
      <p className="small muted" style={{ margin: 0 }}>{BRAND.fullName}</p>
      <h3 className="mt">Disclaimer</h3>
      <p>{DISCLAIMER}</p>
      <h3>Privacy</h3>
      {PRIVACY_NOTE.map((p, i) => <p key={i}>{p}</p>)}
      <p className="tiny muted">Version {__APP_VERSION__}</p>
    </div>
  );
}
