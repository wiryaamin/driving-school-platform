import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
const allResponses = [];
page.on('response', async (res) => {
  const status = res.status();
  if (status >= 400) {
    let body = ''; try { body = await res.text(); } catch {}
    allResponses.push({ status, method: res.request().method(), url: res.url(), body: body.slice(0, 300) });
  }
});
const consoleErrors = [];
page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', e => consoleErrors.push('PAGEERROR: ' + e.message));
page.setDefaultTimeout(8000);

console.log('=== 1. Login ===');
await page.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-owner@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(2500);
console.log('   url:', page.url());

console.log('=== 2. Dashboard ===');
await page.screenshot({ path: `${SS}/30-regression-dashboard.png`, fullPage: true });

console.log('=== 3. Settings -> Organization ===');
await page.goto('http://localhost:5173/settings/organization', { waitUntil: 'domcontentloaded' }).catch(async () => {
  await page.goto('http://localhost:5173/settings', { waitUntil: 'domcontentloaded' });
});
await page.waitForTimeout(1500);
console.log('   url:', page.url());
await page.screenshot({ path: `${SS}/31-regression-org-settings.png`, fullPage: true });

console.log('=== 4. Settings -> Users ===');
await page.goto('http://localhost:5173/settings/users', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SS}/32-regression-users.png`, fullPage: true });
const userCountText = await page.textContent('body');
console.log('   contains "Inga användare":', userCountText.includes('Inga användare'));
console.log('   contains "Anna Ägare":', userCountText.includes('Anna Ägare'));

console.log('=== 5. Roles page ===');
await page.goto('http://localhost:5173/settings/roles', { waitUntil: 'domcontentloaded' }).catch(()=>{});
await page.waitForTimeout(1200);
console.log('   url:', page.url());
await page.screenshot({ path: `${SS}/33-regression-roles.png`, fullPage: true });

console.log('\n=== ALL 4xx/5xx RESPONSES DURING FULL OWNER WORKFLOW ===');
console.log(JSON.stringify(allResponses, null, 2));
console.log('\n=== CONSOLE ERRORS ===');
console.log(JSON.stringify(consoleErrors, null, 2));

await browser.close();
