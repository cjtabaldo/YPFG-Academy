// Loads the content source files in /content, applies the coverage-map
// target rules, and normalizes everything into database-ready records.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = (...p) => path.join(ROOT, 'content', ...p);
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const readDir = (dir) =>
  fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().flatMap((f) => readJson(path.join(dir, f)).map((x) => ({ ...x, _file: f }))) : [];

// Deterministic shuffle so answer positions are randomized but stable.
function seeded(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
export function permutation(n, seed) {
  const rnd = seeded(seed);
  const p = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

export function loadContent() {
  const outline = readJson(C('outline.json'));
  const V = outline.outline_version;
  const topics = [], subtopics = [];
  const STATE_ITEMS = 40;
  const stateSubCount = outline.topics.filter((t) => t.portion === 'state').reduce((n, t) => n + t.subtopics.length, 0);
  outline.topics.forEach((t, ti) => {
    topics.push({ id: t.id, portion: t.portion, title: t.title, items: t.items, items_verified: false, course: t.course, sort: ti });
    const n = t.subtopics.length;
    let lpTopic, cc;
    if (t.portion === 'state' && !t.items) {
      lpTopic = Math.max(10, Math.ceil((8 * STATE_ITEMS) / stateSubCount)) * n;
      cc = 2;
    } else {
      lpTopic = Math.max(10 * n, 8 * t.items);
      cc = t.items >= 8 ? 3 : 2;
    }
    t.subtopics.forEach(([id, title], si) => {
      subtopics.push({ id, topic_id: t.id, title, sort: si, cc_target: cc, lp_target: Math.ceil(lpTopic / n), verify_note: /\[verify/.test(title) ? 'Confirm this line appears on the official outline.' : null });
    });
  });
  const topicOf = Object.fromEntries(subtopics.map((s) => [s.id, topics.find((t) => t.id === s.topic_id)]));

  const units = [], lessons = [];
  outline.units.forEach((u, ui) => {
    units.push({ id: u.id, portion: u.portion, title: u.title, course: u.course, topic_ids: u.topics, sort: ui });
    u.lessons.forEach(([title, subs], li) => lessons.push({ id: `${u.id}-L${String(li + 1).padStart(2, '0')}`, unit_id: u.id, title, kind: 'lesson', subtopic_ids: subs, sort: li }));
    const allSubs = [...new Set(u.lessons.flatMap(([, s]) => s))];
    lessons.push({ id: `${u.id}-R`, unit_id: u.id, title: 'Unit review', kind: 'review', subtopic_ids: allSubs, sort: u.lessons.length });
  });

  const terms = readDir(C('terms')).map((t) => ({
    id: t.id, term: t.term, definition: t.definition, subtopic_id: t.subtopic, citation: t.citation ?? null,
    outline_version: V, status: t.status ?? 'unverified', _file: t._file,
  }));
  const cards = readDir(C('cards')).map((c) => ({
    id: c.id, subtopic_id: c.subtopic, title: c.title, body: c.body, example: c.example, memory_hook: c.hook,
    term_ids: c.terms ?? [], citation: c.citation ?? null, outline_version: V, status: c.status ?? 'unverified', _file: c._file,
  }));

  const normQ = (q, pool) => {
    const t = topicOf[q.sub];
    let options = q.options ?? [];
    let correct, wrong = q.wrong ?? [];
    if (q.type === 'mcq' || q.type === 'scenario') {
      const ans = q.answer ?? 0;
      const p = permutation(options.length, q.id);
      options = p.map((i) => q.options[i]);
      wrong = p.map((i) => (q.wrong ?? [])[i] ?? '');
      correct = p.indexOf(ans);
    } else if (q.type === 'tf') correct = q.answer;
    else if (q.type === 'number') correct = { ...q.answer, unit: q.unit ?? '' };
    else if (q.type === 'order') correct = options.map((_, i) => i);
    return {
      id: q.id, pool, exam_form_id: q.form ?? null, is_pretest: !!q.pretest, portion: t?.portion, topic_id: t?.id,
      subtopic_id: q.sub, outline_version: V, course: t?.course, exercise_type: q.type, difficulty: q.diff ?? 2,
      level: q.level, prompt: q.q, options, correct, explanation: q.why, wrong_explanations: wrong,
      memory_hook: q.hook ?? '', formula: q.formula ?? null, worked_steps: q.steps ?? [],
      citation: q.citation ?? null, fact_key: q.fact, status: q.status ?? 'unverified', _file: q._file, _raw: q,
    };
  };
  const lessonQs = readDir(C('questions')).map((q) => normQ(q, 'lesson'));
  const examFile = readDir(C('exam'));
  const forms = examFile.filter((x) => x.form_def).map((x) => ({ id: x.id, portion: x.portion, name: x.name, status: x.status ?? 'unverified' }));
  const examQs = examFile.filter((x) => !x.form_def).map((q) => normQ(q, 'exam'));
  const verify = readJson(C('verify.json')).map((v, i) => ({ ...v, sort: i }));
  return { outline_version: V, topics, subtopics, units, lessons, terms, cards, questions: [...lessonQs, ...examQs], forms, verify };
}

export function wordCount(s) { return (s || '').trim().split(/\s+/).filter(Boolean).length; }
export { ROOT };
