import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('response', async (res) => { if (res.status() >= 400 && !res.url().includes('notifications') && !res.url().includes('/instructors?')) { let b=''; try{b=await res.text();}catch{}; errs.push(`[${res.status()}] ${res.request().method()} ${res.url()} :: ${b.slice(0,200)}`);} });
page.setDefaultTimeout(8000);

await page.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-receptionist@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(2500);
console.log('login url:', page.url());

console.log('--- Packages catalog ---');
await page.goto('http://localhost:5173/packages', { waitUntil: 'domcontentloaded' }).catch(e => console.log('nav err:', e.message));
await page.waitForTimeout(2000);
console.log('url:', page.url());
await page.screenshot({ path: `${SS}/27-packages-page.png`, fullPage: true });

console.log('errors so far:', JSON.stringify(errs, null, 2));
await browser.close();
