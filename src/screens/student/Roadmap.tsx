import { useEffect, useState } from 'react';
import { examApi } from '../../lib/api';
import { COURSES, type CourseCode } from '../../config/app';
import { ROADMAP_STEPS, stepStatus } from '../../lib/roadmap';
import { addMonths, daysBetween, formatDay, localDate } from '../../lib/time';
import type { RoadmapStep, StepStatus, VerifyItem } from '../../lib/types';
import { useStore } from '../../state/store';
import { Bar, Sheet, VerifyValue, toast } from '../../ui/common';
import * as I from '../../ui/icons';
import { Link } from '../../ui/router';

const STATUS_LABEL: Record<StepStatus, string> = { not_started: 'Not started', in_progress: 'In progress', done: 'Done', failed: 'Not passed' };

export function RoadmapScreen() {
  const { roadmap, content, derived, profile } = useStore();
  const [open, setOpen] = useState<string | null>(null);
  if (!content || !profile) return null;
  const v = (k: string) => content.verify.find((x) => x.key === k);
  const totalHours = Object.values(derived.hoursByCourse).reduce((a, b) => a + b, 0);
  return (
    <main className="page" id="main">
      <h1>License Roadmap</h1>
      <p className="muted">Every step from today to holding a Nevada salesperson license. Tap a step to update it.</p>
      <ReadyBanner />
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {ROADMAP_STEPS.map((s) => {
          const st = stepStatus(roadmap, s.key);
          const step = roadmap[s.key];
          return (
            <li key={s.key} className={`step ${st}`}>
              <span className="step-num" aria-hidden="true">{st === 'done' ? <I.Check /> : st === 'failed' ? <I.X /> : s.number}</span>
              <div>
                <button className="list-row" style={{ border: 0, padding: 0, minHeight: 44, display: 'block' }} onClick={() => setOpen(s.key)} aria-label={`Step ${s.number}: ${s.title}. ${STATUS_LABEL[st]}. Open to update.`}>
                  <h3 style={{ margin: 0 }}>{s.title}</h3>
                  <p className="small muted" style={{ margin: 0 }}>{STATUS_LABEL[st]}{step?.done_on ? ` · ${formatDay(step.done_on)}` : step?.started_on ? ` · started ${formatDay(step.started_on)}` : ''}</p>
                </button>
                <StepSummary k={s.key} step={step} v={v} totalHours={totalHours} />
              </div>
            </li>
          );
        })}
      </ol>
      {open && <StepEditor stepKey={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function ReadyBanner() {
  const [ready, setReady] = useState<boolean | null>(null);
  const { online } = useStore();
  useEffect(() => { if (online) examApi.overview().then((o) => setReady(o.ready.ready)).catch(() => setReady(false)); }, [online]);
  if (!ready) return null;
  return (
    <div className="card inverse mb">
      <p className="head row" style={{ fontSize: '1.3rem', margin: 0 }}><I.Trophy /> Ready to Test</p>
      <p style={{ margin: '0.4rem 0 0.75rem' }}>You passed both portions on two different unseen forms in a row. Time to schedule the real thing with Pearson VUE.</p>
      <p className="small" style={{ margin: 0 }}>Register and pay through NRED first, then schedule with Pearson VUE. <VerifyBadgeInline /></p>
    </div>
  );
}
const VerifyBadgeInline = () => <span className="badge verify">[verify]</span>;

function Countdown({ from, months, label, warnDays }: { from: string; months: number; label: string; warnDays?: number }) {
  const expires = addMonths(from, months);
  const left = daysBetween(localDate(), expires);
  return (
    <p className={`small ${warnDays !== undefined && left <= warnDays ? '' : 'muted'}`} style={{ margin: '0.25rem 0 0', fontWeight: warnDays !== undefined && left <= warnDays ? 700 : 400 }}>
      {left >= 0 ? <><I.Clock size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {label} {formatDay(expires)}: {left} day{left === 1 ? '' : 's'} left</> : <><I.X size={14} style={{ display: 'inline' }} /> {label} {formatDay(expires)}. Expired.</>}
    </p>
  );
}
const monthsOf = (item?: VerifyItem) => Number((item?.value ?? '').match(/\d+/)?.[0] ?? 0);

function StepSummary({ k, step, v, totalHours }: { k: string; step?: RoadmapStep; v: (k: string) => VerifyItem | undefined; totalHours: number }) {
  const { profile, derived, roadmap } = useStore();
  const d = (step?.data ?? {}) as Record<string, string>;
  switch (k) {
    case 'eligibility':
      return <p className="small" style={{ margin: '0.25rem 0 0' }}>Age: <VerifyValue item={v('eligibility_age')} />. Education: <VerifyValue item={v('eligibility_education')} />.</p>;
    case 'school':
      return <p className="small" style={{ margin: '0.25rem 0 0' }}>{profile?.school_name ? <>School: <strong>{profile.school_name}</strong></> : 'No school entered yet.'}</p>;
    case 'education':
      return (
        <div className="stack mt" style={{ gap: '0.5rem' }}>
          <div><div className="row between small"><strong>Overall</strong><span className="num">{totalHours}/120 h</span></div><Bar value={totalHours} max={120} label="Overall pre-licensing hours" thin /></div>
          {(Object.keys(COURSES) as CourseCode[]).map((c) => (
            <div key={c}><div className="row between small"><span>{COURSES[c].name}</span><span className="num">{derived.hoursByCourse[c] ?? 0}/{COURSES[c].hours} h</span></div><Bar value={derived.hoursByCourse[c] ?? 0} max={COURSES[c].hours} label={`${COURSES[c].name} hours`} thin /></div>
          ))}
          <p className="tiny muted" style={{ margin: 0 }}>Hours per course: <VerifyValue item={v('prelicensing_hours')} /></p>
        </div>
      );
    case 'broker':
      return <p className="small" style={{ margin: '0.25rem 0 0' }}>{profile?.broker_name ? <>Broker: <strong>{profile.broker_name}</strong></> : 'No broker entered yet.'}</p>;
    case 'nred':
      return <p className="small" style={{ margin: '0.25rem 0 0' }}><VerifyValue item={v('nred_registration')} />{d.att_date && <><br />Authorization to Test: {formatDay(d.att_date)}</>}</p>;
    case 'checklist':
      return <p className="small muted" style={{ margin: '0.25rem 0 0' }}>ID, arrival time, allowed items, calculator rules. Open to see the list.</p>;
    case 'exam_national': case 'exam_state': {
      const item = v(k === 'exam_national' ? 'exam_validity_national' : 'exam_validity_state');
      return step?.status === 'done' && step.done_on ? <><Countdown from={step.done_on} months={monthsOf(item) || 12} label="Pass valid until" /><p className="tiny muted" style={{ margin: 0 }}>Validity: <VerifyValue item={item} /></p></> : null;
    }
    case 'fingerprints': {
      const item = v('fingerprint_validity');
      const appDone = stepStatus(roadmap, 'application') === 'done';
      if (!d.date) return <p className="small" style={{ margin: '0.25rem 0 0' }}><I.Info size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Get fingerprinted after you pass the exam and choose a broker. They expire, so timing matters.</p>;
      const left = daysBetween(localDate(), addMonths(d.date, monthsOf(item) || 2));
      return (
        <>
          <Countdown from={d.date} months={monthsOf(item) || 2} label="Fingerprints expire" warnDays={appDone ? undefined : 21} />
          {!appDone && left <= 21 && left >= 0 && <p className="error-text small" role="alert"><I.Clock size={16} /> Three weeks or less left. Submit your license application before your fingerprints expire.</p>}
          <p className="tiny muted" style={{ margin: 0 }}>Validity: <VerifyValue item={item} /></p>
        </>
      );
    }
    case 'application':
      return <p className="small" style={{ margin: '0.25rem 0 0' }}>Form: <VerifyValue item={v('application_form')} fallback="[verify current form number on NRED]" /> · Fee: <VerifyValue item={v('application_fee')} fallback="$[verify current fee on NRED]" /></p>;
    case 'post_licensing':
      return <p className="small" style={{ margin: '0.25rem 0 0' }}>Requirement: <VerifyValue item={v('post_licensing')} fallback="[verify on NRED]" /></p>;
    default:
      return null;
  }
}

function StepEditor({ stepKey, onClose }: { stepKey: string; onClose: () => void }) {
  const { roadmap, saveStep, profile, updateProfile, record, content } = useStore();
  const def = ROADMAP_STEPS.find((s) => s.key === stepKey)!;
  const cur = roadmap[stepKey];
  const [status, setStatus] = useState<StepStatus>(cur?.status ?? 'not_started');
  const [started, setStarted] = useState(cur?.started_on ?? '');
  const [doneOn, setDoneOn] = useState(cur?.done_on ?? '');
  const [notes, setNotes] = useState(cur?.notes ?? '');
  const [data, setData] = useState<Record<string, string>>((cur?.data as Record<string, string>) ?? {});
  const [school, setSchool] = useState(profile?.school_name ?? '');
  const [broker, setBroker] = useState(profile?.broker_name ?? '');
  const [hours, setHours] = useState<Record<string, string>>({});
  const isExam = stepKey === 'exam_national' || stepKey === 'exam_state';
  const checklist = content?.verify.filter((x) => x.category === 'exam_day') ?? [];

  async function save() {
    const today = localDate();
    const st = status;
    await saveStep(stepKey, {
      status: st, notes,
      started_on: started || (st !== 'not_started' ? cur?.started_on ?? today : null),
      done_on: st === 'done' ? doneOn || today : st === 'failed' ? doneOn || today : null,
      data,
    });
    if (stepKey === 'school' && school !== (profile?.school_name ?? '')) await updateProfile({ school_name: school || null });
    if (stepKey === 'broker' && broker !== (profile?.broker_name ?? '')) await updateProfile({ broker_name: broker || null });
    for (const [course, h] of Object.entries(hours)) {
      const n = Number(h);
      if (h && Number.isFinite(n) && n !== 0) await record('hours_logged', { course, hours: Math.round(n * 100) / 100 });
    }
    toast('Roadmap updated.');
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title={`${def.number}. ${def.title}`}>
      <div className="stack">
        <p className="muted small" style={{ margin: 0 }}>{def.summary}</p>
        <label className="field">Status
          <select className="input" value={status} onChange={(e) => setStatus(e.target.value as StepStatus)}>
            <option value="not_started">Not started</option>
            <option value="in_progress">In progress</option>
            <option value="done">{isExam ? 'Passed' : 'Done'}</option>
            {isExam && <option value="failed">Not passed</option>}
          </select>
        </label>
        <div className="grid-2">
          <label className="field">Started on<input type="date" className="input" value={started} onChange={(e) => setStarted(e.target.value)} /></label>
          {(status === 'done' || status === 'failed') && <label className="field">{isExam ? (status === 'failed' ? 'Exam date' : 'Date passed') : 'Done on'}<input type="date" className="input" value={doneOn} onChange={(e) => setDoneOn(e.target.value)} /></label>}
        </div>

        {stepKey === 'school' && <label className="field">School name<input className="input" value={school} onChange={(e) => setSchool(e.target.value)} placeholder="Your NRED-approved school" /></label>}
        {stepKey === 'broker' && <label className="field">Sponsoring broker<input className="input" value={broker} onChange={(e) => setBroker(e.target.value)} placeholder="Broker or brokerage name" /></label>}
        {stepKey === 'nred' && <label className="field">Authorization to Test received on<input type="date" className="input" value={data.att_date ?? ''} onChange={(e) => setData({ ...data, att_date: e.target.value })} /></label>}
        {stepKey === 'fingerprints' && (
          <>
            <p className="small notice" style={{ margin: 0 }}><I.Info size={18} /> We recommend getting fingerprinted only after you pass the exam and choose a broker, so they don't expire before you apply.</p>
            <label className="field">Date fingerprinted<input type="date" className="input" value={data.date ?? ''} onChange={(e) => setData({ ...data, date: e.target.value })} /></label>
          </>
        )}
        {stepKey === 'license' && <label className="field">License number (optional)<input className="input" value={data.license_number ?? ''} onChange={(e) => setData({ ...data, license_number: e.target.value })} /></label>}
        {stepKey === 'education' && (
          <div className="stack">
            <p className="small" style={{ margin: 0 }}>Log hours you've completed. They add to your totals, and matching units on your path get highlighted for a week.</p>
            {(Object.keys(COURSES) as CourseCode[]).map((c) => (
              <label key={c} className="field">Add hours: {COURSES[c].name}
                <input type="number" inputMode="decimal" min="-45" max="45" step="0.5" className="input" value={hours[c] ?? ''} onChange={(e) => setHours({ ...hours, [c]: e.target.value })} placeholder="0" />
              </label>
            ))}
            <p className="tiny muted" style={{ margin: 0 }}>Made a mistake? Enter a negative number to subtract.</p>
          </div>
        )}
        {stepKey === 'checklist' && (
          <div className="stack">
            {checklist.map((c) => (
              <div key={c.key} className="card"><strong>{c.label}</strong><p className="small" style={{ margin: '0.25rem 0 0' }}><VerifyValue item={c} fallback="Check the Pearson VUE Candidate Handbook." /></p></div>
            ))}
          </div>
        )}
        {isExam && status === 'failed' && <p className="small notice" style={{ margin: 0 }}><I.Info size={18} /> Your path and study plan will focus on this portion only. You've got this. Most people who keep studying pass the retake.</p>}
        <label className="field">Notes<textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything you want to remember" /></label>
        <button className="btn block lg" onClick={save}>Save</button>
        {stepKey === 'checklist' && <Link to="/exam" className="btn ghost block">Practice with Exam Day</Link>}
      </div>
    </Sheet>
  );
}
