import type { CourseCode } from '../config/app';

export type Portion = 'national' | 'state';
export type Role = 'admin' | 'reviewer' | 'student';
export type ReviewStatus = 'unverified' | 'verified' | 'rejected';
export type ExerciseType = 'mcq' | 'tf' | 'number' | 'order' | 'scenario';

export interface Topic { id: string; portion: Portion; title: string; items: number; items_verified: boolean; course: CourseCode; sort: number }
export interface Subtopic { id: string; topic_id: string; title: string; sort: number; cc_target: number; lp_target: number; verify_note: string | null }
export interface Unit { id: string; portion: Portion; title: string; course: CourseCode; topic_ids: string[]; sort: number }
export interface Lesson { id: string; unit_id: string; title: string; kind: 'lesson' | 'review'; subtopic_ids: string[]; sort: number }

interface Reviewed { status: ReviewStatus; reviewed_by: string | null; reviewed_at: string | null; version: number; outline_version: string; citation: string | null }
export interface Term extends Reviewed { id: string; term: string; definition: string; subtopic_id: string }
export interface Card extends Reviewed { id: string; subtopic_id: string; title: string; body: string; example: string; memory_hook: string; term_ids: string[] }

export interface NumberAnswer { value: number; tolerance?: number; unit?: string }
export interface Question extends Reviewed {
  id: string; pool: 'lesson' | 'exam'; exam_form_id: string | null; is_pretest: boolean; portion: Portion;
  topic_id: string; subtopic_id: string; course: CourseCode; exercise_type: ExerciseType; difficulty: 1 | 2 | 3;
  level: 'recall' | 'application' | 'calculation'; prompt: string; options: string[];
  correct: number | number[] | NumberAnswer; explanation: string; wrong_explanations: string[]; memory_hook: string;
  formula: string | null; worked_steps: string[]; fact_key: string; created_at?: string; updated_at?: string;
}
export interface ExamForm { id: string; portion: Portion; name: string; status: ReviewStatus; reviewed_by: string | null; reviewed_at: string | null; created_at: string }

export interface VerifyItem { key: string; category: string; label: string; value: string | null; note: string | null; source_url: string | null; verified_by: string | null; verified_at: string | null; sort: number }
export interface AppSettings { outline_version: string; outline_checked_at: string; streak_email_local_hour: number; planned_forms_per_portion: number }
export interface ExamConfig { portion: Portion; scored_items: number; pretest_min: number; pretest_max: number; minutes: number; pass_pct: number }

export interface Content {
  topics: Topic[]; subtopics: Subtopic[]; units: Unit[]; lessons: Lesson[];
  terms: Term[]; cards: Card[]; questions: Question[]; verify: VerifyItem[];
  settings: AppSettings; examConfig: ExamConfig[]; loadedAt: string;
}

export interface Prefs {
  heartsUnlimited?: boolean; sound?: boolean; listen?: boolean; listenRate?: number;
  textSize?: 'sm' | 'md' | 'lg' | 'xl'; theme?: 'system' | 'light' | 'dark';
}

export interface Profile {
  id: string; email: string; full_name: string; role: Role; disabled: boolean; created_at: string;
  joined_at: string | null; last_active_at: string | null; timezone: string; onboarded_at: string | null;
  disclaimer_ack_at: string | null; daily_goal: 10 | 20 | 30 | 50; reminder_time: string; target_exam_date: string | null;
  plan_start_date: string | null; school_name: string | null; broker_name: string | null;
  leaderboard_opt_in: boolean; leaderboard_name: string | null; streak_email_opt_in: boolean;
  deletion_requested_at: string | null; prefs: Prefs; prefs_updated_at: string;
}

export type EventKind =
  | 'answer' | 'lesson_complete' | 'unit_complete' | 'practice_complete' | 'placement'
  | 'heart_lost' | 'hearts_refilled' | 'card_seen' | 'term_seen' | 'hours_logged' | 'freeze_used';

export interface ProgressEvent {
  id: string; kind: EventKind; occurred_at: string; local_date: string; xp: number;
  payload: Record<string, unknown>; seq?: number; synced?: 0 | 1;
}

export type StepStatus = 'not_started' | 'in_progress' | 'done' | 'failed';
export interface RoadmapStep {
  step_key: string; status: StepStatus; started_on: string | null; done_on: string | null;
  notes: string; data: Record<string, unknown>; updated_at: string; dirty?: 0 | 1;
}

export interface ExamQuestionView { id: string; prompt: string; options: string[] }
export interface ExamAnswer { a: number | null; m: boolean; t: number }
export interface ExamStateActive {
  id: string; status: 'active'; portion: Portion; started_at: string; deadline: string; server_now: string;
  answers: Record<string, ExamAnswer>; questions: ExamQuestionView[];
}
export type ExamState = ExamStateActive | { id: string; status: 'submitted'; portion: Portion };

export interface TopicResult { topic: string; title: string; correct: number; total: number; pct: number; avg_seconds: number }
export interface ExamReview {
  id: string; portion: Portion; form_id: string; started_at: string; submitted_at: string; score_pct: number; passed: boolean;
  scored_correct: number; scored_total: number; pass_pct: number;
  results: { by_topic: TopicResult[]; pacing: { total_seconds: number; elapsed_seconds: number; avg_seconds: number; budget_seconds: number; slowest_topics: string[] } };
  items: Array<{ id: string; prompt: string; options: string[]; correct: number; explanation: string; wrong_explanations: string[]; memory_hook: string; citation: string | null; topic_id: string; subtopic_id: string; pretest: boolean; choice: number | null; ok: boolean; seconds: number }>;
}
export interface ExamSessionSummary { id: string; portion: Portion; started_at: string; deadline: string; submitted_at: string | null; score_pct: number | null; passed: boolean | null; by_topic: TopicResult[] | null }
export interface ExamOverview {
  unlocked: boolean; unseen_national: number; unseen_state: number;
  ready: { national_passes_in_a_row: number; state_passes_in_a_row: number; ready: boolean };
  config: Record<Portion, Omit<ExamConfig, 'portion'>>; sessions: ExamSessionSummary[];
}
