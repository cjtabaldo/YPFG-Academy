// Exam Day: a plain simulator of the Pearson VUE exam. No hearts, mascot,
// hints, Listen mode or feedback until the end. The server owns the clock,
// the form and the answer key.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { examApi, friendly, syncApi } from '../../lib/api';
import { kv } from '../../lib/db';
import { clock, formatDateTime } from '../../lib/time';
import type { ExamAnswer, ExamOverview, ExamReview, ExamStateActive, Portion } from '../../lib/types';
import { useStore } from '../../state/store';
import { Bar, Calculator, Empty, ErrorText, Loading, Sheet, VerifyValue, toast } from '../../ui/common';
import * as I from '../../ui/icons';
import { Link, navigate } from '../../ui/router';
import { FlagSheet } from '../student/LessonPlayer';

const NAME: Record<Portion, string> = { national: 'National', state: 'State' };

export function ExamHome() {
  const { online, content, derived } = useStore();
  const [ov, setOv] = useState<ExamOverview | null>(null);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState<Portion | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (online) examApi.overview().then(setOv).catch((e) => setErr(friendly(e))); }, [online]);
  if (!online) return <main className="page"><h1>Exam Day</h1><Empty title="You're offline" body="Exam Day needs a connection to start, so the clock and your form stay honest. Connect and come back." /></main>;
  if (!ov || !content) return <main className="page"><h1>Exam Day</h1><ErrorText>{err}</ErrorText>{!err && <p className="muted">Loading…</p>}</main>;
  const done = content.units.filter((u) => derived.completedUnits.has(u.id)).length;
  const active = ov.sessions.filter((s) => !s.submitted_at && Date.parse(s.deadline) > Date.now());
  const past = ov.sessions.filter((s) => s.submitted_at);

  async function start(p: Portion) {
    setBusy(true); setErr('');
    try { const id = await examApi.start(p); navigate(`/exam/session/${id}`); } catch (e) { setErr(friendly(e)); setConfirm(null); } finally { setBusy(false); }
  }

  return (
    <main className="page" id="main">
      <h1>Exam Day</h1>
      <p className="muted">A full-length simulation of each Pearson VUE portion, on a form you've never seen. Scored separately. 75% to pass each.</p>
      {ov.ready.ready && <div className="card inverse mb"><p className="head row" style={{ margin: 0, fontSize: '1.2rem' }}><I.Trophy /> Ready to Test</p><p style={{ margin: '0.4rem 0 0' }}>Two passes in a row on both portions. Schedule your exam.</p></div>}
      {!ov.unlocked && (
        <div className="card outline stack">
          <p className="head row" style={{ margin: 0 }}><I.Lock /> Locked</p>
          <p style={{ margin: 0 }}>Finish every unit once to unlock Exam Day. You've completed {done} of {content.units.length}.</p>
          <Bar value={done} max={content.units.length} label="Units completed" />
        </div>
      )}
      <ErrorText>{err}</ErrorText>
      {active.map((s) => (
        <div key={s.id} className="card mt row between">
          <div><strong>{NAME[s.portion]} in progress</strong><p className="small muted" style={{ margin: 0 }}>Time is running. Ends {formatDateTime(s.deadline)}.</p></div>
          <Link to={`/exam/session/${s.id}`} className="btn">Resume</Link>
        </div>
      ))}
      <div className="grid-2 mt">
        {(['national', 'state'] as Portion[]).map((p) => {
          const cfg = ov.config[p];
          const unseen = p === 'national' ? ov.unseen_national : ov.unseen_state;
          return (
            <div key={p} className="card stack">
              <h2 style={{ margin: 0 }}>{NAME[p]}</h2>
              <p className="small" style={{ margin: 0 }}>{cfg.scored_items} scored questions + unscored pretest questions · {cfg.minutes} minutes{p === 'national' ? ' · on-screen calculator' : ''}</p>
              <p className="small" style={{ margin: 0 }}><strong>{unseen}</strong> unseen form{unseen === 1 ? '' : 's'} left{unseen <= 1 && unseen > 0 ? '. Make it count.' : ''}</p>
              <button className="btn block" disabled={!ov.unlocked || unseen === 0 || active.some((a) => a.portion === p)} onClick={() => setConfirm(p)}>Start {NAME[p]}</button>
            </div>
          );
        })}
      </div>
      {past.length > 0 && (
        <>
          <h2 className="mt-lg">Past attempts</h2>
          <div className="list">
            {past.map((s) => (
              <Link key={s.id} to={`/exam/results/${s.id}`} className="list-row">
                {s.passed ? <I.Check aria-label="Passed" /> : <I.X aria-label="Did not pass" />}
                <span className="grow"><strong>{NAME[s.portion]}</strong> · {s.passed ? 'Passed' : 'Not passed'}<span className="small muted" style={{ display: 'block' }}>{formatDateTime(s.submitted_at)}</span></span>
                <span className="num head">{s.score_pct}%</span>
              </Link>
            ))}
          </div>
        </>
      )}
      <p className="tiny muted mt-lg">Exam structure: <VerifyValue item={content.verify.find((v) => v.key === 'exam_structure')} /></p>
      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title={confirm ? `Start the ${NAME[confirm]} portion?` : ''}>
        {confirm && (
          <div className="stack">
            <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
              <li>{ov.config[confirm].scored_items} scored questions plus unscored pretest questions mixed in. You won't know which are which.</li>
              <li>{ov.config[confirm].minutes} minutes. The clock keeps running if you close the app.</li>
              <li>Mark questions for review and move between them freely.</li>
              <li>No feedback until you finish. You need 75% of scored questions to pass.</li>
              <li>This uses one of your unseen forms.</li>
            </ul>
            <button className="btn block lg" disabled={busy} onClick={() => start(confirm)}>{busy ? 'Preparing your form…' : 'Start the clock'}</button>
            <button className="btn ghost block" onClick={() => setConfirm(null)}>Not yet</button>
          </div>
        )}
      </Sheet>
    </main>
  );
}

export function ExamRunner({ sessionId }: { sessionId: string }) {
  const { online } = useStore();
  const [st, setSt] = useState<ExamStateActive | null>(null);
  const [answers, setAnswers] = useState<Record<string, ExamAnswer>>({});
  const [idx, setIdx] = useState(0);
  const [view, setView] = useState<'question' | 'review'>('question');
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [err, setErr] = useState('');
  const [calc, setCalc] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const viewStart = useRef(Date.now());
  const pending = useRef<Record<string, { a: number | null; m: boolean; secs: number }>>({});
  const cacheKey = `exam-${sessionId}`;

  const load = useCallback(async () => {
    try {
      const s = await examApi.state(sessionId);
      if (s.status === 'submitted') { await kv.del(cacheKey); navigate(`/exam/results/${sessionId}`, { replace: true }); return; }
      setSt(s); setOffset(Date.parse(s.server_now) - Date.now());
      setAnswers((local) => ({ ...s.answers, ...local }));
      await kv.set(cacheKey, { ...s, cachedAt: Date.now() });
    } catch (e) {
      const cached = await kv.get<ExamStateActive & { cachedAt: number }>(cacheKey);
      if (cached) { setSt(cached); setOffset(Date.parse(cached.server_now) - cached.cachedAt); setAnswers((a) => ({ ...cached.answers, ...a })); }
      else setErr(friendly(e));
    }
  }, [sessionId, cacheKey]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);

  const flush = useCallback(async () => {
    for (const q of Object.keys(pending.current)) {
      const v = pending.current[q];
      delete pending.current[q];
      try {
        const r = await examApi.save(sessionId, q, v.a, v.m, v.secs);
        if (r.status === 'closed') { navigate(`/exam/results/${sessionId}`, { replace: true }); return; }
      } catch {
        // Offline: put it back (keeping any newer answer) and retry later.
        const cur = pending.current[q];
        pending.current[q] = cur ? { ...cur, secs: cur.secs + v.secs } : v;
        return;
      }
    }
    const cached = await kv.get<ExamStateActive & { cachedAt: number }>(cacheKey);
    if (cached) await kv.set(cacheKey, { ...cached, answers: { ...cached.answers, ...answersRef.current } });
  }, [sessionId, cacheKey]);
  const answersRef = useRef(answers); answersRef.current = answers;
  useEffect(() => { const t = setInterval(flush, 5000); return () => clearInterval(t); }, [flush]);
  useEffect(() => { if (online) flush(); }, [online, flush]);

  const questions = st?.questions ?? [];
  const q = questions[idx];
  const remaining = st ? (Date.parse(st.deadline) - (now + offset)) / 1000 : 0;

  function commitTime(qid: string | undefined) {
    if (!qid) return;
    const secs = Math.round((Date.now() - viewStart.current) / 1000);
    viewStart.current = Date.now();
    const a = answersRef.current[qid] ?? { a: null, m: false, t: 0 };
    const prev = pending.current[qid];
    pending.current[qid] = { a: a.a, m: a.m, secs: (prev?.secs ?? 0) + secs };
  }
  function setAnswer(qid: string, patch: Partial<ExamAnswer>) {
    setAnswers((cur) => {
      const a = { ...(cur[qid] ?? { a: null, m: false, t: 0 }), ...patch };
      const prev = pending.current[qid];
      pending.current[qid] = { a: a.a, m: a.m, secs: prev?.secs ?? 0 };
      return { ...cur, [qid]: a };
    });
  }
  function go(i: number) { commitTime(q?.id); setIdx(Math.max(0, Math.min(questions.length - 1, i))); setView('question'); flush(); }

  const submit = useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    commitTime(q?.id);
    await flush();
    try { await examApi.submit(sessionId); await kv.del(cacheKey); navigate(`/exam/results/${sessionId}`, { replace: true }); }
    catch (e) { setErr(friendly(e)); setSubmitting(false); }
  }, [submitting, flush, sessionId, cacheKey, q?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (st && remaining <= 0 && !submitting) { toast("Time's up. Your exam was submitted."); submit(); } }, [remaining <= 0]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err && !st) return <main className="page"><ErrorText>{err}</ErrorText><Link to="/exam" className="btn">Back to Exam Day</Link></main>;
  if (!st) return <Loading text="Opening your exam…" />;
  const answeredCount = questions.filter((x) => answers[x.id]?.a !== null && answers[x.id]?.a !== undefined).length;
  const markedCount = questions.filter((x) => answers[x.id]?.m).length;

  return (
    <div className="app exam">
      <header className="exam-bar">
        <span className="head">{NAME[st.portion]} · {view === 'review' ? 'Review' : `Question ${idx + 1} of ${questions.length}`}</span>
        <span className={`exam-timer ${remaining < 300 ? 'low' : ''}`} role="timer" aria-label={`Time remaining ${clock(remaining)}`}><I.Clock size={18} style={{ display: 'inline', verticalAlign: '-3px' }} /> {clock(remaining)}</span>
      </header>
      {!online && <p className="small center" role="status" style={{ margin: '0.5rem 0' }}>Offline. Answers are saved on this device and will be sent when you reconnect. The clock keeps running.</p>}
      <main className="page" id="main" style={{ paddingBottom: '8rem' }}>
        {view === 'question' && q && (
          <>
            <div className="row between">
              <label className="check" style={{ minHeight: 44 }}><input type="checkbox" checked={!!answers[q.id]?.m} onChange={(e) => setAnswer(q.id, { m: e.target.checked })} /> Mark for review</label>
              <div className="row" style={{ gap: 0 }}>
                {st.portion === 'national' && <button className="icon-btn" onClick={() => setCalc((c) => !c)} aria-label="Calculator"><I.Calc /></button>}
                <button className="icon-btn" onClick={() => setFlagOpen(true)} aria-label="Flag this question"><I.Flag /></button>
              </div>
            </div>
            <p className="prompt" style={{ fontWeight: 500 }}>{q.prompt}</p>
            <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="sr-only">Answer choices</legend>
              {q.options.map((o, i) => (
                <label key={i} className="exam-option">
                  <input type="radio" name={`q-${q.id}`} checked={answers[q.id]?.a === i} onChange={() => setAnswer(q.id, { a: i })} />
                  <span><strong>{String.fromCharCode(65 + i)}.</strong> {o}</span>
                </label>
              ))}
            </fieldset>
          </>
        )}
        {view === 'review' && (
          <>
            <p>{answeredCount} of {questions.length} answered · {markedCount} marked · {questions.length - answeredCount} unanswered</p>
            <p className="small muted">Filled squares are answered. A corner mark means marked for review. Tap any number to go to it.</p>
            <div className="exam-grid">
              {questions.map((x, i) => {
                const a = answers[x.id];
                const answered = a?.a !== null && a?.a !== undefined;
                return <button key={x.id} className={`${answered ? 'answered' : ''} ${a?.m ? 'marked' : ''}`} onClick={() => go(i)} aria-label={`Question ${i + 1}, ${answered ? 'answered' : 'unanswered'}${a?.m ? ', marked for review' : ''}`}>{i + 1}</button>;
              })}
            </div>
            <button className="btn block lg mt-lg" onClick={() => setEndOpen(true)}>End exam</button>
          </>
        )}
        <ErrorText>{err}</ErrorText>
      </main>
      {calc && <Calculator onClose={() => setCalc(false)} />}
      <nav className="exam-nav" aria-label="Exam navigation">
        <button className="btn ghost" disabled={idx === 0 && view === 'question'} onClick={() => go(view === 'review' ? idx : idx - 1)}><I.Back size={20} /> {view === 'review' ? 'Return' : 'Previous'}</button>
        <button className="btn ghost grow" onClick={() => { commitTime(q?.id); setView('review'); flush(); }}>Review</button>
        {view === 'question' && (idx < questions.length - 1
          ? <button className="btn" onClick={() => go(idx + 1)}>Next <I.Next size={20} /></button>
          : <button className="btn" onClick={() => { commitTime(q?.id); setView('review'); }}>Finish <I.Next size={20} /></button>)}
      </nav>
      <Sheet open={endOpen} onClose={() => setEndOpen(false)} title="End the exam?">
        <p>{questions.length - answeredCount > 0 ? `You have ${questions.length - answeredCount} unanswered question${questions.length - answeredCount === 1 ? '' : 's'}. Unanswered questions count as wrong.` : 'Every question is answered.'}{markedCount ? ` ${markedCount} marked for review.` : ''}</p>
        <p>Once you end the exam, you can't change answers.</p>
        <button className="btn block lg" disabled={submitting} onClick={submit}>{submitting ? 'Scoring…' : 'End exam and see my score'}</button>
        <button className="btn ghost block mt" onClick={() => setEndOpen(false)}>Keep working</button>
      </Sheet>
      <FlagSheet open={flagOpen} onClose={() => setFlagOpen(false)} onSend={async (note) => {
        try { await syncApi.flag('question', q!.id, note); toast('Flag saved. Reviewers will see it.'); } catch (e) { toast(friendly(e)); }
        setFlagOpen(false);
      }} />
    </div>
  );
}

export function ExamResults({ sessionId, mode }: { sessionId: string; mode: 'results' | 'review' }) {
  const { content } = useStore();
  const [r, setR] = useState<ExamReview | null>(null);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState<'all' | 'wrong'>('wrong');
  useEffect(() => { examApi.review(sessionId).then(setR).catch((e) => setErr(friendly(e))); }, [sessionId]);
  const weakTopics = useMemo(() => (r ? [...r.results.by_topic].filter((t) => t.pct < 75).sort((a, b) => a.pct - b.pct).slice(0, 3) : []), [r]);
  if (err) return <main className="page"><ErrorText>{err}</ErrorText><Link to="/exam" className="btn">Back to Exam Day</Link></main>;
  if (!r || !content) return <Loading text="Scoring…" />;
  const sub = (id: string) => content.subtopics.find((s) => s.id === id)?.title ?? '';
  const pacing = r.results.pacing;

  if (mode === 'review') {
    const items = r.items.filter((x) => filter === 'all' || !x.ok);
    return (
      <main className="page" id="main">
        <Link to={`/exam/results/${sessionId}`} className="btn quiet" style={{ paddingLeft: 0 }}><I.Back size={18} /> Results</Link>
        <h1>Exam review</h1>
        <div className="seg mb" role="group" aria-label="Filter questions">
          <button aria-pressed={filter === 'wrong'} onClick={() => setFilter('wrong')}>Missed ({r.items.filter((x) => !x.ok).length})</button>
          <button aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>All ({r.items.length})</button>
        </div>
        <div className="stack lg">
          {items.map((it) => {
            const n = r.items.indexOf(it) + 1;
            return (
              <article key={it.id} className="card" aria-label={`Question ${n}`}>
                <div className="row between"><span className="kicker">Question {n}{it.pretest ? ' · Unscored pretest' : ''}</span>{it.ok ? <span className="badge ok"><I.Check size={14} /> Correct</span> : <span className="badge bad"><I.X size={14} /> {it.choice === null ? 'Unanswered' : 'Incorrect'}</span>}</div>
                <p className="small muted" style={{ margin: '0.25rem 0' }}>{sub(it.subtopic_id)}</p>
                <p style={{ fontWeight: 600 }}>{it.prompt}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} className="stack">
                  {it.options.map((o, i) => (
                    <li key={i} className="row" style={{ alignItems: 'flex-start', gap: '0.5rem', color: i === it.correct ? 'var(--correct)' : i === it.choice ? 'var(--incorrect)' : undefined }}>
                      {i === it.correct ? <I.Check size={20} aria-label="Correct answer" style={{ flex: 'none' }} /> : i === it.choice ? <I.X size={20} aria-label="Your answer" style={{ flex: 'none' }} /> : <span style={{ width: 20, flex: 'none' }} />}
                      <span style={{ color: 'var(--fg)' }}>{o}{i === it.choice && <em className="small"> (your answer)</em>}{i !== it.correct && it.wrong_explanations[i] && i === it.choice && <span className="small muted" style={{ display: 'block' }}>{it.wrong_explanations[i]}</span>}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt" style={{ marginBottom: 0 }}><strong>Why:</strong> {it.explanation}</p>
                {it.memory_hook && <p className="hook">{it.memory_hook}</p>}
                <p className="tiny muted" style={{ margin: '0.5rem 0 0' }}>{it.seconds}s on this question</p>
              </article>
            );
          })}
          {items.length === 0 && <Empty title="Nothing missed" body="Every scored question was right. Switch to All to review them anyway." />}
        </div>
      </main>
    );
  }

  return (
    <main className="page" id="main">
      <Link to="/exam" className="btn quiet" style={{ paddingLeft: 0 }}><I.Back size={18} /> Exam Day</Link>
      <div className={`card ${r.passed ? 'inverse' : 'outline'} center stack`} style={{ alignItems: 'center' }}>
        <span className="kicker" style={{ color: 'inherit' }}>{NAME[r.portion]} portion</span>
        <p className="num" style={{ fontSize: '4rem', fontWeight: 800, margin: 0, lineHeight: 1 }}>{r.score_pct}%</p>
        <p className="head row" style={{ fontSize: '1.4rem', margin: 0 }}>{r.passed ? <><I.Check /> Passed</> : <><I.X /> Not passed</>}</p>
        <p style={{ margin: 0 }}>{r.scored_correct} of {r.scored_total} scored questions correct. Passing is {r.pass_pct}%.</p>
        <p className="small" style={{ margin: 0, opacity: 0.8 }}>Pretest questions were not scored.</p>
      </div>

      <h2 className="mt-lg">By topic</h2>
      <div className="stack">
        {r.results.by_topic.map((t) => (
          <div key={t.topic}>
            <div className="row between small"><span>{t.pct < 75 ? <I.X size={14} aria-label="Below 75%" style={{ display: 'inline' }} /> : <I.Check size={14} aria-label="75% or better" style={{ display: 'inline' }} />} {t.title}</span><span className="num">{t.correct}/{t.total} · {t.pct}%</span></div>
            <Bar value={t.pct} label={`${t.title} score`} thin />
          </div>
        ))}
      </div>

      <h2 className="mt-lg">Pacing</h2>
      <div className="stat-grid">
        <div className="card stat"><span className="num">{Math.round(pacing.avg_seconds)}s</span><span className="small muted">Your average per question</span></div>
        <div className="card stat"><span className="num">{Math.round(pacing.budget_seconds)}s</span><span className="small muted">Time budget per question</span></div>
      </div>
      <p className="small mt">{pacing.avg_seconds <= pacing.budget_seconds ? 'You stayed inside your time budget.' : 'You ran over your time budget on average. Practice moving on and coming back to marked questions.'}{pacing.slowest_topics.length ? ` Slowest topics: ${pacing.slowest_topics.join(', ')}.` : ''}</p>

      <div className="stack mt-lg">
        <Link to={`/exam/review/${sessionId}`} className="btn block lg">Review every question</Link>
        {weakTopics.length > 0 && <Link to={`/practice?topics=${weakTopics.map((t) => t.topic).join(',')}`} className="btn ghost block">Drill my weak topics</Link>}
      </div>
    </main>
  );
}
