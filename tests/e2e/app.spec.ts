import { expect, test, type Page, type BrowserContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
// @ts-expect-error plain JS helper
import { makeUser, resetDb, sql, makeForm } from '../backend/helpers.mjs';

const PASSWORD = 'Test-password-123';

async function signIn(page: Page, email: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 20000 });
}
const verifyAll = () => sql(`update questions set status = 'verified' where pool = 'lesson'; update concept_cards set status = 'verified'; update terms set status = 'verified';`);
function onboarded(email: string) {
  sql(`update profiles set onboarded_at = now(), disclaimer_ack_at = now(), full_name = 'Test User', prefs = '{"heartsUnlimited":true}', prefs_updated_at = now() where email = '${email}'`);
}
async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.active, null, { timeout: 20000 });
}
// Answers whatever is on screen until the session ends, driven by the
// lesson footer button (Next card / Check / Sure / Continue / Finish).
async function playThrough(page: Page, stopAtFirstChoice = false) {
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(250);
    const footer = page.locator('.footer-bar button:enabled').first();
    if (await footer.count()) {
      const t = (await footer.textContent())?.trim();
      if (t === 'Finish') { await footer.click(); return; }
      if (t === 'Sure' && stopAtFirstChoice) { await footer.click(); return; }
      await footer.click();
      continue;
    }
    if (await page.getByRole('group', { name: 'Terms' }).count()) {
      const terms = page.getByRole('group', { name: 'Terms' }).getByRole('button');
      for (let t = 0; t < 5; t++) for (let d = 0; d < 5; d++) {
        if (await terms.nth(t).isDisabled()) break;
        await terms.nth(t).click();
        const def = page.getByRole('group', { name: 'Definitions' }).getByRole('button').nth(d);
        if (await def.isEnabled()) await def.click();
        await page.waitForTimeout(400);
      }
      continue;
    }
    if (await page.getByLabel('Number keypad').count()) { await page.getByRole('button', { name: '4', exact: true }).click(); continue; }
    const bank = page.getByLabel('Items to place').getByRole('button');
    if (await bank.count()) { while (await bank.count()) await bank.first().click(); continue; }
    if (await page.getByRole('radio').count()) await page.getByRole('radio').first().click();
  }
  throw new Error('lesson did not finish');
}

test.beforeAll(() => { resetDb(); });

test('right/wrong feedback works without color: icons and text', async ({ page }) => {
  await makeUser('a11y@test.dev', 'admin'); onboarded('a11y@test.dev');
  await signIn(page, 'a11y@test.dev');
  await page.getByRole('link', { name: /Real or Personal\?/ }).click();
  await playThrough(page, true);
  const fb = page.getByRole('status').filter({ hasText: /Correct\.|Incorrect\./ });
  await expect(fb).toBeVisible();
  await expect(fb.locator('svg').first()).toBeVisible();
  await expect(page.getByText('Correct answer', { exact: true })).toHaveCount(1); // screen-reader label on the right option
});

test('lessons and fonts work in airplane mode, then sync when back online', async ({ page, context }) => {
  await makeUser('offline@test.dev', 'student'); onboarded('offline@test.dev');
  verifyAll();
  await signIn(page, 'offline@test.dev');
  await waitForServiceWorker(page);
  await page.reload();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible({ timeout: 15000 });
  expect(await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 20px Outfit') && document.fonts.check('400 16px Inter'); })).toBe(true);
  const fontsLoaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  expect(fontsLoaded.join()).toContain('Outfit');
  await page.getByRole('link', { name: /Real or Personal\?/ }).click();
  await playThrough(page);
  await expect(page.getByRole('heading', { name: 'Lesson complete.' })).toBeVisible();
  const uid = sql(`select id from profiles where email = 'offline@test.dev'`);
  expect(sql(`select count(*) from progress_events where user_id = '${uid}' and kind = 'lesson_complete'`)).toBe('0');
  await context.setOffline(false);
  await expect.poll(() => sql(`select count(*) from progress_events where user_id = '${uid}' and kind = 'lesson_complete'`), { timeout: 20000 }).toBe('1');
});

test('progress from two devices merges: XP and completions add up', async ({ browser }) => {
  test.setTimeout(360_000);
  await makeUser('twodev@test.dev', 'student'); onboarded('twodev@test.dev'); verifyAll();
  const devA = await browser.newContext(); const devB = await browser.newContext();
  const a = await devA.newPage(), b = await devB.newPage();
  await signIn(a, 'twodev@test.dev'); await signIn(b, 'twodev@test.dev');
  await waitForServiceWorker(a); await waitForServiceWorker(b);
  await devA.setOffline(true); await devB.setOffline(true);
  // Each device does a different activity while offline.
  await a.getByRole('link', { name: /Real or Personal\?/ }).click();
  await playThrough(a);
  await b.goto('/placement/U01').catch(() => {});
  await b.getByRole('button', { name: 'Start the check' }).click();
  await playThrough(b);
  await devA.setOffline(false); await devB.setOffline(false);
  const uid = sql(`select id from profiles where email = 'twodev@test.dev'`);
  await expect.poll(() => sql(`select count(*) from progress_events where user_id = '${uid}' and kind in ('lesson_complete','placement')`), { timeout: 20000 }).toBe('2');
  // Each device pulls the other's progress: total XP shown is the sum.
  const total = Number(sql(`select sum(xp) from progress_events where user_id = '${uid}'`));
  for (const p of [a, b]) {
    await p.goto('/stats');
    await expect(p.getByText('Total XP').locator('..').locator('.num')).toHaveText(String(total), { timeout: 20000 });
  }
  await devA.close(); await devB.close();
});

test('Invite stays disabled for students until the launch gate is met', async ({ page }) => {
  await makeUser('boss@test.dev', 'admin'); onboarded('boss@test.dev');
  sql(`update questions set status = 'unverified'`);
  await signIn(page, 'boss@test.dev');
  await page.goto('/admin/invite');
  await page.getByLabel('Email').fill('someone@test.dev');
  await expect(page.getByRole('button', { name: 'Send invitation' })).toBeDisabled();
  await expect(page.getByText('Student invites stay off')).toBeVisible();
  await page.getByLabel('Role').selectOption('reviewer');
  await expect(page.getByRole('button', { name: 'Send invitation' })).toBeEnabled();
});

test('Exam Day timer keeps running and answers survive closing the app', async ({ browser }) => {
  const u = await makeUser('examer@test.dev', 'student'); onboarded('examer@test.dev');
  makeForm('E2E-N1', 'national');
  sql(`insert into progress_events (id, user_id, kind, occurred_at, local_date, payload) select gen_random_uuid(), '${u.id}', 'unit_complete', now(), current_date, jsonb_build_object('unit', id) from units`);
  let ctx: BrowserContext = await browser.newContext();
  let page = await ctx.newPage();
  await signIn(page, 'examer@test.dev');
  await page.goto('/exam');
  await page.getByRole('button', { name: 'Start National' }).click();
  await page.getByRole('button', { name: 'Start the clock' }).click();
  await expect(page.getByText(/Question 1 of 85/)).toBeVisible();
  await page.getByRole('radio').nth(2).check();
  await page.getByRole('button', { name: /Next/ }).click();
  await page.getByLabel('Mark for review').check();
  await page.getByRole('button', { name: /Previous/ }).click();
  await page.waitForTimeout(6000); // autosave interval
  const before = await page.getByRole('timer').textContent();
  await ctx.close(); // "close the app"
  await new Promise((r) => setTimeout(r, 4000));
  ctx = await browser.newContext(); page = await ctx.newPage();
  await signIn(page, 'examer@test.dev');
  await page.goto('/exam');
  await page.getByRole('link', { name: 'Resume' }).click();
  await expect(page.getByText(/Question 1 of 85/)).toBeVisible();
  await expect(page.getByRole('radio').nth(2)).toBeChecked();
  const after = await page.getByRole('timer').textContent();
  const secs = (t: string | null) => { const [h, m, s] = (t ?? '').replace(/[^\d:]/g, '').split(':').map(Number); return h * 3600 + m * 60 + s; };
  expect(secs(before) - secs(after)).toBeGreaterThanOrEqual(4);
  await page.getByRole('button', { name: 'Review', exact: true }).click();
  await expect(page.getByRole('button', { name: /Question 2, unanswered, marked for review/ })).toBeVisible();
  await page.getByRole('button', { name: 'End exam' }).click();
  await page.getByRole('button', { name: 'End exam and see my score' }).click();
  await expect(page.getByText(/scored questions correct/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Pretest questions were not scored.')).toBeVisible();
  await ctx.close();
});

test('"New version available. Tap to update." appears after a new version is published', async ({ page }) => {
  await makeUser('updater@test.dev', 'student'); onboarded('updater@test.dev');
  await signIn(page, 'updater@test.dev');
  await waitForServiceWorker(page);
  // Publish a new version: rebuild with a changed file, which changes the service worker.
  fs.writeFileSync('public/version.txt', String(Date.now()));
  execSync('npx vite build', { stdio: 'ignore' });
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
  await expect(page.getByText('New version available. Tap to update.')).toBeVisible({ timeout: 30000 });
  await page.evaluate(() => { (window as unknown as { beforeUpdate: boolean }).beforeUpdate = true; });
  await page.getByRole('button', { name: 'Update' }).click();
  await expect.poll(() => page.evaluate(() => !(window as unknown as { beforeUpdate?: boolean }).beforeUpdate).catch(() => false), { timeout: 20000 }).toBe(true);
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('New version available. Tap to update.')).toHaveCount(0);
});

test('password reset link from the email template opens "Choose a new password" and works', async ({ page }) => {
  await makeUser('resetme@test.dev', 'student'); onboarded('resetme@test.dev');
  // @ts-expect-error plain JS helper
  const { service } = await import('../backend/helpers.mjs');
  const { data } = await service().auth.admin.generateLink({ type: 'recovery', email: 'resetme@test.dev' });
  await page.goto(`/set-password?mode=reset&token_hash=${data.properties.hashed_token}&type=recovery`);
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible({ timeout: 15000 });
  await page.getByLabel('New password').fill('Fresh-pass-2026');
  await page.getByLabel('Type it again').fill('Fresh-pass-2026');
  await page.getByRole('button', { name: 'Save new password' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 15000 });
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Email').fill('resetme@test.dev');
  await page.getByLabel('Password').fill('Fresh-pass-2026');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible({ timeout: 15000 });
});

test('an expired or reused email link shows a clear message', async ({ page }) => {
  await page.goto('/set-password?mode=invite&token_hash=not-a-real-token&type=invite');
  await expect(page.getByRole('heading', { name: 'That link has expired' })).toBeVisible({ timeout: 15000 });
});
