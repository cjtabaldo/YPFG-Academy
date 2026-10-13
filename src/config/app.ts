// Study mechanics. Tune numbers here.
export const DAILY_GOALS = [10, 20, 30, 50] as const;

export const XP = {
  lesson: 10,
  unitReview: 15,
  practice: 8,
  placementPass: 20,
  perfectBonus: 5,
  speedBonus: 3,
  speedSecondsPerExercise: 20,
} as const;

export const HEARTS = {
  max: 5,
  refillMinutes: 120, // one heart back every 2 hours
} as const;

export const STREAK = {
  freezeEarnDays: 3, // hit your daily goal this many days in a row to earn a freeze
  milestones: [7, 30, 100],
} as const;

// Spaced repetition boxes: days until the item comes back.
export const SRS_DAYS = [0, 1, 3, 7, 16, 35] as const;

export const LESSON = {
  exercises: 11, // lessons have 10 to 12 exercises
  maxReviewItems: 2,
  placementQuestions: 10,
  placementPassPct: 80,
  practiceQuestions: 10,
} as const;

export const COURSES = {
  PRIN: { name: 'Real Estate Principles', hours: 45 },
  LAW: { name: 'Real Estate Law', hours: 45, note: 'Includes 18 hours of Nevada law' },
  CON: { name: 'Contracts', hours: 15 },
  AGY: { name: 'Agency', hours: 15 },
} as const;
export type CourseCode = keyof typeof COURSES;

export const OUTLINE_REMINDER_DAYS = 90;
