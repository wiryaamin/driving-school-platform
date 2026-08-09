import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', m => { if (m.type()==='error') console.log('CONSOLE:', m.text()); });
page.setDefaultTimeout(8000);

await page.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-receptionist@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(2500);
console.log('after login url:', page.url());

await page.goto('http://localhost:5173/scheduling', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(500);
console.log('immediately after goto /scheduling:', page.url());
await page.waitForTimeout(2500);
console.log('after settling:', page.url());
await page.screenshot({ path: `${SS}/29-debug-scheduling.png`, fullPage: true });
await browser.close();
