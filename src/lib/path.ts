// Path rules: one vertical path; finishing a lesson unlocks the next.
import type { Derived } from './derive';
import type { Content, Lesson, Unit } from './types';

export type NodeState = 'done' | 'current' | 'open' | 'locked';

export function orderedUnits(content: Content, portion?: 'national' | 'state' | null): Unit[] {
  return [...content.units].filter((u) => !portion || u.portion === portion).sort((a, b) => a.sort - b.sort);
}
export function unitLessons(content: Content, unitId: string): Lesson[] {
  return content.lessons.filter((l) => l.unit_id === unitId).sort((a, b) => a.sort - b.sort);
}

export function pathState(content: Content, d: Derived, portion?: 'national' | 'state' | null) {
  const lessonState = new Map<string, NodeState>();
  const unitState = new Map<string, 'done' | 'active' | 'locked'>();
  let current: Lesson | null = null;
  let prevDone = true;
  for (const u of orderedUnits(content, portion)) {
    const unitDone = d.completedUnits.has(u.id);
    const ls = unitLessons(content, u.id);
    let anyOpen = false;
    for (const l of ls) {
      const done = unitDone || d.completedLessons.has(l.id);
      let st: NodeState;
      if (done) st = 'done';
      else if (prevDone && !current) { st = 'current'; current = l; }
      else st = 'locked';
      if (st !== 'locked') anyOpen = true;
      lessonState.set(l.id, st);
      prevDone = done;
    }
    if (unitDone) prevDone = true;
    unitState.set(u.id, unitDone ? 'done' : anyOpen ? 'active' : 'locked');
  }
  return { lessonState, unitState, current };
}

export function allUnitsDone(content: Content, d: Derived) {
  return content.units.length > 0 && content.units.every((u) => d.completedUnits.has(u.id));
}
