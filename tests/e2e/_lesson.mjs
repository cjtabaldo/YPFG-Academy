// Dev helper: signs in as an onboarded user and plays through a whole lesson.
import { chromium } from '@playwright/test';
const OUT = process.env.OUT;
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/');
await page.getByLabel('Email').fill('owner@test.dev');
await page.getByLabel('Password').fill('Test-password-123');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.getByRole('heading', { level: 1 }).first().waitFor();
await page.waitForTimeout(1000);
await page.screenshot({ path: `${OUT}/10-home-top.png` });
await page.getByRole('link', { name: /Real or Personal/ }).click();
let shots = 0;
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(250);
  const btn = async (name) => { const b = page.getByRole('button', { name, exact: true }); return (await b.count()) && (await b.first().isEnabled()) ? b.first() : null; };
  let b;
  if ((b = await btn('Next card')) || (b = await btn("Got it. Let's practice"))) { await b.click(); continue; }
  if ((b = await btn('Finish'))) { await b.click(); break; }
  if ((b = await btn('Continue'))) { if (shots < 4) await page.screenshot({ path: `${OUT}/2${shots++}-feedback.png` }); await b.click(); continue; }
  const terms = page.getByRole('group', { name: 'Terms' });
  if (await terms.count()) {
    await page.screenshot({ path: `${OUT}/30-match.png` });
    const tb = terms.getByRole('button');
    for (let t = 0; t < await tb.count(); t++) {
      for (let d = 0; d < 5; d++) {
        if (await tb.nth(t).isDisabled()) break;
        await tb.nth(t).click();
        const db = page.getByRole('group', { name: 'Definitions' }).getByRole('button');
        if (await db.nth(d).isEnabled()) await db.nth(d).click();
        await page.waitForTimeout(450);
      }
    }
    continue;
  }
  const radios = page.getByRole('radio');
  if (await radios.count()) {
    await radios.nth(i % (await radios.count())).click();
    if ((b = await btn('Sure'))) { await b.click(); continue; }
    if ((b = await btn('Check'))) { await b.click(); continue; }
  }
  const keypad = page.getByLabel('Number keypad');
  if (await keypad.count()) { await page.getByRole('button', { name: '4', exact: true }).click(); await page.getByRole('button', { name: '0', exact: true }).click(); await page.screenshot({ path: `${OUT}/31-number.png` }); await (await btn('Check')).click(); continue; }
  const bank = page.getByLabel('Items to place').getByRole('button');
  if (await bank.count()) { while (await bank.count()) await bank.first().click(); await (await btn('Check')).click(); continue; }
  console.log('stuck at step', i); await page.screenshot({ path: `${OUT}/99-stuck.png` }); break;
}
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/40-complete.png` });
await page.getByRole('button', { name: 'Continue' }).click().catch(() => {});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/41-home-after.png` });
console.log('errors:', errors);
await browser.close();
