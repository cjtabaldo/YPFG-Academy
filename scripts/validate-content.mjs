// Checks every content record against the rules in the build brief.
import { loadContent, wordCount } from './content-lib.mjs';

const c = loadContent();
const errors = [], warnings = [];
const subIds = new Set(c.subtopics.map((s) => s.id));
const termIds = new Set(c.terms.map((t) => t.id));
const formIds = new Set(c.forms.map((f) => f.id));
const seen = new Map(), facts = new Map(), prompts = new Map();
const err = (id, m) => errors.push(`${id}: ${m}`);

for (const t of c.terms) {
  if (seen.has(t.id)) err(t.id, 'duplicate id'); seen.set(t.id, 1);
  if (!subIds.has(t.subtopic_id)) err(t.id, `unknown subtopic ${t.subtopic_id}`);
}
for (const k of c.cards) {
  if (seen.has(k.id)) err(k.id, 'duplicate id'); seen.set(k.id, 1);
  if (!subIds.has(k.subtopic_id)) err(k.id, `unknown subtopic ${k.subtopic_id}`);
  const words = wordCount(k.body) + wordCount(k.example) + wordCount(k.memory_hook);
  if (words >= 80) err(k.id, `Concept Card is ${words} words; must be under 80`);
  for (const tid of k.term_ids) if (!termIds.has(tid)) err(k.id, `unknown term ${tid}`);
  if (!k.example || !k.memory_hook) err(k.id, 'needs a Nevada example and a memory hook');
}
for (const q of c.questions) {
  if (seen.has(q.id)) err(q.id, 'duplicate id (ids must be unique across both pools)'); seen.set(q.id, 1);
  if (!subIds.has(q.subtopic_id)) err(q.id, `unknown subtopic ${q.subtopic_id}`);
  if (!q.fact_key) err(q.id, 'missing fact key'); else if (facts.has(q.fact_key)) err(q.id, `tests the same fact as ${facts.get(q.fact_key)} (${q.fact_key})`); else facts.set(q.fact_key, q.id);
  const p = q.prompt.toLowerCase().replace(/\W+/g, ' ').trim();
  if (prompts.has(p)) err(q.id, `duplicate prompt of ${prompts.get(p)}`); prompts.set(p, q.id);
  if (!['recall', 'application', 'calculation'].includes(q.level)) err(q.id, 'bad level');
  if (!q.explanation) err(q.id, 'missing explanation');
  if (!q.memory_hook) err(q.id, 'missing memory hook');
  switch (q.exercise_type) {
    case 'mcq': case 'scenario':
      if (q.options.length !== 4) err(q.id, 'needs exactly 4 options');
      if (!(q.correct >= 0 && q.correct < q.options.length)) err(q.id, 'bad answer index');
      if (q.wrong_explanations.length !== q.options.length) err(q.id, 'needs a why-wrong note aligned to each option');
      q.wrong_explanations.forEach((w, i) => { if (i !== q.correct && !w) err(q.id, `option ${i + 1} needs a why-wrong note`); });
      break;
    case 'tf':
      if (q.options.join() !== 'True,False') err(q.id, 'true/false options must be ["True","False"]');
      if (![0, 1].includes(q.correct)) err(q.id, 'answer must be 0 (True) or 1 (False)');
      if (!q.wrong_explanations[1 - q.correct]) err(q.id, 'needs a why-wrong note for the wrong choice');
      break;
    case 'number':
      if (typeof q.correct?.value !== 'number') err(q.id, 'number answer needs a numeric value');
      if (!q.worked_steps.length || !q.formula) err(q.id, 'math questions need a formula and worked steps');
      break;
    case 'order':
      if (q.options.length < 3) err(q.id, 'order needs at least 3 items');
      break;
    default: err(q.id, `unknown exercise type ${q.exercise_type}`);
  }
  if (q.pool === 'exam') {
    if (!['mcq', 'scenario'].includes(q.exercise_type)) err(q.id, 'Exam Pool questions must be multiple choice');
    if (q.exam_form_id && !formIds.has(q.exam_form_id)) err(q.id, `unknown form ${q.exam_form_id}`);
  }
  if (q.portion === 'state' && !q.citation) warnings.push(`${q.id}: Nevada rule without a citation (use "[verify citation]")`);
}

// Coverage summary
const rows = c.subtopics.map((s) => {
  const lp = c.questions.filter((q) => q.pool === 'lesson' && q.subtopic_id === s.id).length;
  const cc = c.cards.filter((k) => k.subtopic_id === s.id).length;
  return { s, lp, cc, ok: lp >= s.lp_target && cc >= s.cc_target };
});
const full = rows.filter((r) => r.ok).length;
if (process.argv.includes('--report')) {
  for (const r of rows) console.log(`${r.ok ? 'OK  ' : 'LOW '} ${r.s.id.padEnd(6)} CC ${String(r.cc).padStart(2)}/${r.s.cc_target}  LP ${String(r.lp).padStart(3)}/${r.s.lp_target}  ${r.s.title}`);
}
console.log(`Content: ${c.terms.length} terms, ${c.cards.length} cards, ${c.questions.filter((q) => q.pool === 'lesson').length} lesson questions, ${c.questions.filter((q) => q.pool === 'exam').length} exam questions, ${c.forms.length} forms.`);
console.log(`Coverage (written, before review): ${full}/${rows.length} subtopics at target.`);
warnings.slice(0, 20).forEach((w) => console.warn('warn', w));
if (errors.length) { errors.forEach((e) => console.error('ERROR', e)); process.exit(1); }
console.log('Content check passed.');
