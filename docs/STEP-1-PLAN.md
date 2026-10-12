# YPFG Academy — Step 1: Coverage Map, Unit Plan, Exam Forms, Backend

Status: **DRAFT, waiting for owner approval.** Nothing gets built until you OK this.

---

## 0. Read this first: the source documents did not arrive

Your message says the Pearson VUE **Nevada Real Estate Candidate Handbook** and **Content Outlines** are attached. No files came with it. The repository only has a README. I also tried to download them from pearsonvue.com, but this build environment's network blocks that site.

From public search results I could confirm:

- The current Nevada content outline is Pearson VUE publication **#092901**, "Nevada Real Estate Content Outlines," **effective January 15, 2025**. The State portion is **40 scored items** for salespersons, plus **5–10 pretest items**.
- The National portion is **80 scored items**. Several 2025 Pearson VUE state outlines reprint a National salesperson outline effective April 1, 2025.
- **Change since your brief:** as of **July 29, 2025**, candidates must register and pay through the **NRED website** before they can schedule with Pearson VUE. Roadmap step 4 will say this.

I could **not** get the exact subtopic wording or the item count per topic, so:

- The topic and subtopic structure below is my best reconstruction of the Pearson VUE National salesperson outline and the Nevada State outline.
- **Every item count is marked `[verify]`.** None of them is official until it's checked against your PDF.
- The plan below is built so that once the real numbers are in, every target recalculates automatically from one settings table. No other rework is needed.

**What I need from you:** put the two PDFs into the repo. On github.com, open `cjtabaldo/ypfg-academy`, choose **Add file → Upload files**, drag the PDFs in, and press **Commit changes**. You can also paste the outline text into the chat. Then I'll replace this draft with the exact outline and tell you every place it differs.

Outline version to store in Settings: **"Content Outlines 01/15/2025 (#092901)" [verify]**

---

## 1. Coverage map (draft)

Course codes: **PRIN** = Real Estate Principles, **LAW** = Real Estate Law, **CON** = Contracts, **AGY** = Agency.

How the per-topic targets are computed:

- **Lesson Pool (LP)** for a topic = the larger of (10 × number of subtopics) or (8 × the topic's official item count), split evenly across its subtopics.
- **Concept Cards (CC)** = 2 per subtopic, or 3 when the topic has 8 or more official items.
- **Exam Pool** per form = the official item count for each topic.

### National portion — 80 scored items

| # | Topic | Items `[verify]` | Course | Subtopics (line items) | CC | LP |
|---|---|---|---|---|---|---|
| N1 | Property ownership | 8 | PRIN | 1.1 Real vs. personal property; fixtures, trade fixtures, emblements · 1.2 Land characteristics and legal descriptions (metes and bounds, lot and block, rectangular survey) · 1.3 Encumbrances: liens and priority, easements, licenses, encroachments · 1.4 Estates: freehold and leasehold · 1.5 Forms of ownership: severalty, tenancy in common, joint tenancy, business entities and trusts · 1.6 Condominiums, cooperatives, PUDs, timeshares | 18 | 64 |
| N2 | Land use controls and regulations | 5 | PRIN | 2.1 Government rights: taxation, special assessments, eminent domain, police power, escheat · 2.2 Public controls: zoning, master plans, variances, nonconforming use, building codes, subdivision rules · 2.3 Environmental and special-land regulation: wetlands, flood zones, CERCLA · 2.4 Private controls: CC&Rs, deed restrictions, HOAs | 8 | 40 |
| N3 | Valuation and market analysis | 7 | PRIN | 3.1 Appraisal purpose, process, and when a licensed or certified appraiser is required · 3.2 Value concepts and economic principles (highest and best use, substitution, conformity, contribution, types of depreciation) · 3.3 Sales comparison approach and adjustments · 3.4 Cost approach · 3.5 Income approach (cap rate, GRM/GIM) · 3.6 CMA and BPO vs. appraisal | 12 | 60 |
| N4 | Financing | 8 | PRIN | 4.1 Core concepts: LTV, points, PMI/MIP, equity · 4.2 Loan types: conventional, FHA, VA, USDA, fixed vs. ARM, balloon, reverse, home equity, construction, seller financing · 4.3 Instruments and clauses: note, mortgage vs. deed of trust, lien vs. title theory, acceleration, alienation, prepayment, subordination · 4.4 Lending process and secondary market · 4.5 Lending laws: TILA/Reg Z, RESPA, TRID, ECOA, mortgage fraud, predatory lending | 15 | 64 |
| N5 | General principles of agency | 11 | AGY | 5.1 Agency vs. non-agency relationships; universal, general, and special agency; subagency; dual agency; transaction brokerage · 5.2 Creating and ending agency · 5.3 Fiduciary duties to clients · 5.4 Duties to customers and third parties; misrepresentation, puffing, fraud · 5.5 Agency disclosure and conflicts of interest | 15 | 88 |
| N6 | Property condition and disclosures | 6 | LAW | 6.1 Property inspections and the licensee's role · 6.2 Environmental hazards: lead paint (pre-1978), radon, mold, asbestos, USTs, other hazards · 6.3 Material facts, latent defects, stigmatized property, seller and licensee disclosure duties | 6 | 48 |
| N7 | Contracts | 12 | CON | 7.1 Contract law: elements of a valid contract; valid, void, voidable, unenforceable; statute of frauds · 7.2 Performance, discharge, assignment, novation, breach, remedies · 7.3 Listing agreements · 7.4 Buyer and tenant representation agreements · 7.5 Purchase agreements: offers, counteroffers, multiple offers, earnest money, contingencies · 7.6 Options, rights of first refusal, land contracts | 18 | 96 |
| N8 | Leasing and property management | 3 | PRIN | 8.1 Property manager duties and management agreements · 8.2 Leasehold estates and lease types (gross, net, percentage, ground) · 8.3 Landlord and tenant rights, termination, eviction, fair housing and ADA in rentals | 6 | 30 |
| N9 | Transfer of title | 5 | LAW | 9.1 Deeds: elements, types, delivery, recording · 9.2 Title: search, abstract, chain of title, title insurance, quiet title · 9.3 Closing and escrow: Closing Disclosure, closing costs, proration concepts · 9.4 Special transfers: foreclosure, short sale, REO, adverse possession, probate, tax aspects | 8 | 40 |
| N10 | Practice of real estate | 11 | LAW | 10.1 Trust and escrow funds: commingling, conversion · 10.2 Fair housing: 1866 Civil Rights Act, Fair Housing Act and amendments, steering, blockbusting, redlining, exemptions, ADA · 10.3 Advertising and solicitation rules: Do Not Call, TCPA, CAN-SPAM · 10.4 Antitrust: price fixing, boycotts, market allocation, tie-ins · 10.5 Supervision, independent contractor vs. employee · 10.6 Ethics, risk management, records, wire fraud and cybersecurity | 18 | 88 |
| N11 | Real estate calculations | 4 | PRIN | 11.1 Commission, splits, seller's net · 11.2 Prorations (360-day vs. 365-day) · 11.3 Financing math: LTV, points, interest, amortization basics, qualifying ratios · 11.4 Valuation and investment math: cap rate, GRM, adjustments, depreciation, ROI, equity · 11.5 Area, volume, acreage, front feet · 11.6 Property tax and transfer tax | 12 | 60 |
| | **National total** | **80** | | **54 subtopics** | **136** | **678** |

Math questions also appear inside N3, N4, N8, and N9 wherever a calculation applies.

### Nevada State portion — 40 scored items (topic split `[verify]`, not yet known)

Until the handbook is in, each State subtopic gets the floor (2 CC, 10 LP), plus extra so the State Lesson Pool totals 8 × 40 = 320.

| # | Topic | Course | Subtopics |
|---|---|---|---|
| S1 | Real Estate Division and Commission: authority and powers | LAW | 1.1 Structure, powers, and duties of NRED and the Commission; investigations · 1.2 Disciplinary procedures: complaints, hearings, fines, penalties, appeals · 1.3 Education, Research and Recovery Fund |
| S2 | Licensing | LAW | 2.1 Activities that require a license; exemptions; unlicensed activity · 2.2 License types and permits: salesperson, broker-salesperson, broker, property management permit, business broker permit · 2.3 Requirements for an original license · 2.4 Active and inactive status, changing brokers, renewal, continuing education, post-licensing education |
| S3 | Licensee conduct and broker supervision | LAW | 3.1 Broker supervision; the broker–salesperson relationship; compensation only through the broker · 3.2 Trust accounts and client funds · 3.3 Advertising rules · 3.4 Prohibited acts, grounds for discipline, record keeping |
| S4 | Agency under Nevada law | AGY | 4.1 Duties owed by a Nevada licensee; the Duties Owed form · 4.2 Multiple representation (Consent to Act) and assigned agency · 4.3 Nevada brokerage agreements |
| S5 | Nevada disclosures and contract practice | CON | 5.1 Seller's Real Property Disclosure · 5.2 Other required Nevada disclosures: Residential Disclosure Guide, open range, CIC resale package, others per the outline · 5.3 Nevada purchase agreement practice and presenting offers |
| S6 | Nevada ownership and special topics | LAW | 6.1 Community property and forms of ownership in Nevada · 6.2 Water rights: prior appropriation, beneficial use, State Engineer, domestic wells · 6.3 Common-interest communities · 6.4 Land sales, subdivisions, timeshares `[verify — include only if the outline lists them]` |
| S7 | Property management in Nevada | PRIN | 7.1 Property management permit; property management agreements · 7.2 Nevada landlord–tenant and handling rental funds `[verify — include only if the outline lists it]` |
| | **State total: 40 items** | | **23 subtopics, about 50 CC, 320 LP** |

### Cross-check against your required list

Every National and State area you listed appears above. I added these, each marked `[verify]` until the outline confirms it:

- Land sales and timeshares (S6.4)
- Nevada landlord–tenant (S7.2)
- Nevada transfer tax as a State math item. National N11.6 covers the general method, and Nevada rates will be `[verify citation]`.

If the real outline is missing something you listed, I'll tell you instead of adding it quietly.

### Totals at a glance

| | Subtopics | Concept Cards | Lesson Pool | Terms (glossary) |
|---|---|---|---|---|
| National | 54 | ~136 | ~678 | ~300 |
| State | 23 | ~50 | ~320 | ~100 |
| **All** | **77** | **~186** | **~1,000** | **~400** |

---

## 2. Unit list (the Path)

One vertical path: National first, then State, shown as two clearly separated sections. Each unit has one lesson per subtopic, plus extra lessons for heavier topics (+2 for 10 or more items, +1 for 7–9 items), plus a unit review.

| Unit | Course | Lessons + review |
|---|---|---|
| **NATIONAL** | | |
| 1 Property Ownership | PRIN | 7 + R |
| 2 Land Use Controls | PRIN | 4 + R |
| 3 Valuation & Market Analysis | PRIN | 7 + R |
| 4 Financing | PRIN | 6 + R |
| 5 Agency Principles | AGY | 7 + R |
| 6 Property Condition & Disclosures | LAW | 3 + R |
| 7 Contracts | CON | 8 + R |
| 8 Leasing & Property Management | PRIN | 3 + R |
| 9 Transfer of Title | LAW | 4 + R |
| 10 Practice of Real Estate | LAW | 8 + R |
| 11 Math I: Commission, Prorations, Area, Taxes | PRIN | 4 + R |
| 12 Math II: Financing & Investment Math | PRIN | 3 + R |
| **NEVADA STATE** | | |
| 13 NRED, the Commission & Discipline | LAW | 3 + R |
| 14 Nevada Licensing | LAW | 4 + R |
| 15 Conduct, Supervision & Trust Funds | LAW | 4 + R |
| 16 Agency in Nevada | AGY | 3 + R |
| 17 Nevada Disclosures & Contracts | CON | 3 + R |
| 18 Nevada Ownership, Water & CICs | LAW | 4 + R |
| 19 Nevada Property Management | PRIN | 2 + R |

That's about **87 lessons + 19 unit reviews**, roughly 9 hours of core path at 5 minutes each. At 3 lessons a day that's about 5 weeks. The State lesson counts will be re-weighted once the official split is known.

Each lesson opens with 1–2 Concept Cards, then 10–12 exercises. At least half are exam-style multiple choice. The rest mix in match pairs, true/false, number entry, put-in-order, and "What should the agent do?"

---

## 3. Exam Pool form plan

| | Scored per form | Pretest per form | Minimum (4 forms) | **Recommended (6 forms)** |
|---|---|---|---|---|
| National | 80, weighted by the N1–N11 counts | 5 | 320 + 20 | **480 + 30** |
| State | 40, weighted by the official split | 5–10 (I'll use 8) | 160 + 32 | **240 + 48** |

**Why I recommend 6 forms per portion, not 4.** The Ready to Test badge needs a pass on both portions on two *different unseen* forms *in a row*.

- A student who fails form 1, passes form 2, then fails form 3 has only one unseen form left with 4 forms.
- With 4 forms, many honest learners would run out before they could earn the badge.
- 6 forms gives a realistic path. The launch gate still requires only 4.

Your call.

Other form rules:

- Exam Pool and Lesson Pool never share a question id or test the same fact. The database blocks it with a uniqueness check across both pools.
- Pretest items are unscored. They're mixed in at random positions and look exactly like scored items.

---

## 4. Backend recommendation: Supabase (free plan) + Netlify (free hosting)

### Why Supabase over Firebase

1. **Your security rules need real database enforcement.** Examples: "students can't read unverified content," "Exam Pool readable only during an active Exam Day session," "nobody sees another user's data." Supabase is a Postgres database with **Row Level Security**, so those rules live inside the database.
   - Exam questions are handed out one form at a time by a database function. The function checks for an active session and **never sends the answer key to the phone**.
   - Scoring happens on the server.
   - Even someone inspecting network traffic can't get around these rules.
2. **Invite-only is built in.** You turn off public sign-ups with one switch, and only an invite from the Admin creates an account.
3. **Your content is relational**: questions, versions, forms, topics, analytics, coverage counts. SQL handles those reports easily. Firebase's database makes them awkward.
4. **No credit card needed for the scheduled jobs.** Firebase requires its pay-as-you-go plan, with a card on file, for server functions. Supabase's free plan includes them. They power the streak-saver email and the invite check.

### Supabase free-tier limits [verify on supabase.com/pricing; they change]

| Resource | Free limit | Your expected use (≤ 50 invited users) |
|---|---|---|
| Database size | 500 MB | ~20–40 MB |
| Monthly active users | 50,000 | ≤ 50 |
| Bandwidth (egress) | 5 GB/month | well under 1 GB |
| File storage | 1 GB | mascot images only |
| Edge Function calls | 500,000/month | a few thousand |
| Projects | 2 active | 1 |

**Two catches on the free plan:**

1. **A project pauses after 7 days with no activity.** With daily study it won't happen. If everyone stops for a week, you press "Restore" in the dashboard and nothing is lost.
2. **There are no automatic backups.** That's why the app's CSV/JSON content export matters. Run it after each content session.

**What would cost money:**

- Going over any limit above.
- Wanting daily backups and no pausing. That's the **Pro plan, $25/month** `[verify]`.
- For a private invite-only group, you are very unlikely to need it.

### Email

Supabase's built-in email is for testing only and allows just a few emails per hour. Invites, password resets, and streak-saver emails need a real email sender. I recommend **Resend**: free for **3,000 emails/month, 100/day** `[verify]`. It plugs into Supabase in a few clicks.

**Cost trigger:** more than 100 emails a day. At 50 users with streak-savers on, that's roughly the ceiling, so I'll cap streak-saver sends to stay inside it.

### Sign-in method: email + password, with password reset

I recommend this over email sign-in links. On iPhone, a sign-in link in Mail opens **Safari**, not the installed home-screen app. The app and Safari keep separate storage, so the user ends up "signed in" in the wrong place. Passwords avoid that completely. Reset is a link that opens a set-new-password screen.

### Hosting: Netlify free plan

- 100 GB bandwidth/month `[verify]`
- Free HTTPS
- Updates publish automatically when code is pushed

GitHub Pages also works, but its free plan only publishes from a public repository. Netlify works with a private one.

Free address: `ypfg-academy.netlify.app` (or similar). A custom domain is optional, about $12–20/year from any registrar.

The full click-by-click setup guides for Supabase, Resend, and Netlify come in Step 6. They assume no developer experience.

---

## 5. How the app will be built (short version)

- **App:** Vite + TypeScript + React, as an installable PWA. The code is split into `src/app` (logic), `src/styles`, `src/config`, and `src/content`. Later it can be wrapped for the App Store and Google Play with Capacitor, no rewrite needed. The Outfit and Inter font files ship inside the app, and the service worker caches lessons for offline use.
- **Offline sync:** every answer, XP gain, and lesson completion is stored on the phone as an event with a unique id, then uploaded when the phone is online.
  - The server keeps every event.
  - XP and completions are *sums of events*, so two devices add together and never overwrite.
  - For each question, the newest answer by timestamp wins.
- **Exam Day timer:** the server records the start time, and the remaining time is always computed from it. Closing the app doesn't stop the clock.
- **Streaks:** computed in each user's own time zone, which is saved in their profile.
- **Update prompt:** the service worker detects a new version and shows "New version available. Tap to update."

---

## 6. Things in your brief I'll mark `[verify]`, or that may change once I see the documents

- The 120-hour split (45 / 45 including 18 hours of Nevada law / 15 / 15)
- Exam-pass validity (12 months)
- Fingerprint validity (2 months)
- License application form number and fee
- Post-licensing requirement

All of these display as "[verify]" with an admin field for the NRED source link until you confirm them. I won't fill them in from memory.

Exam-day interface details also wait for the handbook: mark-for-review, moving between questions, calculator rules, ID and arrival rules.

**Honest workload note:** about 1,000 Lesson Pool questions, about 186 Concept Cards, and about 800 Exam Pool items (6 forms). Every one starts **Unverified**, and students only see what you or your Reviewer verify. At roughly a minute per item, that's **25–35 hours of human review** before the launch gate opens. The review queue will be fast — one tap to verify, edit inline — but the time is real.

---

## Approval checklist

Reply with OK, or with changes, on each:

1. Upload the handbook and outline PDFs (or say "proceed on draft and reconcile later").
2. Backend: Supabase + Resend + Netlify.
3. Sign-in: email + password with reset.
4. Exam forms: 4 or 6 per portion.
5. Unit list and lesson counts as above (State counts re-weighted once the official split is known).
