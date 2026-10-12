# PLAN — upi-spend-analyzer

A privacy-first web app that analyses a bank or UPI statement export entirely in the browser.
No server, no upload, no analytics, no accounts.

Status: **plan only, awaiting approval. No application code has been written.**

## 1. Environment (inspected 2026-10-12)

| Item | Found |
| --- | --- |
| Node / npm / git | v22.16.0 / 10.9.2 / 2.49.0 (Windows 11) |
| npm registry | reachable (`npm view` succeeded) |
| Browsers | Chrome and Edge installed; Playwright Chromium build 1234 already cached |
| GitHub CLI (`gh`) | **not installed**, so I cannot create the remote repo or enable Pages from here |
| Git identity | Omkar210404 |

Versions on the registry today, to be pinned exactly with a committed lockfile:
vite 8.3.4, vitest 5.0.3, preact 11.0.1, chart.js 4.5.1, papaparse 5.7.0, pdfjs-dist 6.4.299,
eslint 10.12.0, typescript-eslint 8.71.1, prettier 3.9.10, playwright-core 1.64.0.
TypeScript: registry latest is 7.0.2; I will pin **6.0.3** (already proven with this exact
ESLint stack in a sibling project) unless typescript-eslint installs cleanly against 7.

## 2. Stack choices

- **Preact, not vanilla.** One user action (overriding a category) has to re-run categorisation
  and refresh every chart, table and signal. Declarative rendering removes a whole class of
  hand-written DOM-sync bugs for about 5 kB gzipped. All logic stays framework-free in `src/core`.
  State is plain Preact hooks plus one reducer; no state library.
- **Chart.js 4**, tree-shaken to the bar and line pieces actually used. The calendar heatmap is a
  hand-built CSS grid (Chart.js has no heatmap, and a grid of labelled cells is more accessible).
  Every chart has a "view as table" alternative.
- **Papa Parse** on the main thread (no worker, see section 6). **pdf.js** in a lazy chunk.
- **Money is integer paise**, dates are plain `yyyy-mm-dd` calendar dates. No floats, no timezones.
- **INR formatting is hand-written** (`1,23,456.78`, and "₹1.2 lakh" / "₹3.4 crore" for compact
  display) rather than `Intl`, so output is identical in every browser and in tests.

## 3. Import flow

1. **Start screen**: drop zone, file picker, "Try with sample data", and a warning to remove
   account/card/PAN/Aadhaar columns before importing.
2. **Read**: CSV through Papa Parse into raw string rows. PDF through pdf.js text extraction
   into the same raw-row shape (text items grouped into lines by y position, cells by x gaps).
3. **Find the table**: bank CSVs usually start with a preamble (holder name, address, account
   number) and end with totals. The header row is detected by known header words; the user can
   move it. Preamble and footer rows are discarded and never stored.
4. **Map columns**: date, narration, then one of three amount modes: separate debit and credit
   columns; one amount column plus a Dr/Cr marker column; one signed amount column. Balance and
   a reference column are optional. Columns are pre-suggested from header synonyms and the user
   confirms. A live preview shows the first parsed rows.
5. **Dates**: dd/mm/yyyy, dd-mm-yyyy, dd/mm/yy, dd-MMM-yyyy, dd MMM yyyy, dd-MMM-yy, yyyy-mm-dd,
   mm/dd/yyyy, each with an optional time suffix. The format is auto-detected across the whole
   column (a first part above 12 proves dd/mm). If still ambiguous it defaults to dd/mm, says so,
   and offers a dropdown.
6. **Amounts**: `1,23,456.78`, `₹ 500`, `Rs. 500`, `INR 500.00`, `500.00 Dr`, `500.00Cr`,
   `(500.00)`, `-500`, blank and `-` as empty. Anything else is a parse failure.
7. **Nothing is dropped silently**: rows that fail to parse are skipped, counted and listed with
   the reason ("412 imported, 3 skipped, view").
8. **Mapping profiles** are saved in localStorage (try/catch, in-memory fallback) keyed by the
   file's header signature, so the same bank's export maps itself next time. A profile holds
   column names and format choices only, never row data. The UI states that it lives only in
   this browser.

**Sensitive data rules**

- Only mapped columns are kept. Every unmapped column is discarded at import, which is stricter
  than "drop obviously sensitive ones".
- Columns that look sensitive are flagged "will not be imported", excluded from auto-suggestion,
  and warn if the user picks them. Detection is by header name (account, a/c, card, PAN,
  Aadhaar, customer id, CIF, mobile, email, address) and by content: PAN shape, card-length
  numbers passing Luhn, Aadhaar-style 4-4-4 grouping, or the same long number repeated on every
  row. A plain "12 digits" test is deliberately not used because UPI references are 12 digits.
- **Transactions are never written to storage.** They live in memory and are gone on reload.
- Password-protected PDFs are not supported. Those passwords are often derived from PAN, date of
  birth or customer id, and the app must never ask for those.

**PDF limits (stated in the UI and README)**: text-based PDFs only, no scans or OCR, no password
protected files, table reconstruction is heuristic and labelled experimental. CSV is the
recommended path. XLS/XLSX is out of scope (save as CSV first).

## 4. Narration parser design

```ts
interface ParsedNarration {
  channel: 'UPI' | 'IMPS' | 'NEFT' | 'RTGS' | 'ATM' | 'POS' | 'ACH' | 'OTHER';
  counterparty?: string; vpa?: string; reference?: string; note?: string;
  patternId: string;
}
interface NarrationPattern {
  id: string; label: string;
  examples: { input: string; expect: Partial<ParsedNarration> }[];
  parse(narration: string): ParsedNarration | null;
}
```

- One small file per pattern, collected in an ordered registry; first match wins. Adding a parser
  means adding one file and one line in the registry.
- Each pattern carries its own examples. They are the test fixtures **and** the in-app
  "supported narration styles" list, so docs cannot drift from code.
- Tests run every example against its own pattern and against the full registry, which catches
  an earlier pattern shadowing a later one.
- Planned synthetic styles: hyphen-delimited UPI (`UPI-NAME-VPA-BANK-REF-NOTE`), slash UPI with
  Dr/Cr marker, slash UPI with P2A/P2M marker, `UPI/NAME/VPA/NOTE/BANK/REF`, `UPIOUT`/`UPIIN`,
  `TO TRANSFER-UPI/...` prefixed form, IMPS, NEFT/RTGS, ATM cash withdrawal, POS card swipe
  (merchant extracted, masked card fragment discarded), ACH/NACH mandate, then a generic
  fallback (any VPA found, else the cleaned narration).
- **Honesty**: I have no real statements and will not use any. Styles are modelled on commonly
  seen layouts and named generically ("Style A"), not attributed to specific banks. The README
  will say plainly that bank formats vary and unmatched narrations fall back to the generic rule.
- Merchant key: uppercased, punctuation and legal suffixes stripped. Known gap: one merchant
  under two names or VPAs is not merged in v1.

## 5. Categories, rules and overrides

- Spend categories as requested: food, groceries, transport, bills and recharge, shopping, rent,
  subscriptions, health, transfers to people, cash withdrawals, other. One addition:
  **"Income and credits"** as the default for credit rows, so credits are not forced into a
  spend category.
- A rule is `{ category, keywords[], field: any|merchant|vpa|narration }`. Rules are ordered and
  editable. Matching is case-insensitive on **whole words**, so `OLA` does not match `COLABA`.
- Precedence: transaction override, then merchant override, then structural (ATM pattern gives
  cash withdrawal; P2A marker gives transfers), then keyword rules in order, then other.
- Every transaction shows **why** it got its category (rule and keyword, or override).
- Overrides: per transaction, with an "apply to all from this merchant" option. Because
  transactions are not stored, a per-transaction override is keyed by a short hash of the row so
  it re-applies when the same statement is imported again.
- Rules, overrides and profiles export and import as one versioned JSON file, validated by a
  hand-written checker on import. Plus a "delete everything stored in this browser" button.
- "Transfers to people" cannot be told apart from a small shop using a personal VPA. This is
  documented and is what overrides are for.

## 6. Privacy and CSP

CSP is a `<meta>` tag injected at build time (GitHub Pages cannot send headers; the Vite dev
server needs HMR, so dev runs without it and all proofs run against the built output):

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:;
font-src 'self'; connect-src 'none'; worker-src 'none'; object-src 'none';
base-uri 'none'; form-action 'none'
```

Decisions that follow from it:

- **No web workers at all.** A worker loaded from a same-origin file takes its CSP from its own
  response headers, not from the page's meta tag, and Pages sends none. So pdf.js runs on the
  main thread, where `connect-src 'none'` does apply. Cost: the UI can pause briefly while a PDF
  is parsed. I will confirm this behaviour in a test rather than assume it.
- Fonts are bundled and preloaded so they are fetched during page load, never later.
  Vite's modulepreload polyfill (which uses `fetch`) is turned off.
- `img-src` is restricted too, because an image URL is an exfiltration route `connect-src` does
  not cover. `<meta name="referrer" content="no-referrer">` is set.
- **Honest limits**: a meta CSP cannot set `frame-ancestors`, and no CSP can block a top-level
  navigation. The app contains no code that navigates away, and the README will state both.

**Automated proof** (`npm run test:e2e`, Playwright Chromium against the production build served
from localhost, with every non-localhost request aborted so the test itself cannot reach the
internet):

1. After the `load` event, run the full flow: sample data, every tab, override, rule edit, CSV
   export, JSON export, theme toggle, a CSV import through the mapping step. Assert **zero**
   requests and zero CSP violations.
2. From page context try `fetch`, XHR, `sendBeacon`, WebSocket, EventSource, an external image
   and an external script. Assert each is blocked.
3. Assert localStorage holds only the expected keys and no transaction data.

Plus `scripts/check-dist` (built HTML and CSS reference no external URLs) and
`scripts/check-repo` (no tracked file matches statement patterns; no PAN-shaped, phone-shaped or
card-length tokens in source, tests or docs). **Manual check** for the README: Network tab with
"Preserve log", and switching the browser to offline after load to show everything still works.

**.gitignore**: `*.csv`, `*.xls*`, `*.pdf`, `*.ofx`, `*.qif`, `*statement*`, common export
filenames, with exactly one allow-listed file: the generated sample. Test fixtures are inline
strings; the PDF fixture is assembled in memory by the test.

**Sample data**: `scripts/generate-sample.mjs`, seeded so it is reproducible, about six months
of rows across all narration styles, with a planted subscription, rent, one duplicate pair and
one spike. Fictional merchants, obviously fictional people, made-up VPA handles (not real PSP
handles), no phone-number VPAs, a masked placeholder account column to demonstrate the column
drop. Sensitive-column tests use only well-known dummy values. A test checks the committed
sample matches the generator's output.

## 7. Analytics definitions (pure functions, thresholds in one constants file the UI reads)

| Output | Definition |
| --- | --- |
| Monthly in vs out | Per calendar month of the statement date: money in = sum of credits, money out = sum of debits, net = in − out. Labelled "money in / money out", with a note that credits include refunds and transfers. |
| Category breakdown | Sum of debits per category for the selected period; share = category ÷ total debits. |
| Top merchants | Sum and count of debits per merchant key, top 10. |
| Calendar heatmap | Sum of debits per day; five colour buckets from quantiles of non-zero days, so one rent payment does not flatten the scale. Legend shows the ranges. |
| Largest transactions | Top N debits by amount. |
| Month over month | Selected month vs the previous calendar month, per category: ₹ change, and % change only when the previous value is above zero. First and last months are marked "partial" when the statement does not cover them fully. |
| Signal: recurring | Same merchant, debits grouped by similar amount (within ±10% of the group median), at least 3 payments, median gap 26 to 35 days and every gap 21 to 40 days. Shows the payments, typical amount and cadence. |
| Signal: possible duplicate | Same merchant, identical amount, both debits, at most 1 day apart (statements rarely carry times). Identical reference numbers are reported separately as "same row twice". |
| Signal: spike (transaction) | A debit at least 3× the mean of the other debits in its category, at least ₹500, with at least 5 others to compare against. |
| Signal: spike (month) | A category's month total at least 1.5× the mean of its other full months and at least ₹1,000 higher, with at least 2 other full months. |

Each signal card shows its formula with the actual numbers ("₹4,200 is 3.6× your average food
payment of ₹1,160, based on 42 others"). Everything is labelled a **signal**, never advice.
The thresholds above are starting values; I will tune them only against the synthetic sample and
report what they are, not claim any accuracy.

## 8. File layout

```
index.html  vite.config.ts  tsconfig*.json  eslint.config.js  package.json
DESIGN.md  PLAN.md  README.md  LICENSE  .gitignore  .gitattributes
.github/workflows/ci.yml, deploy.yml
scripts/   generate-sample.mjs  screenshots.mjs  check-dist.mjs  check-repo.mjs
src/core/  (no DOM: compiled with a tsconfig that has no DOM lib, so this is enforced)
  import/      csv, table (header detection), dates, amounts, mapping, sensitive, pdf-rows
  narration/   types, registry, merchant, patterns/*
  categorise/  categories, default-rules, categoriser, overrides
  analytics/   monthly, categories, merchants, calendar, compare,
               recurring, duplicates, spikes, defaults
  export/      csv, settings-json
  format/      inr
  storage/     safe wrapper over an injected Storage-like object
src/pdf/     lazy pdf.js text extraction
src/sample/  generated sample statement
src/ui/      app, store, views (import, mapping, overview, transactions, signals,
             rules and data, how it works), components, charts, styles
tests/e2e/   privacy and no-network test
```

Unit tests sit next to the code as `*.test.ts` and run in Vitest's node environment.

## 9. Tests

Vitest, no internet: date parsing and format detection; amount parsing and INR formatting;
header detection, column mapping (all three amount modes) and sensitive-column handling; every
narration pattern; categoriser precedence, whole-word matching and overrides; settings JSON
round trip and rejection of bad input; monthly aggregation, category, merchant, calendar and
month-over-month; recurring, duplicate and both spike detectors, including cases that must
**not** fire; storage wrapper with a throwing storage; end to end on the synthetic sample.
Separately, the Playwright privacy test from section 6. Only real run results get reported.

## 10. UI and design

`DESIGN.md` is written before any UI code. Direction: light by default on a warm off-white, deep
teal accent, saffron reserved for signals, large tabular numerals, generous spacing, WCAG AA
contrast, a dark variant designed on its own rather than inverted, responsive to phone width,
fully keyboard operable with visible focus. A persistent "Sample data" badge shows whenever the
synthetic statement is loaded.

## 11. CI and deployment

- `ci.yml` on every push: install, lint, format check, type-check, unit tests, build,
  check-dist, check-repo, then the Playwright privacy test. CI badge in the README.
- `deploy.yml` on push to `main`: build and publish with the official Pages actions.
  Vite `base: './'` so it works under `/upi-spend-analyzer/`.
- **Needs you**: create the GitHub repo, set Pages source to "GitHub Actions", and approve the
  push. I will stop before pushing. The demo link and badge go live only after that.
- Screenshots: a Playwright script captures the running production build on the sample, light
  and dark, desktop and phone.

## 12. Build order (one or more small commits each)

1. Scaffold, tooling, `.claude/settings.json`, `.gitignore`, LICENSE, CI
2. DESIGN.md
3. Amounts, dates, INR formatting
4. CSV table detection, mapping, sensitive columns
5. Sample generator and sample
6. Narration patterns and merchant keys
7. Categoriser, overrides, settings JSON
8. Aggregations, then the three signals
9. Storage wrapper
10. UI: import and mapping, overview and charts, transactions and overrides, rules and data,
    signals, how-it-works
11. Dark theme, responsive and keyboard pass
12. CSP plugin, privacy test, check scripts
13. PDF import
14. Screenshots, README, deploy workflow, Definition of Done check

Commits carry no Co-Authored-By or session lines.

## 13. Risks

| Risk | Handling |
| --- | --- |
| Real bank formats differ from my synthetic styles | Pluggable patterns, generic fallback, honest README, no bank-coverage claims |
| PDF table reconstruction is unreliable | Built last, labelled experimental; if it is not dependable it is cut and reported as cut |
| pdf.js on the main thread may need fetches (CMaps, wasm) that the CSP blocks | Text extraction only; affected PDFs fail with a clear message; documented |
| Preact 11 / TypeScript 7 / Vite 8 tooling mismatch | Checked at install; fall back to plain JSX config and TypeScript 6.0.3 |
| A dependency breaks under the strict CSP | The privacy test fails on any CSP violation, so it shows up immediately |
| Signals produce false positives | Shown with their formula and inputs, labelled as signals, tests include negative cases |
| GitHub Pages cannot be verified from this machine | Workflow is written and linted locally; live link confirmed only after you push |

## 14. Decisions for you

1. **Theme default.** This brief says light by default; your earlier portfolio preference was
   dark from the start. I plan to follow this brief: light default, dark variant via a toggle.
2. **Lazy pdf.js vs literally zero requests.** Lazy-loading means choosing a PDF triggers one
   same-origin GET for app code (no data in it). Plan: keep it lazy, state the exception in the
   README, and have the test assert only same-origin `/assets/*.js` GETs occur. The alternative
   is preloading pdf.js at page load for a literal zero, at roughly 400 kB extra for everyone.
3. **Brand names in default rules.** Fictional sample merchants are categorised through generic
   words (grocers, cafe, pharmacy, recharge). For real users I would also ship well-known Indian
   brand names as keywords. Say so if you want generic words only.
