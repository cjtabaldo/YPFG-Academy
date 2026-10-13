// Turns the event log into everything the app shows: XP, streak, hearts,
// completions, spaced-repetition schedule, accuracy. It is a pure function of
// the events, so events merged from several devices always add up the same way.
import { HEARTS, SRS_DAYS, STREAK } from '../config/app';
import type { Content, ProgressEvent } from './types';
import { addDays } from './time';

export interface ItemState { box: number; due: number; attempts: number; correct: number; last: number; lastCorrect: boolean; guessed: boolean }
export interface Derived {
  xpTotal: number; xpToday: number; xpByDay: Map<string, number>; xpThisWeek: number;
  streak: number; longestStreak: number; freezeHeld: boolean; frozenDays: string[]; studiedToday: boolean; lastStudyDate: string | null;
  hearts: number; nextHeartAt: number | null;
  completedLessons: Set<string>; completedUnits: Set<string>; placementPassed: Set<string>;
  items: Map<string, ItemState>; terms: Map<string, ItemState>; cardsSeen: Map<string, number>;
  subtopicAcc: Map<string, { n: number; ok: number }>;
  confidence: { sure: { n: number; ok: number }; guess: { n: number; ok: number } };
  hoursByCourse: Record<string, number>; hoursLastWeekCourses: Set<string>;
  answeredCount: number; correctCount: number;
}

const STUDY_KINDS = new Set(['lesson_complete', 'practice_complete', 'placement', 'unit_complete']);
const DAY_MS = 86400000;

function srsStep(st: ItemState | undefined, ok: boolean, guessed: boolean, t: number): ItemState {
  const s: ItemState = st ? { ...st } : { box: 0, due: t, attempts: 0, correct: 0, last: t, lastCorrect: false, guessed: false };
  s.attempts += 1; s.last = t; s.lastCorrect = ok; s.guessed = guessed;
  if (ok) s.correct += 1;
  if (!ok || guessed) { s.box = 0; s.due = t; } // a correct guess is scheduled like a miss
  else { s.box = Math.min(s.box + 1, SRS_DAYS.length - 1); s.due = t + SRS_DAYS[s.box] * DAY_MS; }
  return s;
}

export function derive(events: ProgressEvent[], opts: { today: string; now: number; dailyGoal: number; content?: Content | null }): Derived {
  const ev = [...events].sort((a, b) => a.occurred_at.localeCompare(b.occurred_at) || a.id.localeCompare(b.id));
  const d: Derived = {
    xpTotal: 0, xpToday: 0, xpByDay: new Map(), xpThisWeek: 0, streak: 0, longestStreak: 0, freezeHeld: false, frozenDays: [],
    studiedToday: false, lastStudyDate: null, hearts: HEARTS.max, nextHeartAt: null,
    completedLessons: new Set(), completedUnits: new Set(), placementPassed: new Set(),
    items: new Map(), terms: new Map(), cardsSeen: new Map(), subtopicAcc: new Map(),
    confidence: { sure: { n: 0, ok: 0 }, guess: { n: 0, ok: 0 } }, hoursByCourse: {}, hoursLastWeekCourses: new Set(),
    answeredCount: 0, correctCount: 0,
  };
  const studyDays = new Set<string>();
  const weekStart = addDays(opts.today, -6);
  const refillMs = HEARTS.refillMinutes * 60000;
  let hearts: number = HEARTS.max, regenFrom = 0;
  const regen = (t: number) => {
    if (hearts >= HEARTS.max) return;
    const gained = Math.floor((t - regenFrom) / refillMs);
    if (gained > 0) { hearts = Math.min(HEARTS.max, hearts + gained); regenFrom += gained * refillMs; }
  };

  for (const e of ev) {
    const t = Date.parse(e.occurred_at);
    const p = e.payload as Record<string, any>;
    d.xpTotal += e.xp;
    if (e.xp) d.xpByDay.set(e.local_date, (d.xpByDay.get(e.local_date) ?? 0) + e.xp);
    if (e.local_date >= weekStart && e.local_date <= opts.today) d.xpThisWeek += e.xp;
    if (STUDY_KINDS.has(e.kind)) studyDays.add(e.local_date);
    switch (e.kind) {
      case 'answer': {
        const ok = !!p.c, guessed = !!p.g;
        d.answeredCount++; if (ok) d.correctCount++;
        if (p.q) d.items.set(p.q, srsStep(d.items.get(p.q), ok, guessed, t));
        if (p.s) { const a = d.subtopicAcc.get(p.s) ?? { n: 0, ok: 0 }; a.n++; if (ok) a.ok++; d.subtopicAcc.set(p.s, a); }
        if (p.conf === 'sure') { d.confidence.sure.n++; if (ok) d.confidence.sure.ok++; }
        if (p.conf === 'guess') { d.confidence.guess.n++; if (ok) d.confidence.guess.ok++; }
        break;
      }
      case 'term_seen':
        if (p.term) d.terms.set(p.term, srsStep(d.terms.get(p.term), p.c !== false, false, t));
        break;
      case 'card_seen':
        if (p.card) d.cardsSeen.set(p.card, t);
        break;
      case 'lesson_complete':
        if (p.lesson) d.completedLessons.add(p.lesson);
        break;
      case 'unit_complete':
        if (p.unit) d.completedUnits.add(p.unit);
        break;
      case 'placement':
        if (p.passed && p.unit) d.placementPassed.add(p.unit);
        break;
      case 'hours_logged': {
        const c = String(p.course ?? ''), h = Number(p.hours ?? 0);
        if (c && Number.isFinite(h)) d.hoursByCourse[c] = Math.round(((d.hoursByCourse[c] ?? 0) + h) * 100) / 100;
        if (c && h > 0 && e.local_date >= weekStart) d.hoursLastWeekCourses.add(c);
        break;
      }
      case 'heart_lost':
        regen(t);
        if (hearts >= HEARTS.max) regenFrom = t;
        hearts = Math.max(0, hearts - 1);
        break;
      case 'hearts_refilled':
        hearts = HEARTS.max;
        break;
    }
  }
  regen(opts.now);
  d.hearts = hearts;
  d.nextHeartAt = hearts < HEARTS.max ? regenFrom + refillMs : null;
  d.xpToday = d.xpByDay.get(opts.today) ?? 0;

  // Streak: walk day by day from the first study day to today.
  const days = [...studyDays].sort();
  if (days.length) {
    let streak = 0, longest = 0, goalRun = 0, freeze = false;
    for (let day = days[0]; day <= opts.today; day = addDays(day, 1)) {
      if (studyDays.has(day)) {
        streak++;
        if ((d.xpByDay.get(day) ?? 0) >= opts.dailyGoal) {
          goalRun++;
          if (goalRun % STREAK.freezeEarnDays === 0) freeze = true;
        } else goalRun = 0;
      } else if (day !== opts.today) {
        if (freeze && streak > 0) { freeze = false; d.frozenDays.push(day); }
        else streak = 0;
        goalRun = 0;
      }
      longest = Math.max(longest, streak);
    }
    d.streak = streak; d.longestStreak = longest; d.freezeHeld = freeze;
    d.lastStudyDate = days[days.length - 1];
    d.studiedToday = studyDays.has(opts.today);
  }
  return d;
}

export function topicAccuracy(d: Derived, content: Content) {
  return content.topics.map((t) => {
    let n = 0, ok = 0;
    for (const s of content.subtopics) if (s.topic_id === t.id) { const a = d.subtopicAcc.get(s.id); if (a) { n += a.n; ok += a.ok; } }
    return { topic: t, n, pct: n ? Math.round((100 * ok) / n) : null };
  });
}
