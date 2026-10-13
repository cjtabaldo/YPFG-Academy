// Lesson, unit review, Practice and Placement check screens, plus the
// completion screen and celebrations.
import { useMemo, useState } from 'react';
import { STREAK } from '../../config/app';
import { buildLesson, buildPlacement, buildPractice, type Session } from '../../lib/lessonBuilder';
import { focusPortion } from '../../lib/roadmap';
import { useStore } from '../../state/store';
import { Bar, Celebration, Confetti, Empty, Mascot } from '../../ui/common';
import * as I from '../../ui/icons';
import { Link, navigate, useLocation } from '../../ui/router';
import { LessonPlayer, type SessionResult } from './LessonPlayer';
import { LESSON } from '../../config/app';
import { kv } from '../../lib/db';

function Complete({ title, result, extra, onDone, celebrations }: { title: string; result: SessionResult; extra?: string; onDone: () => void; celebrations: Array<{ title: string; sub: string }> }) {
  const { derived, profile } = useStore();
  const [queue, setQueue] = useState(celebrations);
  const goal = profile?.daily_goal ?? 20;
  const pct = result.total ? Math.round((100 * result.correct) / result.total) : 0;
  if (queue.length) return <Celebration title={queue[0].title} sub={queue[0].sub} onDone={() => setQueue((q) => q.slice(1))} />;
  return (
    <main className="page flush center stack lg" style={{ alignItems: 'center', paddingTop: '3rem' }}>
      <Confetti count={40} />
      <Mascot state="celebrate" size="lg" />
      <h1 className="big" style={{ fontSize: '2.6rem', animation: 'pop 0.55s cubic-bezier(.2,1.4,.4,1) both' }}>{title}</h1>
      {extra && <p style={{ fontSize: '1.1rem' }}>{extra}</p>}
      <div className="stat-grid" style={{ width: '100%' }}>
        <div className="card stat"><span className="num">+{result.xp}</span><span className="small muted">XP earned</span></div>
        <div className="card stat"><span className="num">{pct}%</span><span className="small muted">Accuracy</span></div>
        <div className="card stat"><span className="num">{Math.floor(result.seconds / 60)}:{String(result.seconds % 60).padStart(2, '0')}</span><span className="small muted">Time</span></div>
      </div>
      {result.perfect && <p className="badge solid"><I.Star size={16} /> Perfect: +5 XP</p>}
      <div className="card" style={{ width: '100%', textAlign: 'left' }}>
        <div className="row between"><strong>Daily goal</strong><span className="num">{Math.min(derived.xpToday, goal)}/{goal} XP</span></div>
        <div className="mt"><Bar value={derived.xpToday} max={goal} label="Daily goal progress" /></div>
        <p className="small muted" style={{ margin: '0.5rem 0 0' }}>{derived.xpToday >= goal ? 'Goal hit. Anything more is a bonus.' : `${goal - derived.xpToday} XP to go today.`} <I.Flame size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> {derived.streak}-day streak.</p>
      </div>
      <button className="btn block lg" onClick={onDone} autoFocus>Continue</button>
    </main>
  );
}

async function celebrationsFor(streakBefore: number, streakAfter: number, unitDone: string | null): Promise<Array<{ title: string; sub: string }>> {
  const out: Array<{ title: string; sub: string }> = [];
  if (unitDone) out.push({ title: 'Unit complete.', sub: `${unitDone} is done. On to the next one.` });
  for (const m of STREAK.milestones) {
    if (streakBefore < m && streakAfter >= m) {
      const key = `celebrated-streak-${m}`;
      if (!(await kv.get(key))) {
        await kv.set(key, true);
        out.push({ title: `${m} days.`, sub: m === 7 ? 'A full week in a row. This is how licenses get earned.' : m === 30 ? 'Thirty straight days. You are not the same student who started.' : 'One hundred days. That is discipline.' });
      }
    }
  }
  return out;
}

export function LessonScreen({ lessonId }: { lessonId: string }) {
  const { content, derived, recordMany } = useStore();
  const lesson = content?.lessons.find((l) => l.id === lessonId);
  const unit = content?.units.find((u) => u.id === lesson?.unit_id);
  const session = useMemo(() => (content && lesson ? buildLesson(content, lesson, derived) : null), [lessonId, !!content]); // eslint-disable-line react-hooks/exhaustive-deps
  const [done, setDone] = useState<{ r: SessionResult; cel: Array<{ title: string; sub: string }> } | null>(null);
  if (!content || !lesson || !unit) return <main className="page"><Empty title="Lesson not found" body="It may have been removed or renamed." action={<Link to="/" className="btn">Back to Home</Link>} /></main>;
  if (!session || session.exercises.length === 0) return <main className="page"><Empty title="Nothing to study here yet" body="Questions for this lesson haven't been verified yet. Check back soon." action={<Link to="/" className="btn">Back to Home</Link>} /></main>;
  if (done) return <Complete title={lesson.kind === 'review' ? 'Unit review done.' : 'Lesson complete.'} result={done.r} celebrations={done.cel} onDone={() => navigate('/')} />;

  return <LessonPlayer title={lesson.title} session={session} mode={lesson.kind === 'review' ? 'review' : 'lesson'} context={{ lesson: lesson.id }}
    onExit={() => navigate('/')}
    onFinish={async (r) => {
      const before = derived.streak;
      const evs: Array<{ kind: 'lesson_complete' | 'unit_complete'; payload: Record<string, unknown>; xp: number }> = [
        { kind: 'lesson_complete', payload: { lesson: lesson.id, unit: unit.id, correct: r.correct, total: r.total, secs: r.seconds, perfect: r.perfect }, xp: r.xp },
      ];
      if (lesson.kind === 'review' && !derived.completedUnits.has(unit.id)) evs.push({ kind: 'unit_complete', payload: { unit: unit.id, via: 'review' }, xp: 0 });
      await recordMany(evs);
      const after = derived.studiedToday ? before : before + 1;
      setDone({ r, cel: await celebrationsFor(before, after, evs.length > 1 ? unit.title : null) });
    }} />;
}

export function PracticeScreen() {
  const { content, derived, recordMany, roadmap } = useStore();
  const { query } = useLocation();
  const topicIds = query.get('topics')?.split(',').filter(Boolean);
  const session: Session | null = useMemo(() => (content ? buildPractice(content, derived, { topicIds, portion: focusPortion(roadmap) }) : null), [!!content]); // eslint-disable-line react-hooks/exhaustive-deps
  const [done, setDone] = useState<SessionResult | null>(null);
  if (!content || !session) return null;
  if (session.exercises.length === 0) return <main className="page"><Empty title="Nothing to practice yet" body="Finish a lesson first. Practice pulls from what you've studied and what you've missed." action={<Link to="/" className="btn">Back to Home</Link>} /></main>;
  if (done) return <Complete title="Practice done." extra="Hearts refilled." result={done} celebrations={[]} onDone={() => navigate('/')} />;
  const label = topicIds?.length ? `Drill: ${topicIds.map((t) => content.topics.find((x) => x.id === t)?.title).filter(Boolean).join(', ')}` : 'Practice';
  return <LessonPlayer title={label} session={session} mode="practice" context={{ practice: true, topics: topicIds ?? null }} onExit={() => navigate('/')}
    onFinish={async (r) => {
      await recordMany([
        { kind: 'practice_complete', payload: { correct: r.correct, total: r.total, secs: r.seconds, topics: topicIds ?? null }, xp: r.xp },
        { kind: 'hearts_refilled', payload: {} },
      ]);
      setDone(r);
    }} />;
}

export function PlacementScreen({ unitId }: { unitId: string }) {
  const { content, recordMany, derived } = useStore();
  const unit = content?.units.find((u) => u.id === unitId);
  const session = useMemo(() => (content && unit ? buildPlacement(content, unit.id) : null), [unitId, !!content]); // eslint-disable-line react-hooks/exhaustive-deps
  const [started, setStarted] = useState(false);
  const [done, setDone] = useState<{ r: SessionResult; pct: number; passed: boolean } | null>(null);
  if (!content || !unit || !session) return null;
  if (derived.completedUnits.has(unit.id)) return <main className="page"><Empty title="Already complete" body={`${unit.title} is already marked complete.`} action={<Link to="/" className="btn">Back to Home</Link>} /></main>;
  if (session.exercises.length < 5) return <main className="page"><Empty title="Placement check not ready" body="This unit needs more verified questions before a placement check can run." action={<Link to="/" className="btn">Back to Home</Link>} /></main>;
  if (done) {
    return (
      <main className="page flush center stack lg" style={{ alignItems: 'center', paddingTop: '3rem' }}>
        <Mascot state={done.passed ? 'celebrate' : 'idle'} size="lg" />
        <h1>{done.passed ? 'Skip unlocked.' : 'Not this time.'}</h1>
        <p className="num" style={{ fontSize: '3rem', fontWeight: 800, margin: 0 }}>{done.pct}%</p>
        <p>{done.passed ? `${unit.title} is marked complete. You can still open any of its lessons for review.` : `You need ${LESSON.placementPassPct}% to skip. Start the unit and you'll fly through what you know.`}</p>
        <button className="btn block lg" onClick={() => navigate('/')} autoFocus>Back to the path</button>
      </main>
    );
  }
  if (!started) {
    return (
      <main className="page stack lg" style={{ paddingTop: '2rem' }}>
        <Link to="/" className="btn quiet" style={{ alignSelf: 'flex-start' }}><I.Back size={18} /> Back</Link>
        <h1>Placement check: {unit.title}</h1>
        <p>{session.exercises.length} questions. Score {LESSON.placementPassPct}% or better and this unit is marked complete, so you can skip ahead. No hearts on the line.</p>
        <button className="btn block lg" onClick={() => setStarted(true)}>Start the check</button>
      </main>
    );
  }
  return <LessonPlayer title={`Placement: ${unit.title}`} session={session} mode="placement" context={{ placement: unit.id }} onExit={() => navigate('/')}
    onFinish={async (r) => {
      const pct = r.total ? Math.round((100 * r.correct) / r.total) : 0;
      const passed = pct >= LESSON.placementPassPct;
      const evs: Array<{ kind: 'placement' | 'unit_complete'; payload: Record<string, unknown>; xp: number }> = [{ kind: 'placement', payload: { unit: unit.id, pct, passed }, xp: passed ? 20 : 5 }];
      if (passed) evs.push({ kind: 'unit_complete', payload: { unit: unit.id, via: 'placement' }, xp: 0 });
      await recordMany(evs);
      setDone({ r, pct, passed });
    }} />;
}
