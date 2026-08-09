import { chromium } from 'playwright';

const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';

const browser = await chromium.launch();
const page = await browser.newPage();

const errors = [];
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
page.on('pageerror', err => errors.push('PAGEERROR: ' + err.message));

await page.goto('http://localhost:5173/auth/login', { waitUntil: 'networkidle' });

console.log('--- Clicking BankID button ---');
await page.getByText('Logga in med BankID').click();
await page.waitForTimeout(1500);
await page.screenshot({ path: `${SS}/01-bankid-clicked.png` });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${SS}/01b-bankid-settled.png` });

console.log('--- Testing invalid login ---');
await page.reload({ waitUntil: 'networkidle' });
await page.getByPlaceholder('din@korskola.se').fill('nonexistent@example.test');
await page.locator('#login_password').fill('WrongPassword123!');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${SS}/02-invalid-login.png` });

console.log('--- Logging in as Platform Admin ---');
await page.reload({ waitUntil: 'networkidle' });
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-platformadmin@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(2500);
console.log('URL after platform admin login:', page.url());
await page.screenshot({ path: `${SS}/03-platformadmin-dashboard.png`, fullPage: true });

console.log('console errors so far:', JSON.stringify(errors, null, 2));

await browser.close();
