# ypfg academy

**YPFG Academy by NextHome YourPickettFence Group.** *Your license starts here.*

A private, invite-only Progressive Web App that takes someone from today to holding a Nevada real estate salesperson license. It has three parts:

- **License Roadmap:** every licensing step tracked.
- **Study app:** a daily-habit path through every National and Nevada State outline topic.
- **Exam Day:** a simulator that tells people honestly when they're ready.

> YPFG Academy is a study and progress-tracking tool. It is not a Nevada Real Estate Division–approved pre-licensing course and does not count toward the 120 hours of required education.

## Start here

| If you want to… | Read |
|---|---|
| Set up the database, accounts and email | [`docs/SETUP.md`](docs/SETUP.md) |
| Put the app online and install it on a phone | [`docs/DEPLOY.md`](docs/DEPLOY.md) |
| See the coverage map and planning numbers | [`docs/STEP-1-PLAN.md`](docs/STEP-1-PLAN.md) |
| See test results and what still needs a human | [`docs/QA.md`](docs/QA.md) |
| Add or edit content | [`docs/CONTENT.md`](docs/CONTENT.md) |

## How it's built

```
src/
  config/      brand, study mechanics (XP, hearts, streak), environment
  lib/         app logic: sync engine, streak/XP/hearts derivation, spaced repetition,
               lesson builder, study plan, calendar file, CSV, text-to-speech
  state/       app state and offline-first sync
  screens/     auth, onboarding, student, exam, admin
  styles/      design tokens (black and white, light/dark), components
  ui/          shared components, icons, router
supabase/
  migrations/  tables, access rules (RLS), server functions (SQL)
  functions/   Edge Functions: admin-users, streak-saver, unsubscribe
  templates/   invitation and password-reset email copy
  seed.sql     generated from /content
content/       coverage map, units, terms, Concept Cards, questions (source of truth for seeding)
scripts/       icon generator, content validator, seed builder, local test stack
tests/         backend (access rules, functions), unit, end-to-end (Playwright)
```

- **Front end:** React and TypeScript, packaged as a PWA with Vite and Workbox.
  - The Outfit and Inter font files ship inside the app.
  - The code is ready to wrap with Capacitor for the App Store and Google Play without a rewrite.
- **Back end:** Supabase (Postgres with Row Level Security, Auth, Edge Functions).
  - Every rule is enforced in the database.
  - Exam Pool questions are served only by session functions, without answers.
- **Offline sync:** each answer, completion, and XP gain is an event with a unique id.
  - Devices upload their events and download everyone else's.
  - Totals are sums over all events, so devices add up and never overwrite.
  - For each question, the newest answer wins.

## Developer commands

```bash
npm install
cp .env.example .env            # add your Supabase URL and anon key
npm run dev                      # local dev server
npm run content:check            # validate /content against the brief's rules
npm run content:seed             # rebuild supabase/seed.sql from /content
npm run build                    # validate, type-check, build to dist/
npm run icons                    # regenerate app icons (needs Python + Pillow)

# Full test suite against a local Supabase stand-in (Postgres 16, Supabase Auth, PostgREST, Deno)
STACK_DIR=/path/with/binaries scripts/local-stack/up.sh
STACK_DIR=... scripts/local-stack/functions.sh
node --test --test-concurrency=1 tests/backend/        # access rules + functions
npx vitest run tests/unit                              # streaks, time zones, merge, files
npx playwright test                                    # browser end-to-end
```

## Mascot

The mascot is a black-and-white placeholder drawn in code. To replace it, drop four transparent 512×512 PNGs into `public/assets/` and redeploy:

- `mascot-idle.png`
- `mascot-correct.png`
- `mascot-wrong.png`
- `mascot-celebrate.png`
