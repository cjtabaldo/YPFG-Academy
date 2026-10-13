// The six exercise types. Each renders the question and reports a result;
// the lesson player handles checking, feedback, hearts and XP.
import { useEffect, useMemo, useState } from 'react';
import type { NumberAnswer, Question, Term } from '../../lib/types';
import { shuffle } from '../../lib/lessonBuilder';
import * as I from '../../ui/icons';

export interface QResult { correct: boolean; choice: number | null; display: string }

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const typeLabel = (q: Question) => ({
  mcq: 'Exam-style question', scenario: 'What should the agent do?', tf: 'True or false', number: 'Fill in the number', order: 'Put in order',
}[q.exercise_type]);

// ---------------------------------------------------------------- multiple choice + scenario
export function ChoiceQuestion({ q, locked, picked, onPick, result }: {
  q: Question; locked: boolean; picked: number | null; onPick: (originalIndex: number) => void; result: QResult | null;
}) {
  const order = useMemo(() => shuffle(q.options.map((_, i) => i)), [q.id]);
  return (
    <div className="options" role="radiogroup" aria-label="Answer choices">
      {order.map((orig, i) => {
        const isCorrect = orig === q.correct;
        const cls = result ? (isCorrect ? 'correct' : orig === picked ? 'wrong' : 'dim') : '';
        return (
          <button key={orig} type="button" role="radio" aria-checked={picked === orig} className={`option ${cls}`} disabled={locked}
            onClick={() => onPick(orig)}>
            <span className="key" aria-hidden="true">{LETTERS[i]}</span>
            <span className="grow">{q.options[orig]}</span>
            {result && isCorrect && <span className="mark"><I.Check aria-hidden /><span className="sr-only">Correct answer</span></span>}
            {result && !isCorrect && orig === picked && <span className="mark"><I.X aria-hidden /><span className="sr-only">Your answer, incorrect</span></span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- true / false
export function TrueFalse({ q, locked, picked, onPick, result }: { q: Question; locked: boolean; picked: number | null; onPick: (i: number) => void; result: QResult | null }) {
  return (
    <div className="options" role="radiogroup" aria-label="True or false">
      {[0, 1].map((i) => {
        const isCorrect = i === q.correct;
        const cls = result ? (isCorrect ? 'correct' : i === picked ? 'wrong' : 'dim') : '';
        return (
          <button key={i} type="button" role="radio" aria-checked={picked === i} className={`option ${cls}`} disabled={locked} onClick={() => onPick(i)} style={{ minHeight: 64, fontSize: '1.15rem', fontFamily: 'var(--font-head)', fontWeight: 700 }}>
            <span className="grow">{i === 0 ? 'True' : 'False'}</span>
            {result && isCorrect && <span className="mark"><I.Check /><span className="sr-only">Correct answer</span></span>}
            {result && !isCorrect && i === picked && <span className="mark"><I.X /><span className="sr-only">Your answer, incorrect</span></span>}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- number with keypad
export function NumberEntry({ q, value, onChange, locked, onCalc }: { q: Question; value: string; onChange: (v: string) => void; locked: boolean; onCalc: () => void }) {
  const unit = (q.correct as NumberAnswer).unit ?? '';
  const press = (k: string) => {
    if (locked) return;
    if (k === '⌫') onChange(value.slice(0, -1));
    else if (k === '.' && value.includes('.')) return;
    else if (value.replace('.', '').length < 12) onChange(value + k);
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (/^[0-9.]$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('⌫');
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  const isMoney = /\$|dollar/i.test(unit);
  return (
    <div className="stack">
      <div className="num-display" aria-live="polite" aria-label={`Your answer: ${value || 'empty'} ${unit}`}>
        <span>{isMoney && '$'}{value ? Number(value.split('.')[0] || 0).toLocaleString() + (value.includes('.') ? '.' + value.split('.')[1] : '') : <span className="muted">0</span>}</span>
        <span className="small muted">{isMoney ? '' : unit}</span>
      </div>
      <div className="keypad" aria-label="Number keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'].map((k) => (
          <button key={k} type="button" disabled={locked} onClick={() => press(k)} aria-label={k === '⌫' ? 'Delete' : k === '.' ? 'Decimal point' : k}>{k}</button>
        ))}
      </div>
      <button type="button" className="btn ghost sm" onClick={onCalc} style={{ alignSelf: 'flex-start' }}><I.Calc size={20} /> Calculator</button>
    </div>
  );
}
export function checkNumber(q: Question, value: string): boolean {
  const a = q.correct as NumberAnswer;
  const v = Number(value);
  return value !== '' && Number.isFinite(v) && Math.abs(v - a.value) <= (a.tolerance ?? 0) + 1e-9;
}

// ---------------------------------------------------------------- put in order
export function OrderItems({ q, picked, onChange, locked, result }: { q: Question; picked: number[]; onChange: (p: number[]) => void; locked: boolean; result: QResult | null }) {
  const bank = useMemo(() => shuffle(q.options.map((_, i) => i)), [q.id]);
  return (
    <div className="stack">
      <div className="order-list" aria-label="Your order">
        {q.options.map((_, pos) => {
          const item = picked[pos];
          const ok = result ? item === pos : null;
          return (
            <div key={pos} className="order-slot" style={result ? { borderStyle: 'solid', borderColor: ok ? 'var(--correct)' : 'var(--incorrect)' } : undefined}>
              <span className="num head" aria-hidden="true">{pos + 1}</span>
              {item !== undefined ? (
                <button type="button" className="grow" style={{ background: 'none', border: 0, textAlign: 'left', minHeight: 44, cursor: locked ? 'default' : 'pointer' }} disabled={locked}
                  onClick={() => onChange(picked.filter((x) => x !== item))} aria-label={`Position ${pos + 1}: ${q.options[item]}. Tap to remove.`}>
                  {q.options[item]}
                </button>
              ) : <span className="muted small grow">Tap an item below</span>}
              {result && (ok ? <I.Check aria-label="Correct position" /> : <I.X aria-label="Wrong position" />)}
            </div>
          );
        })}
      </div>
      {result && !result.correct && (
        <div className="card small"><strong>Correct order:</strong><ol className="steps">{q.options.map((o) => <li key={o}>{o}</li>)}</ol></div>
      )}
      {!locked && (
        <div className="options" aria-label="Items to place">
          {bank.filter((i) => !picked.includes(i)).map((i) => (
            <button key={i} type="button" className="option" onClick={() => onChange([...picked, i])}>{q.options[i]}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- match pairs
export function MatchPairs({ terms, onDone }: { terms: Term[]; onDone: (r: { mistakes: number; missedTerms: string[] }) => void }) {
  const left = useMemo(() => shuffle(terms), [terms]);
  const right = useMemo(() => shuffle(terms), [terms]);
  const [sel, setSel] = useState<string | null>(null);
  const [selDef, setSelDef] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [missed, setMissed] = useState<string[]>([]);
  const [shake, setShake] = useState<string | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [last, setLast] = useState<'ok' | 'bad' | null>(null);

  useEffect(() => {
    if (!sel || !selDef) return;
    if (sel === selDef) { setMatched((m) => [...m, sel]); setLast('ok'); }
    else {
      setLast('bad');
      setMistakes((n) => n + 1);
      setMissed((m) => [...new Set([...m, sel, selDef])]);
      setShake(selDef);
      setTimeout(() => setShake(null), 400);
    }
    setSel(null); setSelDef(null);
  }, [sel, selDef]);
  useEffect(() => { if (matched.length === terms.length) onDone({ mistakes, missedTerms: missed }); }, [matched.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
    <p className="small row" role="status" aria-live="polite" style={{ minHeight: 28, margin: '0 0 0.5rem', color: last === 'bad' ? 'var(--incorrect)' : last === 'ok' ? 'var(--correct)' : 'var(--muted)' }}>
      {last === 'ok' && <><I.Check size={20} /> Matched.</>}
      {last === 'bad' && <><I.X size={20} /> Not a match. Try again.</>}
      {!last && <>Tap a term, then its definition.</>}
    </p>
    <div className="match" aria-label="Match each term to its definition">
      <div className="stack" style={{ gap: '0.6rem' }} role="group" aria-label="Terms">
        {left.map((t) => (
          <button key={t.id} type="button" className={`option ${matched.includes(t.id) ? 'matched' : ''}`} aria-pressed={sel === t.id}
            disabled={matched.includes(t.id)} onClick={() => setSel(t.id)} style={{ fontFamily: 'var(--font-head)', fontWeight: 700 }}>
            {t.term}{matched.includes(t.id) && <span className="sr-only"> (matched)</span>}
          </button>
        ))}
      </div>
      <div className="stack" style={{ gap: '0.6rem' }} role="group" aria-label="Definitions">
        {right.map((t) => (
          <button key={t.id} type="button" className={`option ${matched.includes(t.id) ? 'matched' : ''} ${shake === t.id ? 'shake' : ''}`} aria-pressed={selDef === t.id}
            disabled={matched.includes(t.id) || !sel} onClick={() => setSelDef(t.id)}>
            {t.definition}
          </button>
        ))}
      </div>
    </div>
    </>
  );
}
