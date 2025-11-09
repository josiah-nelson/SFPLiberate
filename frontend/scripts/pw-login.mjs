import { chromium } from 'playwright';

const BASE_URL = process.env.BASE_URL || 'https://app.sfplib.com';
const EMAIL = process.env.TEST_USER;
const PASSWORD = process.env.TEST_PASS;

if (!EMAIL || !PASSWORD) {
  console.error('Missing TEST_USER or TEST_PASS in env');
  process.exit(1);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  page.on('console', (msg) => console.log('[console]', msg.type(), msg.text()));
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('appwrite')) {
      console.log('[network]', res.status(), url);
    }
  });

  console.log('Navigating to login...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

  const cfg = await page.evaluate(() => (window).__APPWRITE_CONFIG__);
  console.log('Inline config:', cfg);

  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button:has-text("Sign In")');
  // Wait for navigation to home after login instead of fixed timeout
  await page.waitForURL(`${BASE_URL}/`);

  // Check cookies for session
  const cookies = await ctx.cookies();
  const session = cookies.find((c) => c.name.startsWith('a_session_'));
  console.log('Session cookie present:', !!session, session?.name);

  // Navigate to modules to ensure SSR reads cookie
  await page.goto(`${BASE_URL}/modules`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  await browser.close();
  console.log('Done');
})();
