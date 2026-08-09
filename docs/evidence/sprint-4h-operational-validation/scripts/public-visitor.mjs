import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('response', async (res) => { if (res.status() >= 400) errs.push(`[${res.status()}] ${res.request().method()} ${res.url()}`); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
console.log('url:', page.url());
await page.screenshot({ path: `${SS}/21-public-home.png`, fullPage: false });

console.log('--- Navigate to demo request ---');
await page.goto('http://localhost:5173/demo', { waitUntil: 'domcontentloaded' }).catch(async () => {
  await page.goto('http://localhost:5173/kontakt', { waitUntil: 'domcontentloaded' }).catch(() => {});
});
await page.waitForTimeout(1500);
console.log('url:', page.url());
await page.screenshot({ path: `${SS}/22-demo-page.png`, fullPage: true });

console.log('errors:', JSON.stringify(errs, null, 2));
await browser.close();
