import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';

const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('response', async (res) => { if (res.status() >= 400) errs.push(`[${res.status()}] ${res.request().method()} ${res.url()}`); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5173/auth/login', { waitUntil: 'networkidle' });
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-owner@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(3000);
console.log('URL after owner login:', page.url());
await page.screenshot({ path: `${SS}/05-owner-dashboard.png`, fullPage: true });

console.log('--- Navigate to Settings/Users ---');
await page.goto('http://localhost:5173/settings/users', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SS}/06-owner-users-settings.png`, fullPage: true });

console.log('errors:', JSON.stringify(errs, null, 2));
await browser.close();
