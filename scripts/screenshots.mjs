/**
 * Takes the README screenshots from the real app, running on the synthetic
 * sample statement.
 *
 *   npm run build
 *   npm run screenshots
 *
 * It serves the production build from dist/, drives a browser with
 * playwright-core and writes PNG files to docs/screenshots. Nothing is mocked:
 * what is in the pictures is what the build shows for the sample data.
 */

import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { preview } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const outDir = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));
const PORT = 5197;

const DESKTOP = { width: 1280, height: 860 };
const PHONE = { width: 390, height: 844 };

async function launchBrowser() {
  // Playwright's own Chromium if it is installed, otherwise Edge or Chrome.
  for (const options of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try {
      return await chromium.launch(options);
    } catch {
      // Try the next browser.
    }
  }
  throw new Error('No browser could be started. Run: npx playwright-core install chromium');
}

async function open(browser, baseUrl, { theme, viewport }) {
  const context = await browser.newContext({
    viewport,
    // Phone shots are taken at 2x to stay sharp; desktop shots at 1x to keep the files small.
    deviceScaleFactor: viewport.width < 600 ? 2 : 1,
    reducedMotion: 'reduce',
  });
  await context.addInitScript((value) => {
    window.localStorage.setItem('upi-spend-analyzer:v1:theme', JSON.stringify(value));
  }, theme);
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.evaluate(() => document.fonts.ready);
  return { context, page };
}

async function shoot(page, name, options = {}) {
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  await page.screenshot({ path: `${outDir}${name}.png`, fullPage: true, ...options });
  console.log(`  wrote docs/screenshots/${name}.png`);
}

async function tab(page, name) {
  await page.getByRole('tab', { name, exact: true }).click();
  await page.getByRole('heading', { level: 1, name, exact: true }).waitFor();
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await preview({
    root,
    logLevel: 'error',
    preview: { port: PORT, strictPort: true },
  });
  const baseUrl = `http://localhost:${PORT}/`;
  const browser = await launchBrowser();

  try {
    for (const theme of ['light', 'dark']) {
      console.log(`${theme} theme, desktop`);
      const { context, page } = await open(browser, baseUrl, { theme, viewport: DESKTOP });

      if (theme === 'light') {
        await shoot(page, 'start-light');
        await page.getByRole('button', { name: 'Show me the import steps' }).click();
        await page.getByRole('heading', { level: 1, name: 'Match the columns' }).waitFor();
        await shoot(page, 'mapping-light');
        await page.getByRole('button', { name: 'Cancel' }).click();
      }

      await page.getByRole('button', { name: 'Try with sample data' }).click();
      await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
      await shoot(page, `overview-${theme}`);

      await tab(page, 'Transactions');
      // Open one row, so the picture shows how a narration was read and why it got its category.
      await page
        .getByRole('button', { name: /^Show details for/ })
        .nth(1)
        .click();
      await shoot(page, `transactions-${theme}`, { fullPage: false });

      await tab(page, 'Signals');
      await shoot(page, `signals-${theme}`, {
        clip: { x: 0, y: 0, width: DESKTOP.width, height: 1500 },
      });

      if (theme === 'light') {
        await tab(page, 'Rules and data');
        await shoot(page, 'rules-light', { fullPage: false });
        await tab(page, 'How it works');
        await shoot(page, 'how-it-works-light', { fullPage: false });
      }
      await context.close();
    }

    for (const theme of ['light', 'dark']) {
      console.log(`${theme} theme, phone`);
      const { context, page } = await open(browser, baseUrl, { theme, viewport: PHONE });
      await page.getByRole('button', { name: 'Try with sample data' }).click();
      await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
      await shoot(page, `phone-overview-${theme}`, { fullPage: false });
      if (theme === 'light') {
        await tab(page, 'Transactions');
        await shoot(page, 'phone-transactions-light', { fullPage: false });
      }
      await context.close();
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.httpServer.close(resolve));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
