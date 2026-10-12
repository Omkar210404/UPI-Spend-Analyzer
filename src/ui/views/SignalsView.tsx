import type { ComponentChildren } from 'preact';
import { useMemo } from 'preact/hooks';

import { SIGNAL_DEFAULTS } from '../../core/analytics/defaults';
import { detectDuplicates } from '../../core/analytics/duplicates';
import { fullMonths } from '../../core/analytics/monthly';
import { detectRecurring } from '../../core/analytics/recurring';
import { detectMonthSpikes, detectTransactionSpikes } from '../../core/analytics/spikes';
import { categoryLabel } from '../../core/categorise/categories';
import type { CategorisedTxn } from '../../core/categorise/categoriser';
import { formatInr } from '../../core/format/inr';
import { formatDate, formatMonth } from '../../core/import/dates';
import { EmptyNote, plural } from '../components/common';
import { FlagIcon } from '../components/icons';
import { useApp } from '../context';

const rupees = (paise: number) => formatInr(paise, { paise: 'auto' });
const times = (ratio: number) => `${ratio >= 10 ? Math.round(ratio) : ratio.toFixed(1)} times`;

function Section({
  id,
  title,
  count,
  intro,
  how,
  children,
}: {
  id: string;
  title: string;
  count: number;
  intro: string;
  how: ComponentChildren;
  children: ComponentChildren;
}) {
  return (
    <section class="signal-section" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>
        {title} <span class="count">{count}</span>
      </h2>
      <p class="section-intro">{intro}</p>
      <details class="details how">
        <summary>How this is calculated</summary>
        <div class="how-body">{how}</div>
      </details>
      {children}
    </section>
  );
}

function SignalCard({ title, children }: { title: string; children: ComponentChildren }) {
  return (
    <li class="signal-card">
      <p class="signal-stamp">
        <FlagIcon />
        Signal
      </p>
      <h3>{title}</h3>
      {children}
    </li>
  );
}

function Payments({ payments }: { payments: CategorisedTxn[] }) {
  return (
    <ul class="payment-list">
      {payments.map((payment) => (
        <li key={payment.id}>
          <span>{formatDate(payment.date)}</span>
          <span class="amount">{formatInr(payment.amountPaise)}</span>
        </li>
      ))}
    </ul>
  );
}

export function SignalsView() {
  const { txns } = useApp();
  const recurring = useMemo(() => detectRecurring(txns), [txns]);
  const duplicates = useMemo(() => detectDuplicates(txns), [txns]);
  const largePayments = useMemo(() => detectTransactionSpikes(txns), [txns]);
  const heavyMonths = useMemo(() => detectMonthSpikes(txns), [txns]);
  const full = useMemo(() => fullMonths(txns), [txns]);

  const r = SIGNAL_DEFAULTS.recurring;
  const d = SIGNAL_DEFAULTS.duplicates;
  const t = SIGNAL_DEFAULTS.transactionSpike;
  const m = SIGNAL_DEFAULTS.monthSpike;
  const monthlyTotal = recurring.reduce((sum, signal) => sum + signal.typicalPaise, 0);

  return (
    <div class="signals">
      <header class="page-head">
        <h1 tabIndex={-1}>Signals</h1>
        <p class="lead">
          Patterns found in this statement by fixed rules, each shown with the numbers behind it. A
          signal is something to look at, not a conclusion and not advice. The rules are simple and
          will sometimes point at things that are perfectly ordinary.
        </p>
      </header>

      <Section
        id="recurring"
        title="Recurring payments"
        count={recurring.length}
        intro="The same merchant, a similar amount, about once a month."
        how={
          <ol>
            <li>Take money-out payments, one merchant at a time.</li>
            <li>
              Group that merchant's payments by amount: every amount in a group is within{' '}
              {r.amountTolerance * 100}% of the group's median.
            </li>
            <li>Within a group, payments {r.sameChargeWindowDays} day or less apart count once.</li>
            <li>
              Find the longest run of at least {r.minPayments} payments where every gap to the next
              one is {r.minGapDays} to {r.maxGapDays} days.
            </li>
            <li>
              Keep it if the median gap is {r.medianGapMinDays} to {r.medianGapMaxDays} days and the
              longest and shortest gaps differ by no more than {r.maxGapSpreadDays} days.
            </li>
            <li>
              Drop it if, between the run's first and last payment, the merchant received more than{' '}
              {r.maxOtherPaymentsPerPayment} other payment for each payment in the run. A shop you
              visit every week will always contain a few payments a month apart by chance.
            </li>
          </ol>
        }
      >
        {recurring.length === 0 ? (
          <EmptyNote>
            No payment fits this pattern. It needs at least {r.minPayments} payments about a month
            apart, so a short statement cannot show one.
          </EmptyNote>
        ) : (
          <>
            <p class="signal-summary">
              Together these come to about <strong class="amount">{rupees(monthlyTotal)}</strong>{' '}
              per cycle, adding up each one's typical amount.
            </p>
            <ul class="signal-list">
              {recurring.map((signal) => (
                <SignalCard
                  key={`${signal.merchantKey}-${signal.typicalPaise}`}
                  title={`${signal.merchantName}: about ${rupees(signal.typicalPaise)} every ${Math.round(signal.medianGapDays)} days`}
                >
                  <p>
                    {signal.payments.length} payments, filed under {categoryLabel(signal.category)}.{' '}
                    {signal.minPaise === signal.maxPaise
                      ? `Each was ${rupees(signal.typicalPaise)}.`
                      : `Amounts ranged from ${rupees(signal.minPaise)} to ${rupees(signal.maxPaise)}; the median is ${rupees(signal.typicalPaise)}.`}{' '}
                    Gaps between payments, in days: {signal.gapsDays.join(', ')} (median{' '}
                    {signal.medianGapDays}).
                    {signal.otherPayments > 0
                      ? ` ${plural(signal.otherPayments, 'other payment')} to this merchant in the same stretch.`
                      : ''}
                  </p>
                  <Payments payments={signal.payments} />
                </SignalCard>
              ))}
            </ul>
          </>
        )}
      </Section>

      <Section
        id="duplicates"
        title="Possible duplicate charges"
        count={duplicates.length}
        intro="The same merchant and exactly the same amount, on the same or the next day."
        how={
          <ol>
            <li>
              Take money-out payments of {rupees(d.minAmountPaise)} or more. Smaller ones are
              ignored: two teas of the same price on one day are ordinary.
            </li>
            <li>Group them by merchant and by exact amount.</li>
            <li>
              Within a group, payments at most {d.windowDays} day apart form one signal. Statements
              usually give a date and no time, so a shorter window is not possible.
            </li>
            <li>
              If the rows carry the same reference number, it is one payment listed twice rather
              than two charges, and the signal says so.
            </li>
          </ol>
        }
      >
        {duplicates.length === 0 ? (
          <EmptyNote>No two payments fit this pattern.</EmptyNote>
        ) : (
          <ul class="signal-list">
            {duplicates.map((signal) => (
              <SignalCard
                key={`${signal.merchantKey}-${signal.amountPaise}-${signal.payments[0]!.id}`}
                title={`${signal.merchantName}: ${rupees(signal.amountPaise)}, ${signal.payments.length} times`}
              >
                <p>
                  {signal.kind === 'same-reference'
                    ? 'These rows have the same reference number, so this looks like one payment that appears more than once in the file, not two charges.'
                    : signal.spanDays === 0
                      ? 'Same merchant, same amount, same day. It may be one purchase charged twice, or two separate purchases at the same price.'
                      : `Same merchant and same amount, ${plural(signal.spanDays, 'day')} apart. It may be one purchase charged twice, or two separate purchases at the same price.`}
                </p>
                <Payments payments={signal.payments} />
              </SignalCard>
            ))}
          </ul>
        )}
      </Section>

      <Section
        id="large"
        title="Unusually large payments"
        count={largePayments.length}
        intro="A payment several times your own average for that merchant, or for that category."
        how={
          <ol>
            <li>Take money-out payments of {rupees(t.minAmountPaise)} or more.</li>
            <li>
              Compare each with the average of your <em>other</em> payments to the same merchant.
              The payment itself is left out of the average.
            </li>
            <li>
              If that merchant has fewer than {t.minOthers} other payments, compare with the average
              of your other payments in the same category instead. If the category also has fewer
              than {t.minOthers}, nothing is said.
            </li>
            <li>It is a signal when the payment is at least {t.ratio} times that average.</li>
          </ol>
        }
      >
        {largePayments.length === 0 ? (
          <EmptyNote>No payment is {t.ratio} times its own average or more.</EmptyNote>
        ) : (
          <ul class="signal-list">
            {largePayments.slice(0, 12).map((signal) => (
              <SignalCard
                key={signal.txn.id}
                title={`${signal.txn.merchantName}: ${rupees(signal.txn.amountPaise)} on ${formatDate(signal.txn.date)}`}
              >
                <p>
                  That is {times(signal.ratio)} your average of {rupees(signal.averageOthersPaise)}{' '}
                  {signal.basis === 'merchant'
                    ? `across ${signal.othersCount} other payments to ${signal.basisLabel}.`
                    : `across ${signal.othersCount} other ${signal.basisLabel} payments (there are too few payments to this merchant to compare with).`}
                </p>
              </SignalCard>
            ))}
          </ul>
        )}
        {largePayments.length > 12 ? (
          <p class="field-hint">
            Showing the 12 with the highest ratio, of {largePayments.length}.
          </p>
        ) : null}
      </Section>

      <Section
        id="heavy"
        title="Unusually heavy months"
        count={heavyMonths.length}
        intro="A category that took much more in one month than it usually does."
        how={
          <ol>
            <li>
              Use only months the statement covers in full: {full.length} here
              {full.length > 0
                ? ` (${full.map((month) => formatMonth(month, 'short')).join(', ')})`
                : ''}
              .
            </li>
            <li>
              For each category, compare a month's money out with the average of the <em>other</em>{' '}
              full months. A month with no spend counts as zero.
            </li>
            <li>
              It is a signal when the month is at least {m.ratio} times that average and at least{' '}
              {rupees(m.minIncreasePaise)} above it.
            </li>
            <li>
              At least {m.minOtherMonths} other full months are needed, so {m.minOtherMonths + 1} in
              all.
            </li>
          </ol>
        }
      >
        {heavyMonths.length === 0 ? (
          <EmptyNote>
            {full.length < m.minOtherMonths + 1
              ? `This needs at least ${m.minOtherMonths + 1} full months; the statement has ${full.length}.`
              : 'No category stands out in any month.'}
          </EmptyNote>
        ) : (
          <ul class="signal-list">
            {heavyMonths.map((signal) => (
              <SignalCard
                key={`${signal.category}-${signal.month}`}
                title={`${categoryLabel(signal.category)} in ${formatMonth(signal.month)}: ${rupees(signal.totalPaise)}`}
              >
                <p>
                  {signal.ratio === null
                    ? `There was no ${categoryLabel(signal.category)} spend in the other ${signal.otherMonths} full months.`
                    : `That is ${times(signal.ratio)} the average of ${rupees(signal.averageOthersPaise)} across the other ${signal.otherMonths} full months, or ${rupees(signal.totalPaise - signal.averageOthersPaise)} more.`}
                </p>
              </SignalCard>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}
