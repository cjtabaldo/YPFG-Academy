import { useMemo, useState } from 'react';
import { COURSES, type CourseCode } from '../../config/app';
import { practiceAvailable } from '../../lib/lessonBuilder';
import { pathState, orderedUnits, unitLessons, allUnitsDone } from '../../lib/path';
import { studyPlan } from '../../lib/plan';
import { focusPortion, roadmapProgress, currentStepLabel } from '../../lib/roadmap';
import { daysBetween, localDate } from '../../lib/time';
import { useStore } from '../../state/store';
import { Bar, Empty, Mascot } from '../../ui/common';
import * as I from '../../ui/icons';
import { Link } from '../../ui/router';
import type { Unit } from '../../lib/types';

const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening'; };

export function Home() {
  const { content, derived, profile, roadmap } = useStore();
  const today = localDate();
  const focus = focusPortion(roadmap);
  const ps = useMemo(() => (content ? pathState(content, derived, focus) : null), [content, derived, focus]);
  if (!content || !profile || !ps) return null;
  const plan = studyPlan(content, derived, { today, target: profile.target_exam_date, start: profile.plan_start_date, portion: focus });
  const rp = roadmapProgress(roadmap);
  const due = practiceAvailable(content, derived);
  const goal = profile.daily_goal;
  const activeCourses = derived.hoursLastWeekCourses as Set<string>;
  const units = orderedUnits(content, focus);
  const national = units.filter((u) => u.portion === 'national'), state = units.filter((u) => u.portion === 'state');
  const firstName = profile.full_name.split(' ')[0];

  return (
    <main className="page" id="main">
      <section className="row between" aria-label="Today">
        <div>
          <h1 style={{ marginBottom: 0 }}>{greeting()}{firstName ? `, ${firstName}` : ''}.</h1>
          <p className="muted" style={{ margin: 0 }}>{derived.xpToday >= goal ? 'Daily goal done. Keep the streak warm.' : `${goal - derived.xpToday} XP to your daily goal.`}</p>
        </div>
        <Mascot state={derived.xpToday >= goal ? 'correct' : 'idle'} size="sm" />
      </section>

      <div className="mt"><Bar value={derived.xpToday} max={goal} label={`Daily goal: ${derived.xpToday} of ${goal} XP`} /></div>

      <section className="grid-2 mt" aria-label="Your plan">
        <Link to="/roadmap" className="card" style={{ textDecoration: 'none' }}>
          <div className="row between"><span className="kicker">License Roadmap</span><I.Next size={18} /></div>
          <p className="head" style={{ fontSize: '1.15rem', margin: '0.4rem 0' }}>{currentStepLabel(roadmap)}</p>
          <Bar value={rp.done} max={rp.total} label={`Roadmap: ${rp.done} of ${rp.total} steps done`} thin />
          <p className="small muted" style={{ margin: '0.4rem 0 0' }}>{rp.done} of {rp.total} steps done</p>
        </Link>
        <div className={`card ${plan.status === 'behind' ? 'outline' : ''}`}>
          <span className="kicker">Study plan</span>
          {plan.status === 'no-date' ? (
            <><p className="head" style={{ fontSize: '1.15rem', margin: '0.4rem 0' }}>Set a target exam date</p><Link to="/settings" className="small">Add it in Settings</Link></>
          ) : plan.status === 'done' ? (
            <p className="head" style={{ fontSize: '1.15rem', margin: '0.4rem 0' }}>Path complete. Go take Exam Day.</p>
          ) : (
            <>
              <p className="head row" style={{ fontSize: '1.15rem', margin: '0.4rem 0', gap: '0.4rem' }}>
                {plan.status === 'on-track' ? <><I.Check size={22} /> On track</> : <><I.Clock size={22} /> Behind by {plan.behind} lesson{plan.behind === 1 ? '' : 's'}</>}
              </p>
              <p className="small muted" style={{ margin: 0 }}>{plan.perDay} lesson{plan.perDay === 1 ? '' : 's'} a day · {plan.daysLeft} days to your target · {plan.remaining} left{focus ? ` (${focus === 'state' ? 'State' : 'National'} only)` : ''}</p>
            </>
          )}
        </div>
      </section>

      {focus && <div className="notice mt"><I.Info /><p style={{ margin: 0 }}>You logged the {focus === 'state' ? 'State' : 'National'} portion as not passed, so your path and plan now focus on it.</p></div>}

      <section className="row wrap mt" aria-label="Quick actions">
        <Link to="/practice" className="btn grow"><I.Refresh size={20} /> Practice{due ? <span className="badge" style={{ borderColor: "currentColor" }}>{due}</span> : null}</Link>
        {allUnitsDone(content, derived) ? <Link to="/exam" className="btn ghost grow"><I.Clock size={20} /> Exam Day</Link>
          : <Link to="/glossary" className="btn ghost grow"><I.Book size={20} /> Glossary</Link>}
      </section>

      {content.units.length === 0 && <div className="mt"><Empty title="No units yet" body="Content is still being loaded or reviewed." /></div>}
      {national.length > 0 && <PathSection title="National portion" sub="General real estate principles and practices" units={national} ps={ps} activeCourses={activeCourses} state={false} />}
      {state.length > 0 && <PathSection title="Nevada State portion" sub="Nevada law, rules, and practice" units={state} ps={ps} activeCourses={activeCourses} state />}
      {profile.target_exam_date && <p className="small muted center mt-lg">{Math.max(0, daysBetween(today, profile.target_exam_date))} days until your target exam date.</p>}
    </main>
  );
}

function PathSection({ title, sub, units, ps, activeCourses, state }: { title: string; sub: string; units: Unit[]; ps: ReturnType<typeof pathState>; activeCourses: Set<string>; state: boolean }) {
  const { content } = useStore();
  const [openUnits, setOpenUnits] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setOpenUnits((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return (
    <section className="path-section" aria-label={title}>
      <div className={`path-section-head ${state ? 'state' : ''}`}>
        <h2 style={{ margin: 0 }}>{title}</h2>
        <p style={{ margin: 0, opacity: 0.8 }} className="small">{sub}</p>
      </div>
      {units.map((u) => {
        const st = ps.unitState.get(u.id);
        const lessons = unitLessons(content!, u.id);
        const highlight = activeCourses.has(u.course);
        const doneCount = lessons.filter((l) => ps.lessonState.get(l.id) === 'done').length;
        const expanded = st === 'active' || openUnits.has(u.id);
        return (
          <div className="unit" key={u.id}>
            <button className="unit-toggle" onClick={() => toggle(u.id)} aria-expanded={expanded} aria-label={`${u.title}, ${st === 'done' ? 'complete' : st === 'locked' ? 'locked' : 'in progress'}, ${doneCount} of ${lessons.length} lessons. ${expanded ? 'Hide' : 'Show'} lessons`}>
            <div className={`unit-head ${st === 'done' ? 'done' : st === 'locked' ? 'locked' : ''} ${highlight ? 'highlight' : ''}`}>
              <span className="unit-num" aria-hidden="true">{Number(u.id.slice(1))}</span>
              <div className="grow">
                <h3 style={{ margin: 0 }}>{u.title}</h3>
                <p className="small" style={{ margin: 0, opacity: 0.85 }}>
                  {COURSES[u.course as CourseCode].name} · {doneCount}/{lessons.length}
                  {highlight && <> · <strong>In class this week</strong></>}
                </p>
              </div>
              {st === 'done' ? <I.Check aria-hidden /> : st === 'locked' ? <I.Lock aria-hidden /> : null}
            </div>
            </button>
            {st === 'locked' && <Link to={`/placement/${u.id}`} className="btn quiet sm" style={{ marginTop: '0.25rem' }}>Know this already? Take the placement check</Link>}
            {expanded && <div className="lessons">
              {lessons.map((l, i) => {
                const ls = ps.lessonState.get(l.id) ?? 'locked';
                const inner = (
                  <>
                    <span className="dot" aria-hidden="true">{ls === 'done' ? <I.Check /> : ls === 'locked' ? <I.Lock size={20} /> : l.kind === 'review' ? <I.Star /> : i + 1}</span>
                    <span className="node-label">{l.title}{ls === 'current' && <span className="small muted" style={{ display: 'block', fontWeight: 500 }}>Start here</span>}</span>
                  </>
                );
                const label = `${l.title}, ${ls === 'done' ? 'completed' : ls === 'locked' ? 'locked' : 'ready to start'}${l.kind === 'review' ? ', unit review' : ''}`;
                return ls === 'locked'
                  ? <div key={l.id} className={`node locked ${l.kind}`} aria-label={label}>{inner}</div>
                  : <Link key={l.id} to={`/lesson/${l.id}`} className={`node ${ls} ${l.kind}`} aria-label={label}>{inner}</Link>;
              })}
            </div>}
          </div>
        );
      })}
    </section>
  );
}
