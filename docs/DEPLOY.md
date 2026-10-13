# Put YPFG Academy online (Netlify, free)

Do `docs/SETUP.md` first: you'll need the Supabase **Project URL** and **anon public** key. Budget about 15 minutes.

## Free-plan math (confirm on netlify.com/pricing)

Netlify's free plan gives **300 credits a month**. Third-party sources put the costs at:

- a production deploy: about 15 credits
- bandwidth: about 10–20 credits per GB

**What that means for you:**

- **Content edits cost nothing.** Questions, cards, and users live in Supabase, not in Netlify.
- **Only code changes trigger a deploy.** About 20 deploys a month fits in the free plan.
- **Each person downloads the app once** (about 1 MB), then it runs from their phone.
- **If credits run out, the site pauses** until next month. Nothing is billed.
- **To avoid that entirely**, Personal is $9/month. Or host on Cloudflare Pages, which is free with no bandwidth cap and works with the same steps: connect the GitHub repo, build `npm run build`, output `dist`, and add the same two environment variables.

## Steps

1. Go to **netlify.com** and sign up with **GitHub**.
2. Click **Add new project > Import an existing project > GitHub**, authorize, and choose **cjtabaldo/ypfg-academy**.
   - **Branch to deploy:** `main`. Use `claude/ypfg-academy-mobile-app-52xhxv` if you haven't merged yet.
   - **Build command** `npm run build` and **Publish directory** `dist` fill in automatically from `netlify.toml`.
3. Click **Add environment variables** and add both of these, exactly:

   | Key | Value |
   |---|---|
   | `VITE_SUPABASE_URL` | your Supabase Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your Supabase anon public key |

   Then click **Deploy**. The first build takes about 2 minutes.
4. **Site configuration > Change site name** to `ypfg-academy`. Your address is now `https://ypfg-academy.netlify.app`.
   - Go back to Supabase **Authentication > URL Configuration** and set the **Site URL** and **Redirect URLs** to this address (SETUP Part 4).
   - Set the `APP_URL` secret to it too (SETUP Part 6).
5. Open the address and sign in with the Admin email and password from SETUP Part 3.

## Optional: your own domain

**Domain management > Add a domain**, then follow Netlify's DNS steps. HTTPS is automatic. Then update the Supabase Site URL, the Redirect URLs, and `APP_URL`.

## Install on a phone

- **iPhone (Safari):** open the address, tap **Share**, then **Add to Home Screen**.
- **Android (Chrome):** open the address, tap the **⋮** menu, then **Install app**.

It opens full-screen like a regular app. Lessons work in airplane mode, and progress syncs when you're back online.

## Updating the app

Every time code is pushed to the deploy branch, Netlify rebuilds automatically. People with the app open see **"New version available. Tap to update."**

## If something goes wrong

| What you see | Fix |
|---|---|
| "Almost there. This copy isn't connected to its database." | The two environment variables are missing or misspelled. Fix them in Netlify **Site configuration > Environment variables**, then **Deploys > Trigger deploy**. |
| Invitation links open a blank page or say expired | Check the Supabase **Site URL** and **Redirect URLs** match your address exactly, including `https://`. |
| "That email has not been invited." | Invite them first in Admin > Invite. |
| The site loads but everything is empty | The Supabase project paused after a week without use. Open the Supabase dashboard and click **Restore project**. |
