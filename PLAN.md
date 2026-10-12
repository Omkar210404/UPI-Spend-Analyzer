# PLAN — upi-spend-analyzer

A privacy-first web app that analyses a bank or UPI statement export entirely in the browser.
No server, no upload, no analytics, no accounts.

Status: **built.** This file was written before any code and approved; it has since been
brought in line with what was built. Where the build departed from the approved plan, section
13 says how and why.

## 1. Environment (inspected 2026-10-12)

| Item              | Found                                                        |
| ----------------- | ------------------------------------------------------------ |
| Node / npm / git  | v22.16.0 / 10.9.2 / 2.49.0 (Windows 11)                      |
| npm registry      | reachable                                                    |
| Browsers          | Chrome and Edge installed; Playwright Chromium cached        |
| GitHub CLI (`gh`) | not installed, so the remote repo and Pages setup are manual |

Pinned exactly, with a committed lockfile: vite 8.3.4, vitest 5.0.3, preact 11.0.1,
chart.js 4.5.1, papaparse 5.7.0, pdfjs-dist 6.4.299, typescript 6.0.3 (typescript-eslint
8.71.1 does not accept TypeScript 7), eslint 10.12.0, prettier 3.9.10, playwright-core 1.64.0.

## 2. Stack choices

- **Preact**, one reducer, no state library. One category change must refresh every chart,
  table and signal; declarative rendering is worth about 5 kB for that.
- **Chart.js 4** for the two bar charts, bar pieces only. Category and merchant lists and the
  calendar heatmap are plain HTML and CSS. Every chart has a table twin.
- **Papa Parse** on the main thread. **pdf.js** in a lazily loaded chunk, also on the main thread.
- **Money is integer paise; dates are `yyyy-mm-dd` strings.** INR formatting is hand-written.
- **One bundled font**, Figtree, as two files (the second carries the rupee sign).

## 3. Import flow

1. **Start**: drop zone, file picker, "Try with sample data", and the reminder to remove
   account, card, PAN and Aadhaar columns.
2. **Read**: CSV through Papa Parse; PDF through pdf.js text extraction, rebuilt into rows by
   position (`src/core/import/pdf-rows.ts`).
3. **Find the table**: the header row is the first row naming a date column and two other known
   columns. The user can move it. Lines above it are discarded.
4. **Map columns**: date, narration, and one of three amount layouts (debit and credit columns;
   one amount with Dr/Cr in a column or in the cell; one signed amount). Balance and reference
   are optional. Suggested from headers, with a fallback to cell contents; confirmed by the user
   against a live preview.
5. **Dates and amounts**: formats listed in the README. Day-first versus month-first is decided
   across the whole column, then by row order, then defaults to day-first and says so.
6. **Nothing is dropped silently**: unreadable rows are counted and listed with the reason.
7. **Mapping profiles** are saved in localStorage keyed by the header signature. Column
   positions and formats only.

**Sensitive data**

- Only mapped columns are kept; every other column is discarded at import.
- Columns that look sensitive (by header, or by content: PAN shape, card-length numbers passing
  Luhn, Aadhaar-style grouping, one long number repeated on every row) are flagged, not
  suggested, and disabled in the menus unless the user says they are not sensitive.
- Card and account fragments inside narrations are scrubbed at import.
- Transactions are never written to storage.
- Password-protected PDFs are refused.

## 4. Narration parsers

- One file per pattern in `src/core/narration/patterns`, an ordered registry, first match wins.
- Each pattern carries examples that serve as its tests, as a registry-shadowing check, and as
  the list shown in the app.
- Thirteen patterns: seven UPI styles (A to G), IMPS, NEFT/RTGS, ATM, card (POS/ECOM), ACH/NACH,
  and a best-effort fallback.
- All examples are synthetic. Styles are not attributed to banks.
- Merchant key: capitals, punctuation and company suffixes removed.

## 5. Categories, rules, overrides

- Eleven spend categories as specified, plus "Income and credits" for money in.
- A rule is a category and keywords. Whole-word matching, phrases, and a trailing `*` for
  word starts. Rules are ordered and editable.
- Order of decision: the user's choice for the transaction; their choice for the merchant;
  money in is income; an ATM narration is cash; the first matching keyword rule; a P2A marker
  is a transfer; otherwise other. Every transaction shows which of these applied.
- Per-transaction choices are keyed by a fingerprint of the row, since rows are not stored.
- Rules, choices and mappings export and import as one versioned, validated JSON file.

## 6. Privacy and CSP

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self';
connect-src 'none'; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'
```

- Written into `index.html` as a `<meta>` tag by a build-only Vite plugin, from `csp.ts`.
- No web workers: a worker loaded from a file does not inherit a meta policy.
- Fonts are preloaded and loaded at start-up, so no font is fetched later.
- Vite's modulepreload polyfill is off (it uses `fetch`); nothing is inlined as a `data:` URI.
- The open tab is not kept in the URL (see section 13).
- Limits: a meta policy cannot set `frame-ancestors`, and no policy stops top-level navigation.

**Proof**: `tests/e2e/privacy.e2e.test.ts` (seven browser checks against the production build),
`scripts/check-dist.mjs` (static check of the build), `scripts/check-repo.mjs` (no statement
files or identifier-shaped values in the repo), and the manual steps in the README.

## 7. Analytics definitions

Pure functions; every threshold is in `src/core/analytics/defaults.ts` and the interface reads
the same constants.

| Output                     | Definition                                                                                                                                                                                                                                                                       |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monthly in and out         | Per calendar month: money in = sum of credits, money out = sum of debits, net = in − out. A first or last month is "partial" when the statement starts or ends more than 5 days inside it.                                                                                       |
| Category breakdown         | Sum of debits per category for the period; share = category ÷ all debits.                                                                                                                                                                                                        |
| Top merchants              | Sum and count of debits per merchant key.                                                                                                                                                                                                                                        |
| Calendar heatmap           | Sum of debits per day; colour steps at the 20th, 40th, 60th and 80th percentiles of days with spend.                                                                                                                                                                             |
| Largest payments           | Largest debits by amount.                                                                                                                                                                                                                                                        |
| Month over month           | A month against the previous calendar month, per category: rupee change, and percentage only when the previous value is above zero.                                                                                                                                              |
| Signal: recurring          | Same merchant; amounts within 10% of the group median; the longest run of at least 3 payments with every gap 21 to 40 days; median gap 26 to 35 days; longest and shortest gap at most 7 days apart; and the merchant's other payments in that stretch do not outnumber the run. |
| Signal: possible duplicate | Same merchant, identical amount of ₹100 or more, at most 1 day apart. Identical references are reported as one row listed twice.                                                                                                                                                 |
| Signal: large payment      | A debit of ₹500 or more that is at least 3 times the average of the user's other payments to the same merchant; if that merchant has fewer than 5 others, the average of their other payments in the same category.                                                              |
| Signal: heavy month        | A category's total in a full month at least 1.5 times its average in the other full months and at least ₹1,000 above it, with at least 2 other full months.                                                                                                                      |

## 8. File layout

```
index.html  vite.config.ts  csp.ts  tsconfig*.json  eslint.config.js  package.json
DESIGN.md  PLAN.md  README.md  LICENSE
.github/workflows/  ci.yml  deploy.yml
scripts/   generate-sample.mjs  screenshots.mjs  check-dist.mjs  check-repo.mjs
src/core/  (compiled without the DOM library)
  import/      csv, table, dates, amounts, mapping, sensitive, scrub, normalise, prepare, pdf-rows
  narration/   types, helpers, registry, merchant, patterns/*
  categorise/  categories, rules, overrides, categoriser
  analytics/   defaults, stats, monthly, breakdown, calendar, compare, recurring, duplicates, spikes
  settings/ storage/ export/ format/ testing/
src/pdf/     pdf.js text extraction (lazy)
src/sample/  the generated sample statement
src/ui/      App, state, views, components, charts, styles, fonts
tests/       sample.test.ts (end to end on the sample), e2e/ (browser privacy test)
```

## 9. Tests

Unit tests sit next to the code and run in Vitest's node environment with no internet. The
browser test runs separately against the build. Counts and results are in the README and come
from real runs.

## 10. Design

See DESIGN.md: a passbook, not a trading terminal. Light by default, deep teal for action,
saffron only for signals and the sample badge, tabular numerals, a dark variant designed on its
own.

## 11. CI and deployment

- `ci.yml` on every push: repo check, lint, format check, type-check, unit tests, build, dist
  check, browser privacy test.
- `deploy.yml` on push to `main`: test, build, publish to GitHub Pages.
- Manual, by the owner: create the GitHub repository, set Pages source to "GitHub Actions", push.

## 12. Risks, as they turned out

| Risk                                               | Outcome                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Real bank formats differ from the synthetic styles | Still true and stated in the README. Not tested on real statements.                                     |
| PDF table reconstruction is unreliable             | Built and labelled experimental; tested only on a synthetic PDF.                                        |
| pdf.js needing fetches the policy blocks           | Not seen for text extraction on the synthetic PDF: zero policy violations in the browser test.          |
| Tooling mismatch (Preact 11, Vite 8, TypeScript)   | TypeScript pinned to 6.0.3. The Preact Vite preset needs Babel, so plain JSX settings are used instead. |
| A dependency breaking under the policy             | None did. Chart.js and Preact run with zero violations.                                                 |
| Signals producing false positives                  | Happened, and was fixed: see section 13.                                                                |
| GitHub Pages not verifiable locally                | Unchanged. The workflow is written but has not run.                                                     |

## 13. Where the build departed from the approved plan

- **Recurring payments got two more conditions.** Run on the sample, the planned rule picked
  "monthly" patterns out of a weekly grocery shop and out of three unrelated payments 24 and 36
  days apart. It now also requires regular gaps and a merchant that is not paid far more often.
- **Large payments compare with the same merchant first.** Against a category average, every
  ordinary restaurant bill was "3 times the average" because the category also holds ₹30 teas.
- **The open tab is not kept in the URL.** The plan did not call for it; it was added so the
  back button would move between tabs, and the browser test then showed the page icon being
  fetched again on every tab change. It was removed, and a leave-page prompt protects an
  imported statement instead.
- **Narration scrubbing was added.** Masked card fragments in narrations survived import, which
  the end-to-end test caught.
- **Rules have no "field" setting.** A rule matches the narration and merchant name together.
  A per-field option added interface for little gain.
- **`img-src` is `'self'` only**, without `data:`, since nothing is inlined.
- **The `BILL` keyword was removed** from the default bills rule: it claimed a hospital "Bill
  payment".
- The three decisions put to the owner went ahead as proposed: light theme by default, pdf.js
  loaded lazily with the exception documented, and brand names in the default rules.
