import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('response', async (res) => { if (res.status() >= 400) errs.push(`[${res.status()}] ${res.request().method()} ${res.url()}`); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-instructor@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(3000);
console.log('url after instructor login:', page.url());
await page.screenshot({ path: `${SS}/18-instructor-dashboard.png`, fullPage: true });

console.log('--- Mitt schema ---');
await page.goto('http://localhost:5173/scheduling/my-schedule', { waitUntil: 'domcontentloaded' }).catch(()=>{});
await page.waitForTimeout(2000);
console.log('url:', page.url());
await page.screenshot({ path: `${SS}/19-instructor-schedule.png`, fullPage: true });

console.log('errors:', JSON.stringify(errs, null, 2));
await browser.close();
