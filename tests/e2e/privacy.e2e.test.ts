import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { preview, type PreviewServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { CSP } from '../../csp';
import { STORAGE_KEYS, STORAGE_PREFIX } from '../../src/core/storage/storage';
import { makeStatementPdf } from './make-pdf';

/**
 * The privacy claim, tested against the production build in a real browser:
 * once the page has loaded, using the app makes no network requests, and the
 * Content-Security-Policy stops the page from making any even if it tried.
 *
 * Run `npm run build` first. The test itself cannot reach the internet: every
 * request to anything but the local preview server is aborted.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const distIndex = fileURLToPath(new URL('../../dist/index.html', import.meta.url));
const sampleCsv = fileURLToPath(new URL('../../src/sample/sample-statement.csv', import.meta.url));
const PORT = 5198;
const BASE = `http://localhost:${PORT}/`;

interface Seen {
  url: string;
  method: string;
  hasBody: boolean;
}

let server: PreviewServer;
let browser: Browser;

async function launch(): Promise<Browser> {
  for (const options of [{}, { channel: 'msedge' }, { channel: 'chrome' }]) {
    try {
      return await chromium.launch(options);
    } catch {
      // Try the next browser.
    }
  }
  throw new Error('No browser could be started. Run: npx playwright-core install chromium');
}

/** Opens the app and waits until it has completely finished loading. */
async function openApp(): Promise<{
  context: BrowserContext;
  page: Page;
  /** Requests that reached the network after the page finished loading. */
  later: () => Seen[];
  /** Everything the browser's network log shows after load, sent or not. */
  attemptedLater: () => string[];
  /** Requests the browser started but its policy stopped, with the browser's reason. */
  stopped: () => { url: string; reason: string }[];
  violations: () => Promise<string[]>;
}> {
  const context = await browser.newContext({ acceptDownloads: true });
  // Every request that leaves the page for the network passes through this
  // handler, so this list is exactly what was sent. A request the browser's
  // policy refuses never gets here.
  const seen: Seen[] = [];
  await context.route('**/*', (route) => {
    const request = route.request();
    seen.push({
      url: request.url(),
      method: request.method(),
      hasBody: request.postData() !== null,
    });
    return request.url().startsWith(BASE) ? route.continue() : route.abort();
  });
  // The browser's own network log also lists requests it refused to send.
  const attempted: string[] = [];
  const stopped: { url: string; reason: string }[] = [];
  context.on('request', (request) => attempted.push(request.url()));
  context.on('requestfailed', (request) => {
    stopped.push({ url: request.url(), reason: request.failure()?.errorText ?? '' });
  });
  await context.addInitScript(() => {
    const store = window as unknown as { __violations: string[] };
    store.__violations = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      store.__violations.push(`${event.effectiveDirective} ${event.blockedURI}`);
    });
  });

  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { level: 1 }).waitFor();
  const loaded = seen.length;
  const attemptedAtLoad = attempted.length;

  return {
    context,
    page,
    later: () => seen.slice(loaded),
    attemptedLater: () => attempted.slice(attemptedAtLoad),
    stopped: () => stopped,
    violations: () =>
      page.evaluate(() => (window as unknown as { __violations: string[] }).__violations),
  };
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name, exact: true }).click();
  await page.getByRole('heading', { level: 1, name, exact: true }).waitFor();
}

beforeAll(async () => {
  if (!existsSync(distIndex)) {
    throw new Error('dist/ is missing. Run `npm run build` before `npm run test:e2e`.');
  }
  server = await preview({
    root,
    logLevel: 'error',
    preview: { port: PORT, strictPort: true },
  });
  browser = await launch();
});

afterAll(async () => {
  await browser?.close();
  await new Promise<void>((resolve) => {
    if (server) server.httpServer.close(() => resolve());
    else resolve();
  });
});

describe('the shipped page', () => {
  it('carries the Content-Security-Policy from csp.ts', async () => {
    const { context, page } = await openApp();
    const content = await page
      .locator('meta[http-equiv="Content-Security-Policy"]')
      .getAttribute('content');
    expect(content).toBe(CSP);
    expect(content).toContain("connect-src 'none'");
    expect(content).toContain("default-src 'none'");
    expect(content).toContain("worker-src 'none'");
    await context.close();
  });

  it('loads only from its own origin', async () => {
    const context = await browser.newContext();
    const urls: string[] = [];
    context.on('request', (request) => urls.push(request.url()));
    const page = await context.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.filter((url) => !url.startsWith(BASE))).toEqual([]);
    await context.close();
  });
});

describe('after the page has loaded', () => {
  it('makes no network request while the whole app is used', async () => {
    const { context, page, later, attemptedLater, violations } = await openApp();

    // Sample data, then every tab.
    await page.getByRole('button', { name: 'Try with sample data' }).click();
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
    await expect.poll(() => page.getByText('Sample data', { exact: true }).count()).toBe(1);
    await page.getByRole('button', { name: 'Aug 26' }).first().click();
    await page.getByRole('button', { name: /^View as table: money in and money out/ }).click();
    await page.getByRole('button', { name: /^Groceries:/ }).click();
    await page.getByRole('heading', { level: 1, name: 'Transactions' }).waitFor();

    // Override a category, apply it to the merchant, search, export CSV.
    await page.getByRole('button', { name: 'All months' }).click();
    await page.getByLabel('Category', { exact: true }).selectOption('other');
    const firstCategory = page.getByRole('combobox', { name: /^Category for/ }).first();
    await firstCategory.selectOption('shopping');
    await page.getByRole('button', { name: /^Use Shopping for all/ }).click();
    await page.getByLabel('Category', { exact: true }).selectOption('all');
    await page.getByLabel('Search').fill('chai corner');
    const csvDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export all as CSV' }).click();
    const csv = await csvDownload;
    expect(csv.suggestedFilename()).toBe('sample-statement-categorised.csv');
    const csvPath = await csv.path();
    const exported = readFileSync(csvPath, 'utf8');
    expect(exported.split('\r\n')[0]).toMatch(/^Date,Merchant,Category/);
    expect(exported.trimEnd().split('\r\n')).toHaveLength(319);

    await openTab(page, 'Signals');
    await page.getByText('How this is calculated').first().click();
    expect(await page.getByText('Signal', { exact: true }).count()).toBeGreaterThan(5);

    // Edit a rule, export the settings, switch theme.
    await openTab(page, 'Rules and data');
    await page.getByLabel('New keyword for Rent').fill('lease');
    await page.getByLabel('New keyword for Rent').press('Enter');
    await page.getByText('LEASE', { exact: true }).waitFor();
    const jsonDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export settings' }).click();
    const json = await jsonDownload;
    const settings = JSON.parse(readFileSync(await json.path(), 'utf8')) as { app: string };
    expect(settings.app).toBe('upi-spend-analyzer');

    await openTab(page, 'How it works');
    await page.getByRole('button', { name: 'Switch to the dark theme' }).click();
    expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');

    // Import a CSV file through the mapping step.
    await page.getByRole('button', { name: 'Open another file' }).click();
    await page.getByLabel('Statement file').setInputFiles(sampleCsv);
    await page.getByRole('heading', { level: 1, name: 'Match the columns' }).waitFor();
    await page.getByText('Looks sensitive.').waitFor();
    await page.getByRole('button', { name: 'Import 318 transactions' }).click();
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
    // A file the user picked is not the sample, whatever it contains.
    expect(await page.getByText('Sample data', { exact: true }).count()).toBe(0);

    // Nothing was sent, and nothing was even attempted: the network log is empty.
    expect(later()).toEqual([]);
    expect(attemptedLater()).toEqual([]);
    expect(await violations()).toEqual([]);
    await context.close();
  });

  it('keeps transactions out of browser storage', async () => {
    const { context, page } = await openApp();
    await page.getByRole('button', { name: 'Try with sample data' }).click();
    await openTab(page, 'Transactions');
    await page
      .getByRole('combobox', { name: /^Category for/ })
      .first()
      .selectOption('shopping');
    await page.getByRole('button', { name: 'Switch to the dark theme' }).click();

    const stored = await page.evaluate(async () => ({
      local: Object.fromEntries(Object.entries(window.localStorage)),
      session: window.sessionStorage.length,
      cookies: document.cookie,
      databases: (await window.indexedDB.databases()).length,
    }));
    const allowed = STORAGE_KEYS.map((key) => STORAGE_PREFIX + key);
    expect(Object.keys(stored.local).sort()).toEqual([...allowed].sort());
    expect(stored.session).toBe(0);
    expect(stored.cookies).toBe('');
    expect(stored.databases).toBe(0);

    const text = JSON.stringify(stored.local);
    // No narration, no reference number, no UPI handle, no amount from the statement.
    expect(text).not.toMatch(/\d{12}/);
    expect(text).not.toContain('@okdemo');
    expect(text).not.toContain('UPI/');
    expect(text).not.toContain('18500');
    await context.close();
  });

  it('is stopped by the policy when it tries to reach a server', async () => {
    const { context, page, later, stopped, violations } = await openApp();

    const results = await page.evaluate(async (origin) => {
      const outcome: Record<string, string> = {};
      const settle = (name: string, value: string) => {
        outcome[name] = value;
      };

      await fetch('https://example.invalid/collect', { method: 'POST', body: 'x' })
        .then(() => settle('fetch-external', 'sent'))
        .catch(() => settle('fetch-external', 'blocked'));
      await fetch(`${origin}favicon.svg`)
        .then(() => settle('fetch-same-origin', 'sent'))
        .catch(() => settle('fetch-same-origin', 'blocked'));

      await new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        xhr.onload = () => (settle('xhr', 'sent'), resolve());
        xhr.onerror = () => (settle('xhr', 'blocked'), resolve());
        try {
          xhr.open('GET', 'https://example.invalid/x');
          xhr.send();
        } catch {
          settle('xhr', 'blocked');
          resolve();
        }
      });

      settle('beacon', navigator.sendBeacon('https://example.invalid/b', 'x') ? 'sent' : 'blocked');

      await new Promise<void>((resolve) => {
        try {
          const socket = new WebSocket('wss://example.invalid/socket');
          socket.onopen = () => (settle('websocket', 'sent'), resolve());
          socket.onerror = () => (settle('websocket', 'blocked'), resolve());
        } catch {
          settle('websocket', 'blocked');
          resolve();
        }
      });

      await new Promise<void>((resolve) => {
        const image = new Image();
        image.onload = () => (settle('image', 'sent'), resolve());
        image.onerror = () => (settle('image', 'blocked'), resolve());
        image.src = 'https://example.invalid/pixel.gif?data=x';
      });

      await new Promise<void>((resolve) => {
        const script = document.createElement('script');
        script.onload = () => (settle('script', 'sent'), resolve());
        script.onerror = () => (settle('script', 'blocked'), resolve());
        script.src = 'https://example.invalid/x.js';
        document.head.append(script);
      });

      try {
        new Worker(`${origin}theme-init.js`);
        // Creation can succeed and fail asynchronously; the violation list settles it.
        settle('worker', 'created');
      } catch {
        settle('worker', 'blocked');
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      return outcome;
    }, BASE);

    expect(results).toMatchObject({
      'fetch-external': 'blocked',
      'fetch-same-origin': 'blocked',
      xhr: 'blocked',
      websocket: 'blocked',
      image: 'blocked',
      script: 'blocked',
    });

    const blocked = await violations();
    for (const directive of ['connect-src', 'img-src', 'script-src-elem', 'worker-src']) {
      expect(
        blocked.some((entry) => entry.startsWith(directive)),
        `${directive} in ${blocked.join(' | ')}`,
      ).toBe(true);
    }
    // Not one of those attempts reached the network...
    expect(later()).toEqual([]);
    // ...and the ones the browser logged, it logged as stopped by the policy.
    expect(stopped().length).toBeGreaterThan(0);
    for (const entry of stopped()) {
      expect(entry.reason, entry.url).toMatch(/BLOCKED_BY_CSP|csp/i);
    }
    await context.close();
  });

  it('fetches only its own PDF code, with no data attached, when a PDF is opened', async () => {
    const { context, page, later, violations } = await openApp();
    const pdf = makeStatementPdf([
      ['Demo Bank sample statement (synthetic)'],
      ['Date', 'Narration', 'Debit', 'Credit', 'Balance'],
      [
        '01/04/2026',
        'UPI/DR/423456789012/CHAI CORNER CAFE/DEMO/chaicorner@okdemo/Tea',
        '40.00',
        '',
        '960.00',
      ],
      [
        '02/04/2026',
        'NEFT-DEMON26000001-ORBIT TECHNOLOGIES PAYROLL-SALARY APR',
        '',
        '500.00',
        '1,460.00',
      ],
      ['03/04/2026', 'ATM WDL DEMO NAGAR BRANCH', '200.00', '', '1,260.00'],
    ]);
    await page.getByLabel('Statement file').setInputFiles({
      name: 'synthetic-statement.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdf),
    });
    await page.getByRole('heading', { level: 1, name: 'Match the columns' }).waitFor();
    await page.getByText('PDF import is experimental.').waitFor();
    await page.getByRole('button', { name: 'Import 3 transactions' }).click();
    await page.getByRole('heading', { level: 1, name: 'Overview' }).waitFor();
    await openTab(page, 'Transactions');
    await page.getByText('Chai Corner Cafe').first().waitFor();
    await page.getByText('Orbit Technologies Payroll').first().waitFor();

    const requests = later();
    expect(requests.length).toBeGreaterThan(0);
    for (const request of requests) {
      expect(request.method).toBe('GET');
      expect(request.hasBody).toBe(false);
      expect(request.url).toMatch(new RegExp(`^${BASE}assets/[\\w.-]+\\.js$`));
    }
    expect(await violations()).toEqual([]);
    await context.close();
  });

  it('refuses a scanned-style PDF with a clear message', async () => {
    const { context, page } = await openApp();
    await page.getByLabel('Statement file').setInputFiles({
      name: 'empty.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(makeStatementPdf([])),
    });
    await page.getByText(/No text was found in this PDF/).waitFor();
    await context.close();
  });
});
