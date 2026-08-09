import { chromium } from 'playwright';
const SS = 'C:/Users/worya/AppData/Local/Temp/claude/c--Users-worya-Claude-Projects-Driving-Schools/4c399954-7c56-495d-a903-0dee13f6c564/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('response', async (res) => {
  if (res.url().includes('generate-token')) {
    let body=''; try{body=await res.text();}catch{}
    console.log('generate-token response:', res.status(), body.slice(0,300));
  }
  if (res.status() >= 400 && (res.url().includes('generate-token'))) errs.push(`[${res.status()}] ${res.url()}`);
});
await page.goto('http://localhost:5173/auth/login', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(800);
await page.getByPlaceholder('din@korskola.se').fill('pilot-validation-receptionist@example.test');
await page.locator('#login_password').fill('<REDACTED_ROTATED_TEST_PASSWORD>');
await page.getByRole('button', { name: 'Logga in', exact: true }).click();
await page.waitForTimeout(2500);
await page.goto('http://localhost:5173/students/2fcc5261-0a1e-4408-b3c2-6eb2d8864fd1', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /Skicka portal-länk|Generera/i }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${SS}/14-portal-link-settled.png` });
console.log('errors:', JSON.stringify(errs));
await browser.close();
