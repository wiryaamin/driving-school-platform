import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('response', async (res) => { if (res.status() >= 400 && !res.url().includes('notifications') && !res.url().includes('corporate-customers') && !res.url().includes('/instructors?')) errs.push(`[${res.status()}] ${res.request().method()} ${res.url()}`); });
page.on('pageerror', e => errs.push('PAGEERROR: ' + e.message));

await page.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-receptionist@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(2500);

await page.goto('http://localhost:5173/students/2fcc5261-0a1e-4408-b3c2-6eb2d8864fd1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByText('Lägg till vårdnadshavare').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SS}/16-add-guardian-form.png`, fullPage: true });
console.log('errors:', JSON.stringify(errs, null, 2));
await browser.close();
