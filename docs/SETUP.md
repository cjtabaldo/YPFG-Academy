# Set up the backend (Supabase)

This guide assumes no developer experience. Budget about 45 minutes. You only do this once.

You'll set up three free services:

| Service | What it does for YPFG Academy | Cost |
|---|---|---|
| **Supabase** | Accounts, sign-in, the database (questions, progress), access rules, server functions | Free plan |
| **Resend** (or Gmail) | Sends invitation, password-reset, and streak-saver emails | Free plan |
| **Netlify** | Puts the app on the web (see `docs/DEPLOY.md`) | Free plan |

## Why Supabase

- **The access rules live in the database.** Students physically can't read unverified content, Exam Pool questions, or anyone else's data, even by inspecting network requests. This app's rules are written as database policies and were tested that way.
- **Invite-only is built in.** You switch off public sign-up, and the database itself refuses any email that wasn't invited.
- **No credit card is needed** for the server functions used here (invitations, streak-saver emails). Firebase requires a paid plan with a card on file for those.

## Free-plan limits and what would cost money

These numbers come from third-party summaries; I couldn't reach Supabase's own pricing page from here. They change, so confirm them on [supabase.com/pricing](https://supabase.com/pricing).

| Supabase free plan | Limit | YPFG Academy with up to ~50 people |
|---|---|---|
| Database size | 500 MB | ~20–40 MB |
| Monthly active users | 50,000 | ≤ 50 |
| Bandwidth (egress) | sources say 5 GB/month (one says less) | well under 1 GB |
| Edge Function calls | about 500,000/month (unconfirmed) | about 1,000 (the streak-saver runs hourly: ~720) |
| Active projects | 2 | 1 |

**Two catches:**

1. **Pausing.** A free project **pauses after 7 days with no activity**. Daily studying keeps it awake. If it ever pauses, open the Supabase dashboard and press **Restore project**. Nothing is lost.
2. **No automatic backups.** Use **Admin > Export > Full backup** after every content session, and keep the file somewhere safe.

**What starts costing money:**

- Exceeding any limit above.
- Choosing to upgrade to **Pro: $25/month** for daily backups and no pausing.

For a private, invite-only group you are very unlikely to need it.

Resend's free plan allows **100 emails/day and 3,000/month**. When you hit the cap, sending pauses; nothing is billed. You'd only pay ($20/month) at roughly 100+ active streak-saver users.

---

## Part 1: Create the Supabase project (10 min)

1. Go to **supabase.com** and click **Start your project**. Sign in with GitHub (the same account that holds `cjtabaldo/ypfg-academy`).
2. Click **New project**.
   - **Name:** `ypfg-academy`
   - **Database password:** click **Generate a password**, then copy it into your password manager. You won't need it day to day.
   - **Region:** **West US (North California)**. It's the closest to Nevada.
   - **Plan:** Free.
3. Click **Create new project** and wait about 2 minutes.

## Part 2: Build the database (10 min)

You'll copy four files from GitHub into Supabase's SQL Editor and run them, **in this order**:

1. `supabase/migrations/20261013000001_schema.sql`
2. `supabase/migrations/20261013000002_security.sql`
3. `supabase/migrations/20261013000003_functions.sql`
4. `supabase/seed.sql` (the coverage map, the path, and the starting content)

For each file:

1. On github.com, open the repository, then click into the file.
2. Click the **Copy raw file** button (two overlapping squares, top right of the file).
3. In Supabase, open **SQL Editor** (left sidebar) and click **+ New query**.
4. Paste and click **Run**. You should see "Success. No rows returned."

If you see an error, don't run the next file. Copy the error message and send it to me.

## Part 3: Make yourself the Admin (3 min)

1. In **SQL Editor**, open a new query, paste this with your email, and click **Run**:

   ```sql
   insert into public.invites (email, role) values ('christopher.tabaldo@gmail.com', 'admin');
   ```

2. Go to **Authentication > Users** and click **Add user > Create new user**.
   - **Email:** the same address
   - **Password:** choose one and save it
   - Check **Auto Confirm User**
3. Click **Create user**. The database sees your invite and makes you an Admin.

## Part 4: Lock down sign-in (3 min)

1. **Authentication > Sign In / Providers**:
   - Under **User Signups**, turn **OFF** "Allow new users to sign up". This makes the app invite-only.
   - Make sure the **Email** provider is enabled.
2. **Authentication > URL Configuration**. You'll come back to this after Netlify gives you a web address (`docs/DEPLOY.md`, step 4):
   - **Site URL:** `https://ypfg-academy.netlify.app` (your real address)
   - **Redirect URLs:** add `https://ypfg-academy.netlify.app/**`

## Part 5: Email (10 min)

Supabase's built-in email only reaches your own team and allows a couple of emails an hour. To invite anyone else, connect a real sender. Choose one option.

### Option A (recommended): Resend with your own domain

Gives the best delivery, and also powers the streak-saver emails. It needs a domain you own (about $12/year from any registrar). You can use the same domain for the app's address.

1. Sign up at **resend.com**, then **Domains > Add domain**. Follow the steps to add the DNS records it shows at your registrar. Wait for "Verified".
2. **API Keys > Create API key** (Sending access). Copy it.
3. In Supabase: **Authentication > Emails > SMTP Settings** and turn on **Enable custom SMTP**:
   - **Host** `smtp.resend.com` · **Port** `465` · **Username** `resend` · **Password** your API key
   - **Sender email** `academy@yourdomain.com` · **Sender name** `YPFG Academy`

### Option B (no domain): your Gmail account

Free, but streak-saver emails stay off until you add Option A.

1. Turn on 2-Step Verification for your Google account. Then visit **myaccount.google.com/apppasswords** and create an app password named "YPFG Academy".
2. In Supabase **SMTP Settings**:
   - **Host** `smtp.gmail.com` · **Port** `465` · **Username** your Gmail address · **Password** the 16-character app password
   - **Sender email** your Gmail address · **Sender name** `YPFG Academy`

### Then, for either option: use the YPFG email copy

In **Authentication > Emails > Templates**:

- **Invite user**
  - Subject: `You're invited to YPFG Academy`
  - Body: paste everything from `supabase/templates/invite.html`
- **Reset password**
  - Subject: `Reset your YPFG Academy password`
  - Body: paste `supabase/templates/recovery.html`

## Part 6: Server functions (10 min)

These run invitations, account deletion, the streak-saver email, and unsubscribe. Create each one in the dashboard:

1. **Edge Functions > Deploy a new function > Via Editor**.
2. Name it **exactly** as below, delete the sample code, paste the file's contents, and click **Deploy function**.

| Function name | File to paste | After deploying |
|---|---|---|
| `admin-users` | `supabase/functions/admin-users/index.ts` | Leave "Verify JWT" **on** |
| `streak-saver` | `supabase/functions/streak-saver/index.ts` | In the function's **Details**, turn **Verify JWT off** |
| `unsubscribe` | `supabase/functions/unsubscribe/index.ts` | Turn **Verify JWT off** |

Then **Edge Functions > Secrets** and add:

| Name | Value |
|---|---|
| `APP_URL` | your app address, e.g. `https://ypfg-academy.netlify.app` |
| `CRON_SECRET` | any long random string. Make one at 1password.com/password-generator, then save it. |
| `RESEND_API_KEY` | your Resend API key (Option A only) |
| `EMAIL_FROM` | `YPFG Academy <academy@yourdomain.com>` (Option A only) |

## Part 7: Schedule the streak-saver (3 min, Option A only)

1. **Integrations > Cron**. Enable it if asked, then click **Create job**.
2. Fill it in:
   - **Name:** `streak-saver`
   - **Schedule:** `0 * * * *` (every hour)
   - **Type:** Supabase Edge Function, then pick `streak-saver`, method **POST**
   - **Headers:** add `x-cron-secret` with your `CRON_SECRET` value
3. Click **Create**.

Each person gets at most one email a day, only if they opted in, have a 3+ day streak, and haven't studied by the evening hour you choose. The default is 7 PM their local time; change it in **Admin > Outline**.

## Part 8: Copy two values for Netlify

**Project Settings > API**. Copy:

- **Project URL** (looks like `https://abcd1234.supabase.co`)
- **anon public** key (a long string starting `eyJ`)

These two are safe to put in the app. The **service_role** key is not: never paste it anywhere except the Supabase dashboard itself.

Now continue with `docs/DEPLOY.md`.

---

## Day-to-day admin

- **Invite a Reviewer:** Admin > Invite > Role: Reviewer. Allowed before launch, so your broker can start verifying content.
- **Invite students:** this unlocks automatically once the launch gate is met (Admin > Users shows progress).
- **Remove access / delete an account:** Admin > Users > tap the person.
- **Check for a new content outline:** the app reminds you every 90 days.
- **Back up:** Admin > Export after each content session.
