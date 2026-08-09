import { chromium } from 'playwright';

const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('response', async (res) => {
  if (res.status() >= 400) {
    let body = '';
    try { body = await res.text(); } catch {}
    console.log(`[${res.status()}] ${res.request().method()} ${res.url()}`);
    console.log('  body:', body.slice(0, 500));
  }
});
page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

await page.goto('http://localhost:5173/auth/login', { waitUntil: 'networkidle' });
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-platformadmin@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(4000);
console.log('URL:', page.url());
await page.screenshot({ path: `${SS}/04-pa-login-isolated.png`, fullPage: true });

// Check for any visible error text
const bodyText = await page.textContent('body');
console.log('page contains "misslyckades":', bodyText.includes('misslyckades'));
console.log('page contains "Felaktig":', bodyText.includes('Felaktig'));

await browser.close();
