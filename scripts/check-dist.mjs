/**
 * Checks the production build for anything that would load from another site.
 *
 *   npm run build
 *   npm run check:dist
 *
 * It reads dist/index.html and every CSS file in dist/ and fails if:
 *  - the Content-Security-Policy meta tag is missing or lacks `connect-src 'none'`;
 *  - index.html has an inline <script> or <style> or a style="" attribute
 *    (the policy would block them, and they should not be there);
 *  - any src, href or url() points at another origin.
 *
 * The browser test (npm run test:e2e) proves the behaviour; this is the cheap
 * static check that catches a CDN link the moment someone adds one.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../dist/', import.meta.url));
const problems = [];

let html;
try {
  html = readFileSync(join(dist, 'index.html'), 'utf8');
} catch {
  console.error('dist/index.html not found. Run `npm run build` first.');
  process.exit(1);
}

const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)?.[1];
if (!csp) {
  problems.push('index.html has no Content-Security-Policy meta tag.');
} else {
  const policy = csp.replace(/&#39;/g, "'");
  for (const needed of ["default-src 'none'", "connect-src 'none'", "script-src 'self'"]) {
    if (!policy.includes(needed)) problems.push(`The policy is missing: ${needed}`);
  }
  if (/unsafe-inline|unsafe-eval|https?:|\*/.test(policy)) {
    problems.push(`The policy allows more than this site: ${policy}`);
  }
}

if (/<script(?![^>]*\ssrc=)[^>]*>/i.test(html)) problems.push('index.html has an inline <script>.');
if (/<style[\s>]/i.test(html)) problems.push('index.html has an inline <style>.');
if (/\sstyle\s*=/i.test(html)) problems.push('index.html has a style="" attribute.');

const external = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
for (const match of html.matchAll(/\s(?:src|href)\s*=\s*"([^"]*)"/gi)) {
  if (external.test(match[1])) problems.push(`index.html loads from another site: ${match[1]}`);
}

function cssFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return cssFiles(path);
    return entry.name.endsWith('.css') ? [path] : [];
  });
}

for (const file of cssFiles(dist)) {
  const css = readFileSync(file, 'utf8');
  for (const match of css.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi)) {
    if (external.test(match[1]) || match[1].startsWith('data:')) {
      problems.push(`${file} loads ${match[1].slice(0, 80)}`);
    }
  }
  if (/@import/i.test(css)) problems.push(`${file} uses @import.`);
}

if (problems.length > 0) {
  console.error('The build is not self-contained:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  'dist/ is self-contained: policy present, nothing inline, nothing loaded from another site.',
);
