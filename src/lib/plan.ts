// Study plan: lessons needed per day to finish the path by the target exam date.
import type { Derived } from './derive';
import type { Content } from './types';
import { daysBetween } from './time';

export function pathLessons(content: Content, portion?: 'national' | 'state' | null) {
  const units = content.units.filter((u) => !portion || u.portion === portion);
  const ids = new Set(units.map((u) => u.id));
  return content.lessons.filter((l) => ids.has(l.unit_id));
}
export function isLessonDone(d: Derived, lessonId: string, unitId: string) {
  return d.completedLessons.has(lessonId) || d.completedUnits.has(unitId);
}

export function studyPlan(content: Content, d: Derived, opts: { today: string; target: string | null; start: string | null; portion?: 'national' | 'state' | null }) {
  const lessons = pathLessons(content, opts.portion);
  const total = lessons.length;
  const done = lessons.filter((l) => isLessonDone(d, l.id, l.unit_id)).length;
  const remaining = total - done;
  if (!opts.target) return { total, done, remaining, perDay: null as number | null, daysLeft: null as number | null, behind: 0, status: 'no-date' as const };
  const daysLeft = daysBetween(opts.today, opts.target);
  if (daysLeft <= 0) return { total, done, remaining, perDay: remaining, daysLeft, behind: remaining, status: remaining ? ('behind' as const) : ('done' as const) };
  const perDay = Math.ceil(remaining / daysLeft);
  const start = opts.start && opts.start < opts.today ? opts.start : opts.today;
  const span = Math.max(1, daysBetween(start, opts.target));
  const elapsed = Math.max(0, daysBetween(start, opts.today));
  const expected = Math.floor((total * elapsed) / span);
  const behind = Math.max(0, expected - done);
  return { total, done, remaining, perDay, daysLeft, behind, status: remaining === 0 ? ('done' as const) : behind > 0 ? ('behind' as const) : ('on-track' as const) };
}
