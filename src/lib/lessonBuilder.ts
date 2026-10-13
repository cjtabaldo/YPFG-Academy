// Assembles lessons, practice sessions, placement checks and unit reviews
// from the content bank and the learner's history.
import { LESSON } from '../config/app';
import type { Derived } from './derive';
import type { Card, Content, Lesson, Question, Term } from './types';

export type Exercise =
  | { kind: 'question'; q: Question; review?: boolean }
  | { kind: 'match'; terms: Term[] };

export interface Session { cards: Card[]; exercises: Exercise[] }

export function shuffle<T>(arr: T[], rnd: () => number = Math.random): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const isExamStyle = (q: Question) => q.exercise_type === 'mcq' || q.exercise_type === 'scenario';

// Unseen first, then due for review, then least recently seen.
function rankQuestions(qs: Question[], d: Derived, now: number) {
  return shuffle(qs).sort((a, b) => score(a) - score(b));
  function score(q: Question) {
    const s = d.items.get(q.id);
    if (!s) return 0;
    if (s.due <= now) return 1 + s.box / 10;
    return 2 + (now - s.last < 0 ? 0 : 1 / (1 + (now - s.last) / 3.6e6));
  }
}

function pickTerms(content: Content, subtopicIds: string[], d: Derived, now: number, n = 5): Term[] {
  let pool = content.terms.filter((t) => subtopicIds.includes(t.subtopic_id));
  if (pool.length < n) {
    const topicIds = new Set(content.subtopics.filter((s) => subtopicIds.includes(s.id)).map((s) => s.topic_id));
    pool = content.terms.filter((t) => topicIds.has(content.subtopics.find((s) => s.id === t.subtopic_id)?.topic_id ?? ''));
  }
  if (pool.length < n) return [];
  const due = (t: Term) => { const s = d.terms.get(t.id); return !s ? 0 : s.due <= now ? 1 : 2; };
  return shuffle(pool).sort((a, b) => due(a) - due(b)).slice(0, n);
}

function pickCards(content: Content, lesson: Lesson, d: Derived, d2: Map<string, { n: number; ok: number }>): Card[] {
  const bySub = (s: string) => content.cards.filter((c) => c.subtopic_id === s)
    .sort((a, b) => (d.cardsSeen.get(a.id) ?? 0) - (d.cardsSeen.get(b.id) ?? 0) || a.id.localeCompare(b.id));
  if (lesson.kind === 'review') {
    const weakest = [...lesson.subtopic_ids].sort((a, b) => acc(a) - acc(b))[0];
    return bySub(weakest).slice(0, 1);
  }
  if (lesson.subtopic_ids.length === 1) return bySub(lesson.subtopic_ids[0]).slice(0, 2);
  return lesson.subtopic_ids.slice(0, 2).map((s) => bySub(s)[0]).filter(Boolean);
  function acc(s: string) { const a = d2.get(s); return a && a.n ? a.ok / a.n : 0.5; }
}

export function buildLesson(content: Content, lesson: Lesson, d: Derived, now = Date.now()): Session {
  const target = LESSON.exercises;
  const subs = lesson.subtopic_ids;
  const own = content.questions.filter((q) => q.pool === 'lesson' && subs.includes(q.subtopic_id));
  const ranked = rankQuestions(own, d, now);
  const terms = pickTerms(content, subs, d, now);
  const slots = target - (terms.length ? 1 : 0);

  // Spaced review: up to two due items from other subtopics already studied.
  const reviewPool = content.questions.filter((q) => q.pool === 'lesson' && !subs.includes(q.subtopic_id) && (d.items.get(q.id)?.due ?? Infinity) <= now);
  const review = shuffle(reviewPool).sort((a, b) => d.items.get(a.id)!.box - d.items.get(b.id)!.box).slice(0, LESSON.maxReviewItems);

  const need = Math.max(0, slots - review.length);
  const exam = ranked.filter(isExamStyle), other = ranked.filter((q) => !isExamStyle(q));
  const minExam = Math.ceil(target / 2);
  const chosen: Question[] = exam.slice(0, Math.min(exam.length, Math.max(minExam, need - other.length)));
  for (const q of other) { if (chosen.length >= need) break; chosen.push(q); }
  for (const q of exam) { if (chosen.length >= need) break; if (!chosen.includes(q)) chosen.push(q); }

  const exercises: Exercise[] = shuffle([...chosen.map((q) => ({ kind: 'question' as const, q })), ...review.map((q) => ({ kind: 'question' as const, q, review: true }))]);
  if (terms.length) exercises.splice(Math.min(4, exercises.length), 0, { kind: 'match', terms });
  return { cards: pickCards(content, lesson, d, d.subtopicAcc), exercises };
}

export function buildPlacement(content: Content, unitId: string): Session {
  const subs = new Set(content.lessons.filter((l) => l.unit_id === unitId).flatMap((l) => l.subtopic_ids));
  const qs = content.questions.filter((q) => q.pool === 'lesson' && subs.has(q.subtopic_id) && q.exercise_type !== 'order');
  // Spread across subtopics, mostly exam-style.
  const bySub = new Map<string, Question[]>();
  for (const q of shuffle(qs).sort((a, b) => Number(isExamStyle(b)) - Number(isExamStyle(a)))) {
    bySub.set(q.subtopic_id, [...(bySub.get(q.subtopic_id) ?? []), q]);
  }
  const out: Question[] = [];
  while (out.length < LESSON.placementQuestions && [...bySub.values()].some((v) => v.length)) {
    for (const v of bySub.values()) { const q = v.shift(); if (q && out.length < LESSON.placementQuestions) out.push(q); }
  }
  return { cards: [], exercises: shuffle(out).map((q) => ({ kind: 'question', q })) };
}

// Practice: due items first, weakest subtopics next. Optionally limited to topics.
export function buildPractice(content: Content, d: Derived, opts: { topicIds?: string[]; portion?: 'national' | 'state' | null; now?: number } = {}): Session {
  const now = opts.now ?? Date.now();
  const subTopic = new Map(content.subtopics.map((s) => [s.id, s.topic_id]));
  const studiedSubs = new Set(content.lessons.filter((l) => d.completedLessons.has(l.id) || d.completedUnits.has(l.unit_id)).flatMap((l) => l.subtopic_ids));
  for (const [qid] of d.items) { const q = content.questions.find((x) => x.id === qid); if (q) studiedSubs.add(q.subtopic_id); }
  let pool = content.questions.filter((q) => q.pool === 'lesson');
  if (opts.topicIds?.length) pool = pool.filter((q) => opts.topicIds!.includes(subTopic.get(q.subtopic_id) ?? ''));
  else {
    pool = pool.filter((q) => studiedSubs.has(q.subtopic_id));
    if (opts.portion) pool = pool.filter((q) => q.portion === opts.portion);
  }
  const acc = (s: string) => { const a = d.subtopicAcc.get(s); return a && a.n ? a.ok / a.n : 0.6; };
  const due = shuffle(pool.filter((q) => (d.items.get(q.id)?.due ?? Infinity) <= now)).sort((a, b) => acc(a.subtopic_id) - acc(b.subtopic_id));
  const rest = shuffle(pool.filter((q) => !due.includes(q))).sort((a, b) => acc(a.subtopic_id) - acc(b.subtopic_id));
  const picked = [...due, ...rest].slice(0, LESSON.practiceQuestions);
  const subs = [...new Set(picked.map((q) => q.subtopic_id))];
  const terms = pickTerms(content, subs, d, now);
  const exercises: Exercise[] = shuffle(picked).map((q) => ({ kind: 'question', q, review: due.includes(q) }));
  if (terms.length) exercises.splice(Math.min(3, exercises.length), 0, { kind: 'match', terms });
  return { cards: [], exercises };
}

export function practiceAvailable(content: Content, d: Derived): number {
  const now = Date.now();
  return content.questions.filter((q) => q.pool === 'lesson' && (d.items.get(q.id)?.due ?? Infinity) <= now).length;
}
