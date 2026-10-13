// Review queue, editors, exam form builder, analytics and coverage
// (Admin and Reviewer).
import { useEffect, useMemo, useState } from 'react';
import { friendly, staffApi, type CoverageRow, type FlagRow, type QuestionStat } from '../../lib/api';
import { shuffle } from '../../lib/lessonBuilder';
import { formatDay, formatDateTime } from '../../lib/time';
import type { Card, ExamForm, ExerciseType, NumberAnswer, Portion, Question, Term } from '../../lib/types';
import { useStore } from '../../state/store';
import { Empty, ErrorText, Sheet, Unverified, toast } from '../../ui/common';
import * as I from '../../ui/icons';

type Kind = 'question' | 'card' | 'term';
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

function useBank() {
  const [questions, setQ] = useState<Question[] | null>(null);
  const [cards, setC] = useState<Card[] | null>(null);
  const [terms, setT] = useState<Term[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => Promise.all([staffApi.allQuestions(), staffApi.allCards(), staffApi.allTerms()])
    .then(([q, c, t]) => { setQ(q); setC(c); setT(t); }).catch((e) => setErr(friendly(e)));
  useEffect(() => { load(); }, []);
  return { questions, cards, terms, err, reload: load };
}

// ---------------------------------------------------------------- review queue
export function ReviewQueue() {
  const { questions, cards, terms, err, reload } = useBank();
  const { profile, reloadContent } = useStore();
  const [flags, setFlags] = useState<FlagRow[] | null>(null);
  const [tab, setTab] = useState<'flags' | 'questions' | 'exam' | 'cards' | 'terms'>('flags');
  const [edit, setEdit] = useState<{ kind: Kind; item: Question | Card | Term } | null>(null);
  useEffect(() => { staffApi.flags().then(setFlags).catch(() => undefined); }, []);
  const openFlags = flags?.filter((f) => f.status === 'open') ?? [];
  const uq = questions?.filter((q) => q.status === 'unverified' && q.pool === 'lesson') ?? [];
  const ue = questions?.filter((q) => q.status === 'unverified' && q.pool === 'exam') ?? [];
  const uc = cards?.filter((c) => c.status === 'unverified') ?? [];
  const ut = terms?.filter((t) => t.status === 'unverified') ?? [];

  async function setStatus(kind: Kind, id: string, status: 'verified' | 'rejected') {
    try {
      await staffApi.setStatus(kind === 'question' ? 'questions' : kind === 'card' ? 'concept_cards' : 'terms', id, status, profile!.id);
      toast(status === 'verified' ? 'Verified.' : 'Rejected.');
      await reload(); reloadContent();
    } catch (e) { toast(friendly(e)); }
  }
  const tabs: Array<[typeof tab, string, number]> = [['flags', 'Flags', openFlags.length], ['questions', 'Lesson questions', uq.length], ['exam', 'Exam questions', ue.length], ['cards', 'Concept Cards', uc.length], ['terms', 'Terms', ut.length]];
  const find = (f: FlagRow) => f.item_type === 'question' ? questions?.find((q) => q.id === f.item_id) : f.item_type === 'card' ? cards?.find((c) => c.id === f.item_id) : terms?.find((t) => t.id === f.item_id);
  return (
    <div>
      <ErrorText>{err}</ErrorText>
      <div className="seg mb" role="group" aria-label="Queue">{tabs.map(([k, l, n]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l} ({n})</button>)}</div>
      {!questions && <p className="muted">Loading…</p>}
      {tab === 'flags' && (openFlags.length === 0 ? <Empty title="No open flags" body="When anyone flags a question or card, it lands here with their note." /> : (
        <div className="stack">
          {openFlags.map((f) => {
            const item = find(f);
            return (
              <div key={f.id} className="card stack">
                <div className="row between"><span className="kicker">{f.item_type} · {f.item_id}</span><span className="tiny muted">{formatDateTime(f.created_at)}</span></div>
                <p style={{ margin: 0 }}><strong>Note:</strong> {f.note}</p>
                {item && <Preview kind={f.item_type} item={item} />}
                <div className="row wrap">
                  {item && <button className="btn sm" onClick={() => setEdit({ kind: f.item_type, item })}><I.Edit size={18} /> Edit</button>}
                  <button className="btn sm ghost" onClick={async () => { await staffApi.resolveFlag(f.id, profile!.id); setFlags(await staffApi.flags()); toast('Flag resolved.'); }}>Mark resolved</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
      {tab !== 'flags' && (() => {
        const list: Array<{ kind: Kind; item: Question | Card | Term }> =
          tab === 'questions' ? uq.map((item) => ({ kind: 'question', item })) : tab === 'exam' ? ue.map((item) => ({ kind: 'question', item }))
            : tab === 'cards' ? uc.map((item) => ({ kind: 'card', item })) : ut.map((item) => ({ kind: 'term', item }));
        if (!list.length) return <Empty title="All caught up" body="Nothing here is waiting for review." />;
        return (
          <div className="stack">
            <p className="small muted">{list.length} waiting. Read each one as the exam would. Verify only what you'd stake a student's score on.</p>
            {list.slice(0, 50).map(({ kind, item }) => (
              <div key={item.id} className="card stack">
                <Preview kind={kind} item={item} />
                <div className="row wrap">
                  <button className="btn sm" onClick={() => setStatus(kind, item.id, 'verified')}><I.Check size={18} /> Verify</button>
                  <button className="btn sm ghost" onClick={() => setEdit({ kind, item })}><I.Edit size={18} /> Edit</button>
                  <button className="btn sm quiet" onClick={() => setStatus(kind, item.id, 'rejected')}>Reject</button>
                </div>
              </div>
            ))}
            {list.length > 50 && <p className="small muted">Showing the first 50. Verify these to see more.</p>}
          </div>
        );
      })()}
      {edit && <Editor kind={edit.kind} item={edit.item} terms={terms ?? []} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); reloadContent(); }} />}
    </div>
  );
}

function Preview({ kind, item }: { kind: Kind; item: Question | Card | Term }) {
  const { content } = useStore();
  const sub = content?.subtopics.find((s) => s.id === (item as Question).subtopic_id)?.title;
  if (kind === 'term') { const t = item as Term; return <div><div className="row between"><strong>{t.term}</strong><Unverified status={t.status} /></div><p style={{ margin: 0 }}>{t.definition}</p><p className="tiny muted" style={{ margin: 0 }}>{t.subtopic_id} {sub}</p></div>; }
  if (kind === 'card') {
    const c = item as Card;
    return <div><div className="row between"><strong>{c.title}</strong><Unverified status={c.status} /></div><p style={{ margin: '0.25rem 0' }}>{c.body}</p><p className="small" style={{ margin: 0 }}><em>Example:</em> {c.example}</p><p className="small" style={{ margin: 0 }}><em>Hook:</em> {c.memory_hook}</p><p className="tiny muted" style={{ margin: 0 }}>{c.subtopic_id} {sub} · v{c.version} · {words(c.body) + words(c.example) + words(c.memory_hook)} words</p></div>;
  }
  const q = item as Question;
  const correct = q.exercise_type === 'number' ? `${(q.correct as NumberAnswer).value} ${(q.correct as NumberAnswer).unit ?? ''}` : q.exercise_type === 'order' ? 'In the order listed' : q.options[q.correct as number];
  return (
    <div>
      <div className="row between"><span className="kicker">{q.pool === 'exam' ? `Exam Pool${q.exam_form_id ? ` · ${q.exam_form_id}` : ''}${q.is_pretest ? ' · pretest' : ''}` : 'Lesson Pool'} · {q.exercise_type} · {q.level} · difficulty {q.difficulty}</span><Unverified status={q.status} /></div>
      <p style={{ fontWeight: 600, margin: '0.35rem 0' }}>{q.prompt}</p>
      {q.exercise_type !== 'number' && <ol type={q.exercise_type === 'order' ? '1' : 'A'} style={{ margin: 0 }}>{q.options.map((o, i) => <li key={i} style={{ fontWeight: i === q.correct ? 700 : 400 }}>{o}{i === q.correct && q.exercise_type !== 'order' && <> <I.Check size={14} style={{ display: 'inline' }} aria-label="correct" /></>}{q.wrong_explanations[i] && i !== q.correct && <span className="tiny muted" style={{ display: 'block' }}>{q.wrong_explanations[i]}</span>}</li>)}</ol>}
      <p className="small" style={{ margin: '0.35rem 0 0' }}><strong>Answer:</strong> {correct}. <strong>Why:</strong> {q.explanation}</p>
      {q.formula && <p className="small" style={{ margin: 0 }}><strong>Formula:</strong> {q.formula}</p>}
      {q.worked_steps.length > 0 && <ol className="small" style={{ margin: 0 }}>{q.worked_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>}
      <p className="small" style={{ margin: 0 }}><strong>Hook:</strong> {q.memory_hook}</p>
      <p className="tiny muted" style={{ margin: 0 }}>{q.id} · {q.subtopic_id} {sub} · v{q.version} · {q.citation ?? 'no citation'} · {q.outline_version}</p>
    </div>
  );
}

// ---------------------------------------------------------------- editor
function Editor({ kind, item, terms, onClose, onSaved, isNew = false }: { kind: Kind; item: Partial<Question & Card & Term>; terms: Term[]; onClose: () => void; onSaved: () => void; isNew?: boolean }) {
  const { content, profile } = useStore();
  const [d, setD] = useState<Record<string, unknown>>(() => JSON.parse(JSON.stringify(item)));
  const [err, setErr] = useState('');
  const [history, setHistory] = useState<Array<{ version: number; snapshot: Question; replaced_at: string }> | null>(null);
  const set = (k: string, v: unknown) => setD((x) => ({ ...x, [k]: v }));
  const sub = content?.subtopics.find((s) => s.id === d.subtopic_id);
  const topic = content?.topics.find((t) => t.id === sub?.topic_id);
  const type = d.exercise_type as ExerciseType | undefined;
  const opts = (d.options as string[]) ?? [];
  const wrong = (d.wrong_explanations as string[]) ?? [];

  function validate(): string {
    if (!d.subtopic_id) return 'Pick a subtopic.';
    if (kind === 'term') return !d.term || !d.definition ? 'A term needs a name and a definition.' : '';
    if (kind === 'card') {
      if (!d.title || !d.body || !d.example || !d.memory_hook) return 'Fill in title, explanation, Nevada example and memory hook.';
      const w = words(String(d.body)) + words(String(d.example)) + words(String(d.memory_hook));
      return w >= 80 ? `Concept Cards must be under 80 words. This one is ${w}.` : '';
    }
    if (!d.prompt || !d.explanation || !d.memory_hook || !d.fact_key) return 'Fill in the question, explanation, memory hook and fact key.';
    if (type === 'mcq' || type === 'scenario') {
      if (opts.length !== 4 || opts.some((o) => !o.trim())) return 'Multiple choice needs exactly 4 options.';
      if (opts.some((_, i) => i !== d.correct && !wrong[i]?.trim())) return 'Explain why each wrong option is wrong.';
    }
    if (type === 'number' && !Number.isFinite(Number((d.correct as NumberAnswer)?.value))) return 'Enter the numeric answer.';
    if (type === 'number' && (!d.formula || !(d.worked_steps as string[])?.length)) return 'Math questions need a formula and worked steps.';
    if (type === 'order' && opts.filter((o) => o.trim()).length < 3) return 'Put-in-order needs at least 3 items.';
    return '';
  }

  async function save(status?: 'verified' | 'rejected') {
    const v = validate();
    if (v && status !== 'rejected') { setErr(v); return; }
    setErr('');
    const base: Record<string, unknown> = { ...d };
    if (status) { base.status = status; base.reviewed_by = profile!.id; base.reviewed_at = new Date().toISOString(); }
    else if (isNew) base.status = 'unverified';
    base.outline_version = base.outline_version ?? content!.settings.outline_version;
    for (const k of ['created_at', 'updated_at', 'version']) delete base[k];
    try {
      if (kind === 'question') {
        base.portion = topic!.portion; base.topic_id = topic!.id; base.course = base.course ?? topic!.course;
        if (type === 'order') { base.options = opts.filter((o) => o.trim()); base.correct = (base.options as string[]).map((_, i) => i); base.wrong_explanations = []; }
        if (type === 'tf') { base.options = ['True', 'False']; }
        if (type === 'number') { base.options = []; const c = base.correct as NumberAnswer; base.correct = { value: Number(c.value), tolerance: Number(c.tolerance ?? 0), unit: c.unit ?? '' }; }
        await staffApi.saveQuestion(base as unknown as Question, isNew);
      } else if (kind === 'card') await staffApi.saveCard(base as unknown as Card, isNew);
      else await staffApi.saveTerm(base as unknown as Term, isNew);
      toast(status === 'verified' ? 'Saved and verified.' : status === 'rejected' ? 'Rejected.' : 'Saved. It goes back to the review queue.');
      onSaved();
    } catch (e) { setErr(friendly(e)); }
  }

  const subSelect = (
    <label className="field">Subtopic
      <select className="input" value={String(d.subtopic_id ?? '')} onChange={(e) => set('subtopic_id', e.target.value)}>
        <option value="">Choose…</option>
        {content?.topics.map((t) => <optgroup key={t.id} label={`${t.id} ${t.title}`}>{content.subtopics.filter((s) => s.topic_id === t.id).map((s) => <option key={s.id} value={s.id}>{s.id} {s.title}</option>)}</optgroup>)}
      </select>
    </label>
  );
  return (
    <Sheet open onClose={onClose} title={`${isNew ? 'New' : 'Edit'} ${kind === 'question' ? 'question' : kind === 'card' ? 'Concept Card' : 'term'}`}>
      <div className="stack">
        {!isNew && <p className="tiny muted" style={{ margin: 0 }}>{String(d.id)} · version {String(item.version ?? 1)} · {item.status}{item.reviewed_at ? ` · reviewed ${formatDay(item.reviewed_at)}` : ''}. Saving a content change creates a new version{kind === 'question' ? ', resets its stats,' : ''} and sends it back for review unless you also verify it.</p>}
        {subSelect}
        {kind === 'term' && <>
          <label className="field">Term<input className="input" value={String(d.term ?? '')} onChange={(e) => set('term', e.target.value)} /></label>
          <label className="field">Definition<textarea className="input" value={String(d.definition ?? '')} onChange={(e) => set('definition', e.target.value)} /></label>
        </>}
        {kind === 'card' && <>
          <label className="field">Title<input className="input" value={String(d.title ?? '')} onChange={(e) => set('title', e.target.value)} /></label>
          <label className="field">Plain-English explanation<textarea className="input" value={String(d.body ?? '')} onChange={(e) => set('body', e.target.value)} /></label>
          <label className="field">Nevada example<textarea className="input" style={{ minHeight: 60 }} value={String(d.example ?? '')} onChange={(e) => set('example', e.target.value)} /></label>
          <label className="field">Memory hook<input className="input" value={String(d.memory_hook ?? '')} onChange={(e) => set('memory_hook', e.target.value)} /></label>
          <p className="tiny muted" style={{ margin: 0 }}>{words(String(d.body ?? '')) + words(String(d.example ?? '')) + words(String(d.memory_hook ?? ''))} of 79 words max</p>
          <fieldset className="card"><legend className="small">Terms from the term bank</legend>
            {terms.filter((t) => t.subtopic_id === d.subtopic_id).map((t) => (
              <label key={t.id} className="check" style={{ minHeight: 40, padding: 0 }}><input type="checkbox" checked={((d.term_ids as string[]) ?? []).includes(t.id)} onChange={(e) => set('term_ids', e.target.checked ? [...((d.term_ids as string[]) ?? []), t.id] : ((d.term_ids as string[]) ?? []).filter((x) => x !== t.id))} />{t.term}</label>
            ))}
            {terms.filter((t) => t.subtopic_id === d.subtopic_id).length === 0 && <p className="tiny muted" style={{ margin: 0 }}>No terms for this subtopic yet. Add them in the term bank.</p>}
          </fieldset>
        </>}
        {kind === 'question' && <>
          <div className="grid-2">
            <label className="field">Exercise type
              <select className="input" value={type} disabled={!isNew} onChange={(e) => {
                const t = e.target.value as ExerciseType;
                set('exercise_type', t);
                if (t === 'tf') { set('options', ['True', 'False']); set('correct', 0); set('wrong_explanations', ['', '']); }
                if (t === 'mcq' || t === 'scenario') { set('options', ['', '', '', '']); set('correct', 0); set('wrong_explanations', ['', '', '', '']); }
                if (t === 'number') { set('options', []); set('correct', { value: 0, tolerance: 0, unit: '' }); }
                if (t === 'order') { set('options', ['', '', '', '']); set('correct', [0, 1, 2, 3]); }
              }}>
                {(d.pool === 'exam' ? ['mcq', 'scenario'] : ['mcq', 'scenario', 'tf', 'number', 'order']).map((t) => <option key={t} value={t}>{{ mcq: 'Exam-style multiple choice', scenario: 'What should the agent do?', tf: 'True or false', number: 'Fill in the number', order: 'Put in order' }[t]}</option>)}
              </select>
            </label>
            <label className="field">Level<select className="input" value={String(d.level)} onChange={(e) => set('level', e.target.value)}><option value="recall">Recall</option><option value="application">Application</option><option value="calculation">Calculation</option></select></label>
            <label className="field">Difficulty<select className="input" value={Number(d.difficulty ?? 2)} onChange={(e) => set('difficulty', Number(e.target.value))}><option value={1}>1 (easy)</option><option value={2}>2</option><option value={3}>3 (hard)</option></select></label>
            <label className="field">Course<select className="input" value={String(d.course ?? topic?.course ?? 'PRIN')} onChange={(e) => set('course', e.target.value)}><option value="PRIN">Principles</option><option value="LAW">Law</option><option value="CON">Contracts</option><option value="AGY">Agency</option></select></label>
          </div>
          <label className="field">Question<textarea className="input" value={String(d.prompt ?? '')} onChange={(e) => set('prompt', e.target.value)} /></label>
          {(type === 'mcq' || type === 'scenario') && opts.map((o, i) => (
            <div key={i} className="card stack" style={{ gap: '0.4rem' }}>
              <label className="check" style={{ minHeight: 40, padding: 0 }}><input type="radio" name="correct" checked={d.correct === i} onChange={() => set('correct', i)} /> Option {String.fromCharCode(65 + i)} is correct</label>
              <input className="input" value={o} onChange={(e) => set('options', opts.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Option ${String.fromCharCode(65 + i)}`} />
              {d.correct !== i && <input className="input" placeholder="Why this option is wrong" value={wrong[i] ?? ''} onChange={(e) => set('wrong_explanations', opts.map((_, j) => (j === i ? e.target.value : wrong[j] ?? '')))} aria-label={`Why option ${String.fromCharCode(65 + i)} is wrong`} />}
            </div>
          ))}
          {type === 'tf' && <>
            <label className="field">Correct answer<select className="input" value={Number(d.correct)} onChange={(e) => set('correct', Number(e.target.value))}><option value={0}>True</option><option value={1}>False</option></select></label>
            <label className="field">Why the wrong choice is wrong<input className="input" value={wrong[1 - Number(d.correct)] ?? ''} onChange={(e) => { const w = ['', '']; w[1 - Number(d.correct)] = e.target.value; set('wrong_explanations', w); }} /></label>
          </>}
          {type === 'number' && <div className="grid-2">
            <label className="field">Correct value<input className="input" type="number" value={(d.correct as NumberAnswer)?.value ?? ''} onChange={(e) => set('correct', { ...(d.correct as NumberAnswer), value: e.target.value })} /></label>
            <label className="field">Allowed difference<input className="input" type="number" value={(d.correct as NumberAnswer)?.tolerance ?? 0} onChange={(e) => set('correct', { ...(d.correct as NumberAnswer), tolerance: e.target.value })} /></label>
            <label className="field">Unit<input className="input" value={(d.correct as NumberAnswer)?.unit ?? ''} placeholder="dollars, acres, %" onChange={(e) => set('correct', { ...(d.correct as NumberAnswer), unit: e.target.value })} /></label>
            <label className="field">Formula<input className="input" value={String(d.formula ?? '')} onChange={(e) => set('formula', e.target.value)} /></label>
          </div>}
          {type === 'number' && <label className="field">Worked steps (one per line)<textarea className="input" value={((d.worked_steps as string[]) ?? []).join('\n')} onChange={(e) => set('worked_steps', e.target.value.split('\n').filter((x) => x.trim()))} /></label>}
          {type === 'order' && <label className="field">Items in the correct order (one per line)<textarea className="input" value={opts.join('\n')} onChange={(e) => set('options', e.target.value.split('\n'))} /></label>}
          <label className="field">Explanation (1–2 sentences)<textarea className="input" value={String(d.explanation ?? '')} onChange={(e) => set('explanation', e.target.value)} /></label>
          <label className="field">Memory hook<input className="input" value={String(d.memory_hook ?? '')} onChange={(e) => set('memory_hook', e.target.value)} /></label>
          <label className="field">Fact key (one fact per question across both pools)<input className="input" value={String(d.fact_key ?? '')} onChange={(e) => set('fact_key', e.target.value)} /></label>
        </>}
        <label className="field">Citation (NRS/NAC chapter, NRED page, or "[verify citation]")<input className="input" value={String(d.citation ?? '')} onChange={(e) => set('citation', e.target.value || null)} /></label>
        <ErrorText>{err}</ErrorText>
        <div className="row wrap">
          <button className="btn" onClick={() => save()}>Save</button>
          <button className="btn ghost" onClick={() => save('verified')}><I.Check size={18} /> Save and verify</button>
          {!isNew && <button className="btn quiet" onClick={() => save('rejected')}>Reject</button>}
        </div>
        {!isNew && <div className="row wrap">
          {kind === 'question' && <button className="btn quiet sm" onClick={async () => setHistory(await staffApi.versions(String(d.id)))}>Version history</button>}
          <button className="btn quiet sm" onClick={async () => {
            if (!confirm('Delete this permanently? Rejecting keeps a record; deleting does not.')) return;
            try { await staffApi.remove(kind === 'question' ? 'questions' : kind === 'card' ? 'concept_cards' : 'terms', String(d.id)); toast('Deleted.'); onSaved(); } catch (e) { setErr(friendly(e)); }
          }}>Delete</button>
        </div>}
        {history && (history.length === 0 ? <p className="small muted">No earlier versions.</p> : history.map((h) => <details key={h.version} className="card"><summary>Version {h.version} · replaced {formatDateTime(h.replaced_at)}</summary><pre className="code">{JSON.stringify({ prompt: h.snapshot.prompt, options: h.snapshot.options, correct: h.snapshot.correct, explanation: h.snapshot.explanation }, null, 2)}</pre></details>))}
      </div>
    </Sheet>
  );
}

// ---------------------------------------------------------------- content library
export function ContentLibrary() {
  const { questions, cards, terms, err, reload } = useBank();
  const { reloadContent } = useStore();
  const [tab, setTab] = useState<'lesson' | 'exam' | 'cards' | 'terms'>('lesson');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [edit, setEdit] = useState<{ kind: Kind; item: Partial<Question & Card & Term>; isNew: boolean } | null>(null);
  const s = q.trim().toLowerCase();
  const matchS = (txt: string) => !s || txt.toLowerCase().includes(s);
  const okStatus = (st: string) => status === 'all' || st === status;
  const rows: Array<{ kind: Kind; item: Question | Card | Term; title: string; sub: string }> = useMemo(() => {
    if (tab === 'lesson' || tab === 'exam') return (questions ?? []).filter((x) => x.pool === tab && okStatus(x.status) && matchS(`${x.id} ${x.prompt} ${x.subtopic_id}`)).map((x) => ({ kind: 'question' as const, item: x, title: x.prompt, sub: `${x.id} · ${x.subtopic_id} · ${x.exercise_type}${x.exam_form_id ? ` · ${x.exam_form_id}` : ''}` }));
    if (tab === 'cards') return (cards ?? []).filter((x) => okStatus(x.status) && matchS(`${x.id} ${x.title} ${x.body}`)).map((x) => ({ kind: 'card' as const, item: x, title: x.title, sub: `${x.id} · ${x.subtopic_id}` }));
    return (terms ?? []).filter((x) => okStatus(x.status) && matchS(`${x.term} ${x.definition}`)).map((x) => ({ kind: 'term' as const, item: x, title: x.term, sub: `${x.subtopic_id} · ${x.definition.slice(0, 80)}` }));
  }, [tab, questions, cards, terms, s, status]); // eslint-disable-line react-hooks/exhaustive-deps
  const newItem = () => {
    const id = `${tab === 'cards' ? 'c' : tab === 'terms' ? 't' : tab === 'exam' ? 'E' : 'Q'}-${Date.now().toString(36)}`;
    if (tab === 'cards') setEdit({ kind: 'card', isNew: true, item: { id, term_ids: [] } as Partial<Card> });
    else if (tab === 'terms') setEdit({ kind: 'term', isNew: true, item: { id } as Partial<Term> });
    else setEdit({ kind: 'question', isNew: true, item: { id, pool: tab, exercise_type: 'mcq', options: ['', '', '', ''], correct: 0, wrong_explanations: ['', '', '', ''], level: 'recall', difficulty: 2, worked_steps: [], is_pretest: false, exam_form_id: null } as Partial<Question> });
  };
  return (
    <div>
      <ErrorText>{err}</ErrorText>
      <div className="seg mb" role="group" aria-label="Content type">
        {([['lesson', 'Lesson Pool'], ['exam', 'Exam Pool'], ['cards', 'Concept Cards'], ['terms', 'Term bank']] as const).map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}
      </div>
      <div className="row wrap mb">
        <input className="input grow" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search content" style={{ maxWidth: 360 }} />
        <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter"><option value="all">All statuses</option><option value="unverified">Unverified</option><option value="verified">Verified</option><option value="rejected">Rejected</option></select>
        <button className="btn" onClick={newItem}>+ New</button>
      </div>
      {!questions ? <p className="muted">Loading…</p> : rows.length === 0 ? <Empty title="Nothing here" body="Try another filter, or add something new." /> : (
        <div className="list">
          {rows.slice(0, 300).map((r) => (
            <button key={r.item.id} className="list-row" onClick={() => setEdit({ kind: r.kind, item: r.item, isNew: false })}>
              <span className="grow"><span style={{ display: 'block' }}>{r.title}</span><span className="tiny muted">{r.sub}</span></span>
              <Unverified status={r.item.status} />{r.item.status === 'verified' && <span className="badge ok"><I.Check size={14} /> Verified</span>}
            </button>
          ))}
          {rows.length > 300 && <p className="small muted">Showing 300 of {rows.length}. Search to narrow it down.</p>}
        </div>
      )}
      {edit && <Editor kind={edit.kind} item={edit.item} isNew={edit.isNew} terms={terms ?? []} onClose={() => setEdit(null)} onSaved={async () => { setEdit(null); await reload(); reloadContent(); }} />}
    </div>
  );
}

// ---------------------------------------------------------------- exam form builder
export function FormBuilder() {
  const { profile } = useStore();
  const [forms, setForms] = useState<ExamForm[] | null>(null);
  const [checks, setChecks] = useState<Record<string, Awaited<ReturnType<typeof staffApi.formCheck>>>>({});
  const [exam, setExam] = useState<Question[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState<Portion | null>(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const load = async () => {
    try {
      const [f, q] = await Promise.all([staffApi.forms(), staffApi.allQuestions('exam')]);
      setForms(f); setExam(q);
      const c: typeof checks = {};
      for (const x of f) c[x.id] = await staffApi.formCheck(x.id);
      setChecks(c);
    } catch (e) { setErr(friendly(e)); }
  };
  useEffect(() => { load(); }, []);
  const form = forms?.find((f) => f.id === open);
  const check = open ? checks[open] : null;
  const inForm = exam.filter((q) => q.exam_form_id === open);
  const pool = exam.filter((q) => !q.exam_form_id && q.portion === form?.portion && q.status === 'verified');

  async function autofill() {
    if (!form || !check) return;
    const ids: string[] = [], pre: string[] = [];
    const avail = shuffle(pool);
    for (const t of check.topics) {
      const need = t.target - t.have;
      if (need > 0) ids.push(...avail.filter((q) => q.topic_id === t.topic && !ids.includes(q.id)).slice(0, need).map((q) => q.id));
    }
    const minPre = form.portion === 'national' ? 5 : 5;
    const havePre = inForm.filter((q) => q.is_pretest).length;
    if (havePre < minPre) pre.push(...avail.filter((q) => !ids.includes(q.id)).slice(0, minPre - havePre).map((q) => q.id));
    if (!ids.length && !pre.length) { toast('Nothing to add: either the form is full or there are no unassigned verified Exam Pool questions for the missing topics.'); return; }
    try { if (ids.length) await staffApi.assignToForm(ids, form.id, false); if (pre.length) await staffApi.assignToForm(pre, form.id, true); toast(`Added ${ids.length} scored and ${pre.length} pretest questions.`); await load(); } catch (e) { toast(friendly(e)); }
  }

  return (
    <div>
      <ErrorText>{err}</ErrorText>
      <p className="muted small">A form is a complete exam: scored questions matching the official topic weighting, plus unscored pretest questions. A question belongs to one form only, and Exam Pool questions never appear in lessons.</p>
      {(['national', 'state'] as Portion[]).map((p) => (
        <section key={p} className="mb">
          <div className="row between"><h2 style={{ margin: 0 }}>{p === 'national' ? 'National' : 'State'} forms</h2><button className="btn sm" onClick={() => { setCreating(p); setName(`${p === 'national' ? 'National' : 'State'} Form ${(forms?.filter((f) => f.portion === p).length ?? 0) + 1}`); }}>+ New form</button></div>
          <div className="list mt">
            {forms?.filter((f) => f.portion === p).map((f) => {
              const c = checks[f.id];
              return (
                <button key={f.id} className="list-row" onClick={() => setOpen(f.id)}>
                  {c?.complete ? <I.Check aria-label="Complete" /> : <I.X aria-label="Incomplete" />}
                  <span className="grow">{f.name}<span className="tiny muted" style={{ display: 'block' }}>{c ? `${c.scored} scored · ${c.pretest} pretest · ${c.complete ? 'complete and verified' : c.issues[0] ?? ''}` : 'Checking…'}</span></span>
                  <Unverified status={f.status} />
                </button>
              );
            })}
            {forms && forms.filter((f) => f.portion === p).length === 0 && <p className="small muted">No forms yet.</p>}
          </div>
        </section>
      ))}
      <Sheet open={!!creating} onClose={() => setCreating(null)} title="New exam form">
        <label className="field">Name<input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn block mt" onClick={async () => {
          const id = `${creating === 'national' ? 'NAT' : 'NV'}-${Date.now().toString(36).toUpperCase()}`;
          try { await staffApi.saveForm({ id, portion: creating!, name: name.trim() || id, status: 'unverified' }, true); setCreating(null); await load(); setOpen(id); } catch (e) { toast(friendly(e)); }
        }}>Create form</button>
      </Sheet>
      <Sheet open={!!form} onClose={() => setOpen(null)} title={form?.name ?? ''}>
        {form && check && (
          <div className="stack">
            {check.issues.length > 0 ? <div className="notice"><I.Info /><ul style={{ margin: 0, paddingLeft: '1rem' }}>{check.issues.map((i) => <li key={i} className="small">{i}</li>)}</ul></div> : <p className="badge ok"><I.Check size={14} /> Complete and verified. Students can be served this form.</p>}
            <div className="table-wrap"><table className="data"><thead><tr><th>Topic</th><th>Have</th><th>Target</th></tr></thead><tbody>
              {check.topics.map((t) => <tr key={t.topic} className={t.have !== t.target ? 'low' : ''}><td>{t.title}</td><td className="num">{t.have}</td><td className="num">{t.target}</td></tr>)}
            </tbody></table></div>
            <p className="small">{pool.length} verified, unassigned {form.portion} Exam Pool questions available.</p>
            <div className="row wrap">
              <button className="btn" onClick={autofill}>Fill to the official weighting</button>
              {form.status !== 'verified'
                ? <button className="btn ghost" onClick={async () => { await staffApi.saveForm({ id: form.id, status: 'verified', reviewed_by: profile!.id, reviewed_at: new Date().toISOString() }, false); await load(); toast('Form verified.'); }}><I.Check size={18} /> Verify form</button>
                : <button className="btn quiet" onClick={async () => { await staffApi.saveForm({ id: form.id, status: 'unverified', reviewed_by: null, reviewed_at: null }, false); await load(); }}>Mark unverified</button>}
              {inForm.length === 0 && <button className="btn quiet" onClick={async () => { await staffApi.deleteForm(form.id); setOpen(null); await load(); }}>Delete empty form</button>}
            </div>
            <h3>Questions on this form ({inForm.length})</h3>
            <div className="list">
              {inForm.map((q) => (
                <div key={q.id} className="list-row" style={{ cursor: 'default' }}>
                  <span className="grow small">{q.prompt}<span className="tiny muted" style={{ display: 'block' }}>{q.id} · {q.topic_id} {q.is_pretest ? '· pretest' : ''} · {q.status}</span></span>
                  <button className="btn quiet sm" onClick={async () => { await staffApi.assignToForm([q.id], form.id, !q.is_pretest); await load(); }}>{q.is_pretest ? 'Make scored' : 'Make pretest'}</button>
                  <button className="btn quiet sm" onClick={async () => { await staffApi.assignToForm([q.id], null, false); await load(); }} aria-label={`Remove ${q.id} from form`}>Remove</button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ---------------------------------------------------------------- analytics
export function Analytics() {
  const [rows, setRows] = useState<QuestionStat[] | null>(null);
  const [err, setErr] = useState('');
  const [sort, setSort] = useState<{ k: 'pct_correct' | 'answered' | 'flags' | 'top_wrong'; dir: 1 | -1 }>({ k: 'pct_correct', dir: 1 });
  const [min, setMin] = useState(5);
  useEffect(() => { staffApi.analytics().then(setRows).catch((e) => setErr(friendly(e))); }, []);
  const topWrong = (r: QuestionStat) => {
    const total = Object.values(r.choices).reduce((a, b) => a + b, 0);
    let best = { idx: -1, pct: 0 };
    for (const [k, n] of Object.entries(r.choices)) if (Number(k) !== r.correct && total) { const p = (100 * n) / total; if (p > best.pct) best = { idx: Number(k), pct: Math.round(p) }; }
    return best;
  };
  const view = useMemo(() => (rows ?? []).filter((r) => r.answered >= min || r.flags > 0).sort((a, b) => {
    const v = (r: QuestionStat) => sort.k === 'top_wrong' ? topWrong(r).pct : (r[sort.k] ?? 101);
    return ((v(a) as number) - (v(b) as number)) * sort.dir;
  }), [rows, sort, min]); // eslint-disable-line react-hooks/exhaustive-deps
  const th = (k: typeof sort.k, label: string) => <th aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}><button onClick={() => setSort((s) => ({ k, dir: s.k === k ? (s.dir === 1 ? -1 : 1) : 1 }))}>{label}{sort.k === k && (sort.dir === 1 ? ' ↑' : ' ↓')}</button></th>;
  return (
    <div>
      <ErrorText>{err}</ErrorText>
      <p className="muted small">Questions most people miss, or where one wrong option pulls a big share of answers, may be miswritten. Stats count the current version only; editing a question resets them.</p>
      <label className="field mb" style={{ maxWidth: 260 }}>Minimum times answered<input className="input" type="number" min={0} value={min} onChange={(e) => setMin(Number(e.target.value))} /></label>
      {!rows ? <p className="muted">Loading…</p> : view.length === 0 ? <Empty title="Not enough answers yet" body="Stats appear once questions have been answered. Lower the minimum to see more." /> : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Question</th><th>Pool</th>{th('answered', 'Answered')}{th('pct_correct', '% correct')}{th('top_wrong', 'Top wrong option')}{th('flags', 'Flags')}</tr></thead>
            <tbody>{view.map((r) => { const w = topWrong(r); return (
              <tr key={r.id} className={(r.pct_correct ?? 100) < 50 ? 'low' : ''}>
                <td className="wrap"><span className="small">{r.prompt}</span><div className="tiny muted">{r.id} · v{r.version} · {r.subtopic}</div></td>
                <td>{r.pool}{r.form ? ` · ${r.form}` : ''}</td><td className="num">{r.answered}</td><td className="num">{r.pct_correct ?? '—'}{r.pct_correct != null && '%'}</td>
                <td className="small">{w.idx >= 0 && r.options[w.idx] ? `${w.pct}%: ${r.options[w.idx].slice(0, 60)}` : '—'}</td><td className="num">{r.flags}</td>
              </tr>); })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- coverage
export function Coverage() {
  const [rows, setRows] = useState<CoverageRow[] | null>(null);
  const [err, setErr] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  useEffect(() => { staffApi.coverage().then(setRows).catch((e) => setErr(friendly(e))); }, []);
  if (err) return <ErrorText>{err}</ErrorText>;
  if (!rows) return <p className="muted">Loading…</p>;
  const ok = (r: CoverageRow) => r.cc_verified >= r.cc_target && r.lp_verified >= r.lp_target;
  const full = rows.filter(ok).length;
  const pct = Math.round((100 * full) / Math.max(1, rows.length));
  return (
    <div>
      <div className="kpis mb">
        <div className="card stat"><span className="num">{pct}%</span><span className="small muted">Subtopics fully covered ({full}/{rows.length})</span></div>
        <div className="card stat"><span className="num">{rows.reduce((a, r) => a + r.lp_verified, 0)}</span><span className="small muted">Verified Lesson Pool questions</span></div>
        <div className="card stat"><span className="num">{rows.reduce((a, r) => a + r.cc_verified, 0)}</span><span className="small muted">Verified Concept Cards</span></div>
        <div className="card stat"><span className="num">{rows.reduce((a, r) => a + r.exam_verified, 0)}</span><span className="small muted">Verified Exam Pool (scored)</span></div>
      </div>
      <label className="check"><input type="checkbox" checked={onlyLow} onChange={(e) => setOnlyLow(e.target.checked)} /> Show only subtopics below target</label>
      <div className="table-wrap">
        <table className="data">
          <thead><tr><th>Subtopic</th><th>Cards verified / target</th><th>Lesson Qs verified / target</th><th>Written (any status)</th><th>Exam Pool verified / planned</th><th>Terms</th></tr></thead>
          <tbody>
            {rows.filter((r) => !onlyLow || !ok(r)).map((r) => (
              <tr key={r.id} className={ok(r) ? '' : 'low'}>
                <td className="wrap"><strong>{r.id}</strong> {r.title}<div className="tiny muted">{r.topic}{!r.items_verified && ' · item count [verify]'}{r.verify_note && ` · ${r.verify_note}`}</div></td>
                <td className="num">{r.cc_verified < r.cc_target ? <I.X size={14} style={{ display: 'inline' }} aria-label="below target" /> : <I.Check size={14} style={{ display: 'inline' }} aria-label="at target" />} {r.cc_verified}/{r.cc_target}</td>
                <td className="num">{r.lp_verified < r.lp_target ? <I.X size={14} style={{ display: 'inline' }} aria-label="below target" /> : <I.Check size={14} style={{ display: 'inline' }} aria-label="at target" />} {r.lp_verified}/{r.lp_target}</td>
                <td className="num small">{r.cc_total} cards · {r.lp_total} Qs</td>
                <td className="num">{r.exam_verified}/{r.exam_target}</td>
                <td className="num">{r.terms_verified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
