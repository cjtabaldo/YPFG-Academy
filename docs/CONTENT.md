# Content: how it works

## Where content lives

- **The database is the live copy.** Admins and Reviewers add, edit, verify, and reject questions, Concept Cards, and terms inside the app (Admin > Questions & cards, Review queue). No code is needed.
- **`/content` is the starter set.** It holds the coverage map (`outline.json`), the term bank, Concept Cards, Lesson Pool questions, and Exam Pool forms, written for the first seeding.
  - `npm run content:seed` turns it into `supabase/seed.sql`.
  - Seeding **never overwrites** something that already exists, so edits made in the app are safe.

## Rules the content follows (checked by `npm run content:check`)

- Every item traces to a subtopic on the coverage map and is tagged with the outline version.
- **Concept Cards:**
  - Must be under 80 words, counting the explanation, the Nevada example, and the memory hook.
  - Pull their terms from the shared term bank.
- **Multiple choice:**
  - Exactly 4 options.
  - A "why it's wrong" note for every wrong option.
  - Answer positions are randomized when seeded and again each time a question is shown.
- **Math:**
  - Every question shows the formula and worked steps.
- **Facts and pools:**
  - Each question has a **fact key**. No two questions, in either pool, may test the same fact.
  - Question ids are unique across both pools. The database also blocks moving a question between pools.
- **Nevada rules:**
  - Cite NRS/NAC chapters only when sure; otherwise write `[verify citation]`.
  - Every question and card starts **Unverified**. Students see only what a Reviewer or Admin verified.
- **Originality:**
  - All questions are written originally. None are copied from prep companies or the Pearson VUE handbook samples.

## Targets per subtopic (from the coverage map)

- **Concept Cards:** 2, or 3 where the topic carries 8 or more official items.
- **Lesson Pool:** the larger of 10 per subtopic or 8 × the topic's official item count, spread across its subtopics.
- **Exam Pool:** for each form, the official item count per topic. Pretest items are extra.

Once you confirm the official item counts in **Admin > Outline**, the coverage report and the form builder follow the new numbers automatically.
