import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('response', async (res) => { if (res.status() >= 400) { let b=''; try{b=await res.text();}catch{}; errs.push(`[${res.status()}] ${res.request().method()} ${res.url()} :: ${b.slice(0,200)}`);} });

await page.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-owner@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(2500);
console.log('login url:', page.url());

await page.goto('http://localhost:5173/settings/users', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.getByRole('button', { name: 'Bjud in' }).click();
await page.waitForTimeout(1000);
await page.getByLabel('Förnamn').fill('Gustav');
await page.getByLabel('Efternamn').fill('Gästlärare');
await page.getByLabel('E-postadress').fill('pilot-validation-invited-staff@example.test');
await page.screenshot({ path: `${SS}/24-invite-dialog-filled.png` });
await page.getByRole('button', { name: 'Skicka inbjudan' }).click();
await page.waitForTimeout(3000);
await page.screenshot({ path: `${SS}/25-invite-result.png`, fullPage: true });
console.log('errors:', JSON.stringify(errs, null, 2));

console.log('--- Logout ---');
await page.getByRole('button', { name: /Anna Ägare/i }).click();
await page.waitForTimeout(500);
await page.screenshot({ path: `${SS}/26-owner-menu.png` });
await browser.close();
