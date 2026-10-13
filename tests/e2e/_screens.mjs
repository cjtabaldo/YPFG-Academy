import { chromium } from '@playwright/test';
import { makeUser, sql, makeForm } from '../backend/helpers.mjs';
const OUT = process.env.OUT;
const email = `shots${Date.now()}@test.dev`;
const u = await makeUser(email, 'admin');
sql(`update profiles set onboarded_at = now(), full_name = 'Chris Tabaldo', target_exam_date = current_date + 60, plan_start_date = current_date - 10, school_name = 'Silver State School' where email = '${email}'`);
sql(`insert into progress_events (id, user_id, kind, occurred_at, local_date, xp, payload) values
  (gen_random_uuid(), '${u.id}', 'hours_logged', now(), current_date, 0, '{"course":"PRIN","hours":12}'),
  (gen_random_uuid(), '${u.id}', 'lesson_complete', now() - interval '1 day', current_date - 1, 15, '{"lesson":"U01-L01"}')`);
try { makeForm(`SHOT-${Date.now()}`, 'national'); } catch {}
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
for (const scheme of ['light', 'dark']) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  await page.getByLabel('Email').fill(email); await page.getByLabel('Password').fill('Test-password-123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.getByRole('navigation', { name: 'Main' }).waitFor();
  const shots = scheme === 'light' ? ['/roadmap', '/stats', '/settings', '/exam', '/glossary', '/admin', '/admin/coverage', '/admin/review'] : ['/', '/roadmap'];
  for (const path of shots) {
    await page.goto('http://localhost:4173' + path);
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `${OUT}/${scheme}${path.replace(/\//g, '_') || '_home'}.png`, fullPage: path === '/roadmap' });
  }
  await ctx.close();
}
await browser.close();
