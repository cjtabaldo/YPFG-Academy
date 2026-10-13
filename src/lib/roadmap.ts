// The License Roadmap: every step from today to a Nevada salesperson license.
import type { RoadmapStep } from './types';

export interface StepDef { key: string; number: number; title: string; summary: string }

export const ROADMAP_STEPS: StepDef[] = [
  { key: 'eligibility', number: 0, title: 'Check eligibility', summary: 'Age and education requirements.' },
  { key: 'school', number: 1, title: 'Enroll in an NRED-approved school', summary: 'Pick a pre-licensing school approved by the Nevada Real Estate Division.' },
  { key: 'education', number: 2, title: 'Complete 120 hours of pre-licensing', summary: 'Log your hours for each course.' },
  { key: 'broker', number: 3, title: 'Choose a sponsoring broker', summary: 'You will work under a licensed Nevada broker.' },
  { key: 'nred', number: 4, title: 'Register with NRED and get Authorization to Test', summary: 'Register and pay through NRED, then schedule with Pearson VUE.' },
  { key: 'checklist', number: 5, title: 'Exam-day checklist', summary: 'ID, arrival time, what you can bring, calculator rules.' },
  { key: 'exam_national', number: 6, title: 'Pass the National portion', summary: 'Pearson VUE, National portion.' },
  { key: 'exam_state', number: 6, title: 'Pass the State portion', summary: 'Pearson VUE, Nevada State portion.' },
  { key: 'fingerprints', number: 7, title: 'Fingerprints and background check', summary: 'Best done after you pass and choose a broker.' },
  { key: 'application', number: 8, title: 'Submit your salesperson license application', summary: 'Form and fee from NRED.' },
  { key: 'license', number: 9, title: 'License issued', summary: 'You are a Nevada real estate salesperson.' },
  { key: 'post_licensing', number: 10, title: 'After licensing', summary: 'Post-licensing education.' },
];

export function stepStatus(rm: Record<string, RoadmapStep>, key: string) { return rm[key]?.status ?? 'not_started'; }

export function currentStepLabel(rm: Record<string, RoadmapStep>): string {
  const next = ROADMAP_STEPS.find((s) => stepStatus(rm, s.key) !== 'done');
  return next ? `${next.number}. ${next.title}` : 'All steps done';
}
export function roadmapProgress(rm: Record<string, RoadmapStep>) {
  const done = ROADMAP_STEPS.filter((s) => stepStatus(rm, s.key) === 'done').length;
  return { done, total: ROADMAP_STEPS.length };
}
// If one exam portion is logged as failed and the other passed, study focuses on the failed one.
export function focusPortion(rm: Record<string, RoadmapStep>): 'national' | 'state' | null {
  const n = stepStatus(rm, 'exam_national'), s = stepStatus(rm, 'exam_state');
  if (n === 'failed' && s !== 'failed') return 'national';
  if (s === 'failed' && n !== 'failed') return 'state';
  return null;
}
