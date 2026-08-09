import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('response', async (res) => { if (res.status() >= 400) errs.push(`[${res.status()}] ${res.request().method()} ${res.url()}`); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

const token = 'a2849f1fbe990df9d4353140b21b4db86a51b4c965e1de1d71e2e52bb20c7aae';
await page.goto(`http://localhost:5173/portal?token=${token}`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
console.log('url:', page.url());
await page.screenshot({ path: `${SS}/15-student-portal.png`, fullPage: true });
console.log('errors:', JSON.stringify(errs, null, 2));
await browser.close();
