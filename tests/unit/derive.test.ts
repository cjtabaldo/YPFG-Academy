import { describe, expect, it } from 'vitest';
import { derive } from '../../src/lib/derive';
import { localDate, addDays } from '../../src/lib/time';
import type { ProgressEvent } from '../../src/lib/types';

let n = 0;
const ev = (kind: ProgressEvent['kind'], at: string, local: string, xp = 0, payload: Record<string, unknown> = {}): ProgressEvent =>
  ({ id: `e${n++}`, kind, occurred_at: at, local_date: local, xp, payload });
const lesson = (at: string, local: string, xp = 15) => ev('lesson_complete', at, local, xp, { lesson: `L${n}` });

describe('local midnight in different time zones', () => {
  it('computes the local day from the user time zone', () => {
    const instant = new Date('2026-10-13T06:30:00Z'); // 11:30 PM Oct 12 in Las Vegas, 2:30 AM Oct 13 in New York
    expect(localDate(instant, 'America/Los_Angeles')).toBe('2026-10-12');
    expect(localDate(instant, 'America/New_York')).toBe('2026-10-13');
    expect(localDate(new Date('2026-10-13T07:00:00Z'), 'America/Los_Angeles')).toBe('2026-10-13'); // just after LA midnight
  });

  it('a lesson at 11:59 PM and another at 12:01 AM local count as two streak days (Las Vegas)', () => {
    const tz = 'America/Los_Angeles';
    const a = new Date('2026-10-13T06:59:00Z'), b = new Date('2026-10-13T07:01:00Z');
    const events = [lesson(a.toISOString(), localDate(a, tz)), lesson(b.toISOString(), localDate(b, tz))];
    expect(derive(events, { today: '2026-10-13', now: b.getTime(), dailyGoal: 10 }).streak).toBe(2);
  });

  it('the same two instants are one day in New York', () => {
    const tz = 'America/New_York';
    const a = new Date('2026-10-13T06:59:00Z'), b = new Date('2026-10-13T07:01:00Z');
    const events = [lesson(a.toISOString(), localDate(a, tz)), lesson(b.toISOString(), localDate(b, tz))];
    expect(derive(events, { today: '2026-10-13', now: b.getTime(), dailyGoal: 10 }).streak).toBe(1);
  });
});

describe('streaks', () => {
  const days = (start: string, count: number, xp = 20) => Array.from({ length: count }, (_, i) => { const d = addDays(start, i); return lesson(`${d}T18:00:00Z`, d, xp); });
  it('stays alive until today ends, then resets after a missed day without a freeze', () => {
    const e = days('2026-10-01', 3, 5); // under goal, so no freeze earned
    expect(derive(e, { today: '2026-10-04', now: Date.now(), dailyGoal: 10 }).streak).toBe(3);
    expect(derive(e, { today: '2026-10-05', now: Date.now(), dailyGoal: 10 }).streak).toBe(0);
  });
  it('earns a freeze after 3 goal days and uses it on one missed day', () => {
    const e = [...days('2026-10-01', 3, 20), ...days('2026-10-05', 1, 20)];
    const d = derive(e, { today: '2026-10-05', now: Date.now(), dailyGoal: 20 });
    expect(d.streak).toBe(4);
    expect(d.frozenDays).toEqual(['2026-10-04']);
    expect(d.freezeHeld).toBe(false);
  });
  it('a freeze covers only one day', () => {
    const e = [...days('2026-10-01', 3, 20), ...days('2026-10-06', 1, 20)];
    expect(derive(e, { today: '2026-10-06', now: Date.now(), dailyGoal: 20 }).streak).toBe(1);
  });
});

describe('spaced repetition', () => {
  const answer = (q: string, c: boolean, g: boolean, at: string) => ev('answer', at, at.slice(0, 10), 0, { q, c, g, s: 'N1.1' });
  it('a correct "Guessing" answer is scheduled for review like a miss', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    const d = derive([answer('q1', true, true, '2026-10-10T11:00:00Z'), answer('q2', true, false, '2026-10-10T11:00:00Z'), answer('q3', false, false, '2026-10-10T11:00:00Z')], { today: '2026-10-10', now, dailyGoal: 10 });
    expect(d.items.get('q1')!.due).toBeLessThanOrEqual(now);
    expect(d.items.get('q3')!.due).toBeLessThanOrEqual(now);
    expect(d.items.get('q2')!.due).toBeGreaterThan(now);
  });
  it('the most recent answer wins when devices disagree', () => {
    const d = derive([answer('q1', true, false, '2026-10-10T12:00:00Z'), answer('q1', false, false, '2026-10-10T11:00:00Z')], { today: '2026-10-10', now: Date.parse('2026-10-10T13:00:00Z'), dailyGoal: 10 });
    expect(d.items.get('q1')!.lastCorrect).toBe(true);
  });
});

describe('multi-device merge', () => {
  it('XP and completions from two devices add together; duplicates count once', () => {
    const phone = [lesson('2026-10-10T10:00:00Z', '2026-10-10', 15), ev('lesson_complete', '2026-10-10T10:05:00Z', '2026-10-10', 13, { lesson: 'U01-L02' })];
    const laptop = [ev('lesson_complete', '2026-10-10T11:00:00Z', '2026-10-10', 18, { lesson: 'U01-L03' })];
    const merged = new Map([...phone, ...laptop, phone[0]].map((e) => [e.id, e])); // union by id
    const d = derive([...merged.values()], { today: '2026-10-10', now: Date.now(), dailyGoal: 10 });
    expect(d.xpTotal).toBe(46);
    expect(d.completedLessons.size).toBe(3);
  });
});

describe('hearts', () => {
  it('lose one per wrong answer, refill over time, refill fully after practice', () => {
    const t0 = Date.parse('2026-10-10T10:00:00Z');
    const lost = [0, 1, 2].map((i) => ev('heart_lost', new Date(t0 + i * 1000).toISOString(), '2026-10-10'));
    expect(derive(lost, { today: '2026-10-10', now: t0 + 5000, dailyGoal: 10 }).hearts).toBe(2);
    expect(derive(lost, { today: '2026-10-10', now: t0 + 2 * 3600e3 + 1000, dailyGoal: 10 }).hearts).toBe(3);
    const refilled = [...lost, ev('hearts_refilled', new Date(t0 + 9000).toISOString(), '2026-10-10')];
    expect(derive(refilled, { today: '2026-10-10', now: t0 + 10000, dailyGoal: 10 }).hearts).toBe(5);
  });
});
