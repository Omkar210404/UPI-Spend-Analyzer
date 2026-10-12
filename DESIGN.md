# DESIGN — upi-spend-analyzer

Written before any UI code. The UI follows this file; if the build has to depart from it, this
file is updated in the same commit.

## The idea: a passbook, not a trading terminal

Someone is about to hand this page their bank statement. The design's first job is to make
that feel safe and unhurried. The reference is a bank passbook: warm paper, dark ink, ruled
lines, figures that line up in columns, one stamp colour for things that need a second look.

So: no gradients, no glass, no glowing charts, no dark dashboard by default. Flat paper
surfaces, hairline rules, a lot of air, and numbers large enough to read at arm's length.

## Colour

Two jobs only. **Teal is ink that acts** (links, buttons, the data in charts). **Saffron is
the stamp** and appears only on signals and the sample-data badge, so it always means "look at
this". Nothing else is coloured.

### Light theme (default)

| Token            | Value     | Use                                | Contrast                         |
| ---------------- | --------- | ---------------------------------- | -------------------------------- |
| `--paper`        | `#f5f2ea` | page background                    |                                  |
| `--surface`      | `#fffdf8` | cards, tables, chart surface       |                                  |
| `--sunken`       | `#ece8dc` | inputs at rest, empty heatmap days |                                  |
| `--rule`         | `#ddd8cb` | hairlines and borders              |                                  |
| `--ink`          | `#14201f` | primary text, figures              | 14.9:1 on paper                  |
| `--ink-2`        | `#47524f` | secondary text                     | 7.3:1 on paper                   |
| `--ink-3`        | `#66716d` | captions, axis labels              | 4.5:1 on paper, 5.0:1 on surface |
| `--teal`         | `#0f5e5a` | buttons, links, focus ring         | 7.5:1 on surface                 |
| `--teal-tint`    | `#dcebe8` | selected states, quiet highlights  |                                  |
| `--saffron`      | `#e8912d` | signal stamp fill, badge edge      | fill only, never text            |
| `--saffron-ink`  | `#7a4100` | text on a saffron tint             | 6.9:1 on tint                    |
| `--saffron-tint` | `#fbebd3` | signal and badge background        |                                  |
| `--danger`       | `#a3321f` | errors, destructive actions        | 6.8:1 on surface                 |

### Dark theme

Designed on its own, not inverted: the paper becomes deep green-black slate rather than grey,
the teal is lifted so it still reads as ink, and saffron is softened so it does not glare.

| Token            | Value     | Contrast                                                    |
| ---------------- | --------- | ----------------------------------------------------------- |
| `--paper`        | `#0f1716` |                                                             |
| `--surface`      | `#162120` |                                                             |
| `--sunken`       | `#1d2b29` |                                                             |
| `--rule`         | `#2a3836` |                                                             |
| `--ink`          | `#e8efec` | 15.6:1 on paper                                             |
| `--ink-2`        | `#b4c0bc` | 9.7:1 on paper                                              |
| `--ink-3`        | `#93a19d` | 6.2:1 on surface                                            |
| `--teal`         | `#6fd0c4` | 9.0:1 on surface; button text is `--paper` on teal (10.0:1) |
| `--teal-tint`    | `#1c3a37` |                                                             |
| `--saffron`      | `#f2b866` |                                                             |
| `--saffron-ink`  | `#f2b866` | 8.2:1 on tint                                               |
| `--saffron-tint` | `#33270f` |                                                             |
| `--danger`       | `#f09a8a` | 7.6:1 on surface                                            |

Light is the default for every first visit. Dark is a choice the user makes with the toggle,
and the choice is remembered in this browser.

### Chart colour

Chosen with a palette validator (lightness band, chroma floor, colour-vision-deficiency
separation, contrast against the chart surface), not by eye. All sets below pass every check
on their own surface.

| Job                       | Light                                             | Dark                                              |
| ------------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Money out (series 1)      | `#008f80`                                         | `#14a394`                                         |
| Money in (series 2)       | `#7458c4`                                         | `#8a7fe0`                                         |
| Previous period (context) | `#b9b3a4`                                         | `#4a5a57`                                         |
| Heatmap, low to high      | `#7fbfb5` `#4fa398` `#23857b` `#0d625c` `#083f3c` | `#27635d` `#2a8177` `#36a295` `#62c4b7` `#a6e6dc` |

Rules:

- Eleven spend categories is too many to tell apart by hue. Category bars are **one colour**;
  the label and the figure identify the category.
- Two series get a legend and are never told apart by colour alone.
- Text is never painted in a series colour. Values and labels use ink tokens.
- The heatmap is one hue. In the light theme more spend is darker; in the dark theme it is brighter. A day with no spend is an empty `--sunken` cell.
- Gridlines are solid hairlines in `--rule`. Bars are at most 24px thick, rounded 4px at the
  data end, square at the baseline.
- Every chart has a "view as table" twin and a hover or focus read-out. A tooltip is never the
  only way to get a number.

## Type

One family, bundled with the app: **Figtree** (variable, weights 400 to 700; two files,
about 30 kB together; the second file carries the rupee sign). Reference numbers and UPI
handles use the system monospace stack.

| Role               | Size / line                  | Weight     |
| ------------------ | ---------------------------- | ---------- |
| Hero figure        | 44px / 1.05 (32px on phones) | 600        |
| Tile figure        | 28px / 1.1                   | 600        |
| Page title         | 26px / 1.2                   | 650        |
| Section title      | 18px / 1.3                   | 650        |
| Body               | 16px / 1.55                  | 400        |
| Table and controls | 15px / 1.45                  | 400 to 550 |
| Caption, axis      | 13px / 1.4                   | 500        |

- **Every amount uses tabular numerals** (`font-variant-numeric: tabular-nums`), so figures
  line up in columns and do not jitter when a filter changes them.
- Amounts are right-aligned in tables, in INR with Indian grouping (`₹1,23,456.78`). Big
  figures drop the paise and say lakh or crore in words when they get long.
- Sentence case everywhere. The only uppercase is the small tracked label above a figure.
- Text stays under about 68 characters per line.

## Space, shape, depth

- 4px base. Steps: 4, 8, 12, 16, 24, 32, 48, 64. Cards have 24px padding (16px on phones);
  sections are 32px apart, 48px between major blocks.
- Radius 10px on cards, 8px on controls, 999px on chips and badges.
- Depth comes from a hairline border and the paper/surface contrast. One soft shadow exists,
  for the sticky header and menus only.
- Content column is 1120px at most.

## Layout

- **Start screen**: one calm column. What it does, the privacy promise in plain words, the
  drop zone, the sample button, and the reminder to remove sensitive columns.
- **Mapping**: the form on the left, a live preview of parsed rows on the right; stacked on
  phones.
- **Workspace**: a sticky header (name, "nothing uploaded" note, sample badge, theme toggle)
  and five tabs: Overview, Transactions, Signals, Rules and data, How it works.
- **Overview order**: the month filter, then the headline tiles (money out leads), then
  monthly in vs out, categories, top merchants, the calendar, largest payments, month over
  month. One filter row at the top scopes everything under it.
- **Responsive**: two-column grids collapse to one below 860px. Tabs scroll sideways on
  phones. Wide tables scroll inside their own card; the page itself never scrolls sideways.
  Designed down to 360px.

## Components

- **Buttons**: primary is solid teal; secondary is an outline; quiet is text only. 44px tall
  on touch screens.
- **Tiles**: small uppercase label, the figure, one line of context underneath.
- **Signal card**: saffron left edge and a "Signal" stamp, the finding in one sentence, the
  payments behind it, and a "How this is calculated" disclosure showing the formula with the
  real numbers. Never an instruction, never the word "should".
- **Sample badge**: saffron-tint pill reading "Sample data", in the header for as long as the
  synthetic statement is loaded.
- **Privacy note**: a quiet teal-tint strip, not an alarm.

## Motion

Almost none: 120ms colour and border transitions on controls. No count-up numbers and no
animated chart entrances; figures appear in their final state. `prefers-reduced-motion`
removes what little there is.

## Accessibility

- WCAG AA contrast for all text (values above); 3:1 for chart marks and control borders.
- Everything works from the keyboard. Focus is a 2px teal ring with a 2px offset, always
  visible.
- Real elements: buttons are `<button>`, tabs use the tab pattern with arrow keys, tables are
  tables with captions, form fields have labels.
- A skip link, one `<h1>` per view, and status messages (import finished, rows skipped)
  announced through a live region.
- Colour never carries meaning alone: signals carry a label, the heatmap has a legend with
  ranges and a table view.
- Works at 200% zoom and with a 360px viewport.

## Voice

Plain and specific. "412 rows imported, 3 skipped." "This looks like the same payment twice."
No exclamation marks, no finance jargon, no advice. The app reports what the statement says
and how it worked that out.
