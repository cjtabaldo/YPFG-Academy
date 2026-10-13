// Runs a study session: Concept Cards first, then exercises with instant
// feedback, confidence checks, hearts, and XP.
import { useEffect, useMemo, useRef, useState } from 'react';
import { HEARTS, XP } from '../../config/app';
import { syncApi } from '../../lib/api';
import { outbox } from '../../lib/db';
import type { Exercise, Session } from '../../lib/lessonBuilder';
import { sounds } from '../../lib/sound';
import { stop as stopSpeech } from '../../lib/tts';
import type { Card, NumberAnswer, Question } from '../../lib/types';
import { useStore } from '../../state/store';
import { Bar, Calculator, ListenBar, Mascot, Sheet, Unverified, toast, type MascotState } from '../../ui/common';
import * as I from '../../ui/icons';
import { navigate } from '../../ui/router';
import { ChoiceQuestion, MatchPairs, NumberEntry, OrderItems, TrueFalse, checkNumber, typeLabel, type QResult } from './Exercises';

export type Mode = 'lesson' | 'review' | 'practice' | 'placement';
export interface SessionResult { correct: number; total: number; mistakes: number; seconds: number; perfect: boolean; xp: number; outOfHearts: boolean }

const LETTERS = ['A', 'B', 'C', 'D'];
const CHEERS = ['Correct.', 'Nailed it.', "That's the one.", 'Exactly right.', 'Clean.', 'Yes.'];
const MISSES = ['Not quite.', 'Close, but no.', 'Not this time.', "That's a trap answer."];
const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)];

export function LessonPlayer({ title, session, mode, context, onExit, onFinish }: {
  title: string; session: Session; mode: Mode; context: Record<string, unknown>;
  onExit: () => void; onFinish: (r: SessionResult) => void;
}) {
  const { record, derived, prefs, setPrefs, isStaff, online } = useStore();
  const usesHearts = (mode === 'lesson' || mode === 'review') && !prefs.heartsUnlimited;
  const [step, setStep] = useState(0); // cards first, then exercises
  const cards = session.cards, exercises = session.exercises;
  const totalSteps = cards.length + exercises.length;
  const isCard = step < cards.length;
  const ex: Exercise | undefined = isCard ? undefined : exercises[step - cards.length];

  const [picked, setPicked] = useState<number | null>(null);
  const [numVal, setNumVal] = useState('');
  const [order, setOrder] = useState<number[]>([]);
  const [result, setResult] = useState<QResult | null>(null);
  const [conf, setConf] = useState<'sure' | 'guess' | null>(null);
  const [matchDone, setMatchDone] = useState<{ mistakes: number } | null>(null);
  const [mascot, setMascot] = useState<MascotState>('idle');
  const [calc, setCalc] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const [quitOpen, setQuitOpen] = useState(false);
  const [noHearts, setNoHearts] = useState(false);
  const stats = useRef({ correct: 0, total: 0, mistakes: 0, start: Date.now() });
  const heartsLeft = useRef(derived.hearts);
  const [heartsView, setHeartsView] = useState(derived.hearts);

  useEffect(() => { setPicked(null); setNumVal(''); setOrder([]); setResult(null); setConf(null); setMatchDone(null); setMascot('idle'); setCalc(false); stopSpeech(); }, [step]);
  useEffect(() => () => stopSpeech(), []);
  useEffect(() => {
    if (usesHearts && derived.hearts <= 0 && step === 0) setNoHearts(true);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const q = ex?.kind === 'question' ? ex.q : null;
  const examStyle = q && (q.exercise_type === 'mcq' || q.exercise_type === 'scenario');
  const canCheck = q ? (q.exercise_type === 'number' ? numVal !== '' : q.exercise_type === 'order' ? order.length === q.options.length : picked !== null) : false;

  const listenText = useMemo(() => {
    if (isCard) { const c = cards[step]; return `${c.title}. ${c.body} For example: ${c.example} Remember: ${c.memory_hook}`; }
    if (q) {
      if (q.exercise_type === 'mcq' || q.exercise_type === 'scenario') return `${q.prompt} ${q.options.map((o, i) => `Option ${LETTERS[i]}: ${o}.`).join(' ')}`;
      if (q.exercise_type === 'tf') return `True or false. ${q.prompt}`;
      if (q.exercise_type === 'order') return `${q.prompt} Items: ${q.options.join('. ')}.`;
      return q.prompt;
    }
    if (ex?.kind === 'match') return `Match each term to its definition. ${ex.terms.map((t) => t.term).join('. ')}.`;
    return '';
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loseHeart() {
    if (!usesHearts) return;
    heartsLeft.current = Math.max(0, heartsLeft.current - 1);
    setHeartsView(heartsLeft.current);
    await record('heart_lost', { lesson: context.lesson ?? null });
  }

  async function check(confidence: 'sure' | 'guess' | null) {
    if (!q) return;
    let correct = false, choice: number | null = null;
    if (q.exercise_type === 'number') correct = checkNumber(q, numVal);
    else if (q.exercise_type === 'order') correct = order.every((v, i) => v === i);
    else { choice = picked; correct = picked === q.correct; }
    const r: QResult = { correct, choice, display: '' };
    setResult(r); setConf(confidence);
    stats.current.total++;
    if (correct) stats.current.correct++; else stats.current.mistakes++;
    setMascot(correct ? 'correct' : 'wrong');
    if (prefs.sound) (correct ? sounds.correct : sounds.wrong)();
    await record('answer', {
      q: q.id, v: q.version, c: correct, g: confidence === 'guess', conf: confidence, ch: choice, s: q.subtopic_id, t: q.topic_id,
      mode, lesson: context.lesson ?? null, review: ex?.kind === 'question' && !!ex.review,
    });
    if (!correct) await loseHeart();
  }

  async function finishMatch(r: { mistakes: number; missedTerms: string[] }) {
    if (ex?.kind !== 'match') return;
    setMatchDone({ mistakes: r.mistakes });
    stats.current.total++;
    if (r.mistakes === 0) stats.current.correct++; else stats.current.mistakes++;
    setMascot(r.mistakes === 0 ? 'correct' : 'wrong');
    if (prefs.sound) (r.mistakes === 0 ? sounds.correct : sounds.wrong)();
    for (const t of ex.terms) await record('term_seen', { term: t.id, c: !r.missedTerms.includes(t.id), via: 'match' });
    if (r.mistakes) await loseHeart();
  }

  async function next() {
    if (isCard) await record('card_seen', { card: cards[step].id });
    if (usesHearts && heartsLeft.current <= 0 && !isCard) { setNoHearts(true); return; }
    if (step + 1 >= totalSteps) {
      const s = stats.current, seconds = Math.round((Date.now() - s.start) / 1000);
      const perfect = s.mistakes === 0 && s.total > 0;
      let xp = mode === 'review' ? XP.unitReview : mode === 'practice' ? XP.practice : mode === 'placement' ? 0 : XP.lesson;
      if (perfect && mode !== 'placement') xp += XP.perfectBonus;
      if (mode !== 'placement' && s.total > 0 && seconds / s.total <= XP.speedSecondsPerExercise) xp += XP.speedBonus;
      if (prefs.sound) sounds.complete();
      onFinish({ correct: s.correct, total: s.total, mistakes: s.mistakes, seconds, perfect, xp, outOfHearts: false });
      return;
    }
    setStep((x) => x + 1);
  }

  async function sendFlag(note: string) {
    const item = isCard ? { type: 'card', id: cards[step].id } : q ? { type: 'question', id: q.id } : null;
    if (!item) return;
    try {
      if (!online) throw new Error('offline');
      await syncApi.flag(item.type, item.id, note);
      toast('Thanks. A reviewer will take a look.');
    } catch {
      await outbox.add({ id: crypto.randomUUID(), type: 'flag', body: { item_type: item.type, item_id: item.id, note }, at: new Date().toISOString() });
      toast("Saved. We'll send it when you're back online.");
    }
    setFlagOpen(false);
  }

  const answered = !!result || !!matchDone;
  const progress = step + (answered ? 1 : 0);

  return (
    <div className="app">
      <div className="lesson-top">
        <button className="icon-btn" onClick={() => setQuitOpen(true)} aria-label="Quit session"><I.Close /></button>
        <div className="grow"><Bar value={progress} max={totalSteps} label={`${title}: step ${Math.min(progress + 1, totalSteps)} of ${totalSteps}`} /></div>
        {usesHearts && <span className="hearts" aria-label={`${heartsView} hearts left`}><I.HeartFill size={22} /> {heartsView}</span>}
        {(mode === 'practice' || mode === 'placement' || prefs.heartsUnlimited) && <span className="hearts" aria-label="Unlimited hearts"><I.HeartFill size={22} /> ∞</span>}
        <button className="icon-btn" onClick={() => setFlagOpen(true)} aria-label="Flag this question"><I.Flag /></button>
      </div>

      <main className="lesson-body" id="main">
        {prefs.listen && listenText && <div className="mb"><ListenBar text={listenText} rate={prefs.listenRate ?? 1} onRate={(r) => setPrefs({ listenRate: r })} /></div>}

        {isCard && <ConceptCard card={cards[step]} index={step} count={cards.length} showStatus={isStaff} />}

        {q && (
          <div>
            <div className="row between">
              <span className="kicker">{ex?.kind === 'question' && ex.review ? 'Review · ' : ''}{typeLabel(q)}</span>
              {isStaff && <Unverified status={q.status} />}
            </div>
            <p className="prompt">{q.prompt}</p>
            {(q.exercise_type === 'mcq' || q.exercise_type === 'scenario') && <ChoiceQuestion q={q} locked={!!result} picked={picked} onPick={setPicked} result={result} />}
            {q.exercise_type === 'tf' && <TrueFalse q={q} locked={!!result} picked={picked} onPick={setPicked} result={result} />}
            {q.exercise_type === 'number' && <NumberEntry q={q} value={numVal} onChange={setNumVal} locked={!!result} onCalc={() => setCalc(true)} />}
            {q.exercise_type === 'order' && <OrderItems q={q} picked={order} onChange={setOrder} locked={!!result} result={result} />}
          </div>
        )}

        {ex?.kind === 'match' && (
          <div>
            <span className="kicker">Match pairs</span>
            <p className="prompt">Match each term to its definition.</p>
            <MatchPairs terms={ex.terms} onDone={finishMatch} />
          </div>
        )}
      </main>

      {calc && <Calculator onClose={() => setCalc(false)} />}

      <div className="footer-bar">
        <div className="footer-inner">
          {result && q && <Feedback q={q} result={result} conf={conf} mascot={mascot} numVal={numVal} />}
          {matchDone && (
            <div className={`feedback ${matchDone.mistakes ? 'bad' : 'ok'}`} role="status" aria-live="polite">
              <h3>{matchDone.mistakes ? <><I.X /> {matchDone.mistakes} mismatch{matchDone.mistakes > 1 ? 'es' : ''}</> : <><I.Check /> All matched, no misses.</>}</h3>
              <p className="fb-body small" style={{ margin: 0 }}>{matchDone.mistakes ? "Terms you missed come back in a later lesson." : 'Those definitions are locked in.'}</p>
            </div>
          )}
          {isCard && <button className="btn block lg" onClick={next}>{step + 1 < cards.length ? 'Next card' : "Got it. Let's practice"}</button>}
          {q && !result && examStyle && (
            canCheck ? (
              <div className="stack" style={{ gap: '0.4rem' }}>
                <span className="small muted center">How confident are you?</span>
                <div className="confidence">
                  <button className="btn lg" onClick={() => check('sure')}>Sure</button>
                  <button className="btn lg ghost" onClick={() => check('guess')}>Guessing</button>
                </div>
              </div>
            ) : <button className="btn block lg" disabled>Pick an answer</button>
          )}
          {q && !result && !examStyle && <button className="btn block lg" disabled={!canCheck} onClick={() => check(null)}>Check</button>}
          {answered && <button className="btn block lg" onClick={next} autoFocus>{step + 1 >= totalSteps ? 'Finish' : 'Continue'}</button>}
        </div>
      </div>

      <FlagSheet open={flagOpen} onClose={() => setFlagOpen(false)} onSend={sendFlag} />
      <Sheet open={quitOpen} onClose={() => setQuitOpen(false)} title="Leave this session?">
        <p>Your answers so far are saved. You'll need to restart this {mode === 'practice' ? 'practice' : mode === 'placement' ? 'placement check' : 'lesson'} to finish it.</p>
        <div className="stack">
          <button className="btn block" onClick={() => setQuitOpen(false)}>Keep going</button>
          <button className="btn block ghost" onClick={onExit}>Leave</button>
        </div>
      </Sheet>
      <Sheet open={noHearts} onClose={onExit} title="Out of hearts">
        <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Mascot state="wrong" />
          <p>Hearts come back one every {HEARTS.refillMinutes / 60} hours{derived.nextHeartAt ? `. Next one at ${new Date(derived.nextHeartAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}. A Practice session refills all {HEARTS.max} right now.</p>
          <button className="btn block" onClick={() => navigate('/practice')}>Practice to refill</button>
          <button className="btn block ghost" onClick={() => { setPrefs({ heartsUnlimited: true }); setNoHearts(false); heartsLeft.current = HEARTS.max; }}>Turn on unlimited hearts</button>
          <button className="btn quiet" onClick={onExit}>Come back later</button>
        </div>
      </Sheet>
    </div>
  );
}

function ConceptCard({ card, index, count, showStatus }: { card: Card; index: number; count: number; showStatus: boolean }) {
  return (
    <article className="concept" aria-labelledby={`card-${card.id}`}>
      <div className="row between"><span className="kicker">Concept {index + 1} of {count}</span>{showStatus && <Unverified status={card.status} />}</div>
      <h2 id={`card-${card.id}`} className="mt">{card.title}</h2>
      <p style={{ fontSize: '1.08rem' }}>{card.body}</p>
      <div className="example"><span className="kicker">Nevada example</span><p style={{ margin: '0.25rem 0 0' }}>{card.example}</p></div>
      <p className="hook" style={{ margin: 0 }}><span className="sr-only">Memory hook: </span>{card.memory_hook}</p>
    </article>
  );
}

function Feedback({ q, result, conf, mascot, numVal }: { q: Question; result: QResult; conf: 'sure' | 'guess' | null; mascot: MascotState; numVal: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  const headline = useMemo(() => (result.correct ? pick(CHEERS) : pick(MISSES)), [result]);
  const isChoice = q.exercise_type === 'mcq' || q.exercise_type === 'scenario';
  const correctText = isChoice ? q.options[q.correct as number] : q.exercise_type === 'tf' ? (q.correct === 0 ? 'True' : 'False') : q.exercise_type === 'number' ? `${(q.correct as NumberAnswer).value.toLocaleString()} ${(q.correct as NumberAnswer).unit ?? ''}` : null;
  return (
    <div ref={ref} tabIndex={-1} className={`feedback ${result.correct ? 'ok' : 'bad'}`} role="status" aria-live="assertive">
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h3>{result.correct ? <I.Check aria-hidden /> : <I.X aria-hidden />}<span>{result.correct ? 'Correct.' : 'Incorrect.'}</span> <span className="small" style={{ fontWeight: 600 }}>{headline !== 'Correct.' ? headline : ''}</span></h3>
          {result.correct && conf === 'guess' && <p className="fb-body small" style={{ margin: '0 0 0.35rem' }}><strong>You guessed right.</strong> We'll bring this one back so it sticks.</p>}
          {!result.correct && correctText && <p className="fb-body" style={{ margin: '0 0 0.35rem' }}><strong>Answer:</strong> {correctText}</p>}
          {q.exercise_type === 'number' && !result.correct && <p className="fb-body small" style={{ margin: '0 0 0.35rem' }}>You entered {numVal || 'nothing'}.</p>}
          <p className="fb-body" style={{ margin: 0 }}>{q.explanation}</p>
        </div>
        <Mascot state={mascot} size="sm" />
      </div>
      {q.exercise_type === 'number' && (
        <div className="fb-body mt small">
          {q.formula && <p style={{ margin: 0 }}><strong>Formula:</strong> {q.formula}</p>}
          <ol className="steps">{q.worked_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
        </div>
      )}
      {!result.correct && isChoice && (
        <ul className="why-wrong fb-body" aria-label="Why the other options are wrong">
          {q.options.map((o, i) => i === q.correct ? null : (
            <li key={i}><I.X size={18} aria-hidden style={{ flex: 'none', marginTop: 2 }} /><span><strong>{o}</strong>: {q.wrong_explanations[i]}</span></li>
          ))}
        </ul>
      )}
      {!result.correct && q.exercise_type === 'tf' && result.choice !== null && q.wrong_explanations[result.choice] && (
        <p className="fb-body small mt" style={{ margin: '0.5rem 0 0' }}>{q.wrong_explanations[result.choice]}</p>
      )}
      {!result.correct && q.memory_hook && <p className="hook"><span className="sr-only">Memory hook: </span>{q.memory_hook}</p>}
    </div>
  );
}

export function FlagSheet({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (note: string) => void }) {
  const [note, setNote] = useState('');
  return (
    <Sheet open={open} onClose={onClose} title="Flag this question">
      <p className="small muted">Something wrong, unclear, or out of date? Tell us what you noticed. A reviewer reads every flag.</p>
      <label className="field">What's the problem?
        <textarea className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Example: Option C also seems correct because…" maxLength={1000} />
      </label>
      <button className="btn block mt" disabled={!note.trim()} onClick={() => { onSend(note.trim()); setNote(''); }}>Send flag</button>
    </Sheet>
  );
}
