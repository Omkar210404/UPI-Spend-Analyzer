/**
 * Every threshold the analytics use, in one place.
 *
 * The app shows these same numbers in each "How this is calculated" panel, so
 * what the screen says and what the code does cannot drift apart. They are
 * starting values chosen by judgement, not tuned on real statements.
 */
export const SIGNAL_DEFAULTS = {
  recurring: {
    /** At least this many payments in a row. */
    minPayments: 3,
    /** Amounts are "similar" within this share of the group's median (0.1 = 10%). */
    amountTolerance: 0.1,
    /** Every gap between consecutive payments must fall in this range of days. */
    minGapDays: 21,
    maxGapDays: 40,
    /** The median gap must fall in this range of days ("roughly monthly"). */
    medianGapMinDays: 26,
    medianGapMaxDays: 35,
    /** Payments this close together count once, so a double charge does not break the pattern. */
    sameChargeWindowDays: 1,
  },
  duplicates: {
    /** Two payments at most this many days apart. Statements rarely carry a time of day. */
    windowDays: 1,
    /** Smaller payments are ignored: two ₹20 teas on one day are ordinary. */
    minAmountPaise: 100_00,
  },
  transactionSpike: {
    /** A payment at least this many times the average of the others in its category. */
    ratio: 3,
    minAmountPaise: 500_00,
    /** There must be at least this many other payments to compare against. */
    minOthers: 5,
  },
  monthSpike: {
    /** A category's month total at least this many times its average in the other full months. */
    ratio: 1.5,
    /** And at least this much above that average. */
    minIncreasePaise: 1000_00,
    /** There must be at least this many other full months to compare against. */
    minOtherMonths: 2,
  },
} as const;

export type RecurringParams = { readonly [K in keyof typeof SIGNAL_DEFAULTS.recurring]: number };
export type DuplicateParams = { readonly [K in keyof typeof SIGNAL_DEFAULTS.duplicates]: number };
export type TransactionSpikeParams = {
  readonly [K in keyof typeof SIGNAL_DEFAULTS.transactionSpike]: number;
};
export type MonthSpikeParams = { readonly [K in keyof typeof SIGNAL_DEFAULTS.monthSpike]: number };

/**
 * The first or last month of a statement counts as partial when the
 * statement starts more than this many days into it, or ends more than this
 * many days before its end. Partial months are marked, and left out of
 * month-level comparisons.
 */
export const PARTIAL_MONTH_TOLERANCE_DAYS = 5;
