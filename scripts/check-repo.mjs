/**
 * Guards the repository against real financial data.
 *
 *   npm run check:repo
 *
 * It looks at every file git tracks (or would track) and fails if:
 *  - a statement-like file is present, other than the one synthetic sample;
 *  - source, tests, scripts or docs contain something shaped like a PAN, an
 *    Indian mobile number, or a card-length number.
 *
 * A handful of well-known dummy values used by the tests are allowed by name.
 * This is a tripwire, not a proof: it catches the obvious mistake of pasting
 * a real row into a test.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

const ALLOWED_STATEMENT_FILES = new Set(['src/sample/sample-statement.csv']);
const STATEMENT_FILE = /\.(csv|tsv|xls|xlsx|xlsm|ods|pdf|ofx|qfx|qif)$|statement|passbook/i;
const SCANNED = /\.(ts|tsx|mjs|js|json|md|html|css|csv|yml|yaml|txt)$/;
const SKIPPED = /^(package-lock\.json|node_modules\/|dist\/)/;

/** Dummy values that are public test fixtures, not anyone's data. */
const ALLOWED_VALUES = new Set([
  'ABCDE1234F', // the placeholder PAN used in every explanation of the format
  '4111111111111111', // the standard test card number
  '0000000000000000',
  '0000000000',
  '99999999999999', // a too-large amount in the amount parser's tests
  '1234567890123', // a thirteen-digit non-reference in the narration tests
]);

const CHECKS = [
  { name: 'PAN-shaped value', pattern: /(?<![A-Za-z0-9])[A-Z]{5}[0-9]{4}[A-Z](?![A-Za-z0-9])/g },
  { name: 'mobile-number-shaped value', pattern: /(?<![\dA-Za-z.])[6-9]\d{9}(?![\dA-Za-z])/g },
  { name: 'card-length number', pattern: /(?<![\dA-Za-z.])\d{13,19}(?![\dA-Za-z])/g },
];

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter(Boolean);

const problems = [];
for (const file of files) {
  if (SKIPPED.test(file)) continue;
  const name = file.split('/').pop() ?? file;
  // Source files about statements (sample-statement.test.ts and so on) are fine; data files are not.
  const isCode = /\.(ts|tsx|mjs|js|md)$/.test(name);
  if (!isCode && STATEMENT_FILE.test(name) && !ALLOWED_STATEMENT_FILES.has(file)) {
    problems.push(
      `${file}: looks like a statement file. Only the synthetic sample may be committed.`,
    );
    continue;
  }
  if (!SCANNED.test(name)) continue;

  let text;
  try {
    text = readFileSync(new URL(file, new URL('../', import.meta.url)), 'utf8');
  } catch {
    continue; // listed by git but deleted in the working tree
  }
  const lines = text.split('\n');
  for (const { name: label, pattern } of CHECKS) {
    lines.forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        if (ALLOWED_VALUES.has(match[0])) continue;
        problems.push(`${file}:${index + 1}: ${label} "${match[0]}"`);
      }
    });
  }
}

if (problems.length > 0) {
  console.error('Possible real financial data in the repository:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`Checked ${files.length} files: no statement files and no identifier-shaped values.`);
