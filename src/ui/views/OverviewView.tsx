import { useMemo } from 'preact/hooks';

import {
  categoryBreakdown,
  largestTransactions,
  topMerchants,
} from '../../core/analytics/breakdown';
import { dailySpend } from '../../core/analytics/calendar';
import { monthOverMonth } from '../../core/analytics/compare';
import { PARTIAL_MONTH_TOLERANCE_DAYS } from '../../core/analytics/defaults';
import { fullMonths, monthlySummary, totals, type Period } from '../../core/analytics/monthly';
import { categoryLabel } from '../../core/categorise/categories';
import { formatInr } from '../../core/format/inr';
import { formatDate, formatMonth, monthOf } from '../../core/import/dates';
import { BarChart, Legend } from '../charts/BarChart';
import { Heatmap } from '../charts/Heatmap';
import {
  Amount,
  Card,
  ChartWithTable,
  EmptyNote,
  formatChange,
  formatShare,
  plural,
} from '../components/common';
import { useApp } from '../context';

/** One row of a ranked list: a label, a bar showing its size, the amount, and a share or count. */
function BarRow({
  label,
  paise,
  fraction,
  detail,
  actionLabel,
  onSelect,
}: {
  label: string;
  paise: number;
  /** Bar length from 0 to 1, relative to the largest row. */
  fraction: number;
  detail: string;
  actionLabel: string;
  onSelect: () => void;
}) {
  return (
    <li>
      <button type="button" class="bar-row" onClick={onSelect} aria-label={actionLabel}>
        <span class="bar-row-head">
          <span class="bar-row-label">{label}</span>
          <span class="bar-row-figures">
            <Amount paise={paise} paiseMode="never" />
            <span class="bar-row-detail">{detail}</span>
          </span>
        </span>
        <span class="bar-track" aria-hidden="true">
          <span class="bar-fill" style={{ width: `${Math.max(fraction * 100, 0.8)}%` }} />
        </span>
      </button>
    </li>
  );
}

export function PeriodPicker() {
  const { state, dispatch, txns } = useApp();
  const months = useMemo(() => monthlySummary(txns), [txns]);
  const options: { value: Period; label: string; partial: boolean }[] = [
    { value: 'all', label: 'All months', partial: false },
    ...months.map((month) => ({
      value: month.month,
      label: formatMonth(month.month, 'short'),
      partial: month.partial,
    })),
  ];
  return (
    <div class="period-picker" role="group" aria-label="Period">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          class="chip"
          aria-pressed={state.period === option.value}
          title={option.partial ? 'The statement covers only part of this month' : undefined}
          onClick={() => dispatch({ type: 'set-period', period: option.value })}
        >
          {option.label}
          {option.partial ? <span class="chip-note"> part</span> : null}
        </button>
      ))}
    </div>
  );
}

export function OverviewView() {
  const { state, dispatch, txns } = useApp();
  const { period } = state;

  const months = useMemo(() => monthlySummary(txns), [txns]);
  const summary = useMemo(() => totals(txns, period), [txns, period]);
  const categories = useMemo(() => categoryBreakdown(txns, period), [txns, period]);
  const merchants = useMemo(() => topMerchants(txns, period, 8), [txns, period]);
  const largest = useMemo(() => largestTransactions(txns, period, 8), [txns, period]);
  const days = useMemo(() => dailySpend(txns), [txns]);

  // Month over month needs one month. With "All months" chosen it shows the latest full one.
  const compareMonth = useMemo(() => {
    if (period !== 'all') return period;
    const full = fullMonths(txns);
    return full[full.length - 1] ?? months[months.length - 1]?.month ?? null;
  }, [period, txns, months]);
  const comparison = useMemo(
    () => (compareMonth ? monthOverMonth(txns, compareMonth) : null),
    [txns, compareMonth],
  );

  const periodLabel = period === 'all' ? 'the whole statement' : formatMonth(period);
  const selectedMonth = months.find((month) => month.month === period);
  const heatMonths = period === 'all' ? months.map((month) => month.month) : [period];
  const anyPartial = months.some((month) => month.partial);

  let outContext: string;
  if (period === 'all') {
    outContext =
      months.length > 1
        ? `${formatInr(Math.round(summary.outPaise / months.length), { paise: 'never' })} a month on average, over ${months.length} months`
        : 'Sum of every debit in the statement';
  } else if (comparison?.hasPrevious) {
    const delta = comparison.total.deltaPaise;
    outContext =
      delta === 0
        ? `The same as ${formatMonth(comparison.previous)}`
        : `${formatInr(Math.abs(delta), { paise: 'never' })} ${delta > 0 ? 'more' : 'less'} than ${formatMonth(comparison.previous)}`;
  } else {
    outContext = 'Sum of every debit in the month';
  }

  const topCategory = categories[0]?.paise ?? 0;
  const topMerchant = merchants[0]?.paise ?? 0;

  return (
    <div class="overview">
      <header class="page-head">
        <h1 tabIndex={-1}>Overview</h1>
        <PeriodPicker />
        {selectedMonth?.partial ? (
          <p class="callout">
            The statement covers only part of {formatMonth(selectedMonth.month)}, so its totals are
            lower than a full month's would be.
          </p>
        ) : null}
      </header>

      <section class="tiles" aria-label={`Totals for ${periodLabel}`}>
        <div class="tile tile-hero">
          <p class="tile-label">Money out</p>
          <p class="tile-figure">
            <Amount paise={summary.outPaise} paiseMode="never" />
          </p>
          <p class="tile-context">{outContext}</p>
        </div>
        <div class="tile">
          <p class="tile-label">Money in</p>
          <p class="tile-figure">
            <Amount paise={summary.inPaise} paiseMode="never" />
          </p>
          <p class="tile-context">Every credit, including refunds and money from people</p>
        </div>
        <div class="tile">
          <p class="tile-label">Net</p>
          <p class="tile-figure">
            <Amount paise={summary.netPaise} paiseMode="never" plus />
          </p>
          <p class="tile-context">Money in minus money out</p>
        </div>
        <div class="tile">
          <p class="tile-label">Transactions</p>
          <p class="tile-figure">
            <span class="amount">{summary.count}</span>
          </p>
          <p class="tile-context">
            {summary.debitCount} out, {summary.creditCount} in
          </p>
        </div>
      </section>

      <div class="grid">
        <Card
          id="monthly"
          wide
          title="Money in and money out, by month"
          subtitle={
            anyPartial
              ? `Every month in the statement. A star marks a month the statement only partly covers (it starts or ends more than ${PARTIAL_MONTH_TOLERANCE_DAYS} days inside it).`
              : 'Every month in the statement.'
          }
        >
          <Legend
            items={[
              { label: 'Money out', colorVar: '--series-out' },
              { label: 'Money in', colorVar: '--series-in' },
            ]}
          />
          <ChartWithTable
            label="money in and money out by month"
            chart={
              <BarChart
                height={280}
                ariaLabel={`Bar chart of money out and money in for ${months.length} months. Use "View as table" for the figures.`}
                labels={months.map(
                  (month) => `${formatMonth(month.month, 'short')}${month.partial ? '*' : ''}`,
                )}
                series={[
                  {
                    label: 'Money out',
                    colorVar: '--series-out',
                    values: months.map((month) => month.outPaise),
                  },
                  {
                    label: 'Money in',
                    colorVar: '--series-in',
                    values: months.map((month) => month.inPaise),
                  },
                ]}
              />
            }
            table={
              <table class="data-table">
                <caption class="visually-hidden">Money in and money out by month</caption>
                <thead>
                  <tr>
                    <th scope="col">Month</th>
                    <th scope="col" class="num">
                      Money out
                    </th>
                    <th scope="col" class="num">
                      Money in
                    </th>
                    <th scope="col" class="num">
                      Net
                    </th>
                    <th scope="col" class="num">
                      Transactions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {months.map((month) => (
                    <tr key={month.month}>
                      <th scope="row">
                        {formatMonth(month.month)}
                        {month.partial ? ' (partial)' : ''}
                      </th>
                      <td class="num">{formatInr(month.outPaise)}</td>
                      <td class="num">{formatInr(month.inPaise)}</td>
                      <td class="num">{formatInr(month.netPaise, { plus: true })}</td>
                      <td class="num">{month.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            }
          />
        </Card>

        <Card
          id="categories"
          title="Where it went"
          subtitle={`Money out by category, ${periodLabel}. Select a row to see its transactions.`}
        >
          {categories.length === 0 ? (
            <EmptyNote>No money went out in this period.</EmptyNote>
          ) : (
            <ul class="bar-list">
              {categories.map((row) => (
                <BarRow
                  key={row.category}
                  label={categoryLabel(row.category)}
                  paise={row.paise}
                  fraction={topCategory === 0 ? 0 : row.paise / topCategory}
                  detail={formatShare(row.share)}
                  actionLabel={`${categoryLabel(row.category)}: ${formatInr(row.paise, { paise: 'never' })}, ${formatShare(row.share)} of money out, ${plural(row.count, 'payment')}. Show these transactions`}
                  onSelect={() =>
                    dispatch({
                      type: 'show-transactions',
                      filter: { category: row.category, direction: 'debit' },
                    })
                  }
                />
              ))}
            </ul>
          )}
        </Card>

        <Card
          id="merchants"
          title="Top merchants"
          subtitle={`The ${merchants.length || ''} payees that received the most, ${periodLabel}.`}
        >
          {merchants.length === 0 ? (
            <EmptyNote>No money went out in this period.</EmptyNote>
          ) : (
            <ul class="bar-list">
              {merchants.map((row) => (
                <BarRow
                  key={row.merchantKey}
                  label={row.merchantName}
                  paise={row.paise}
                  fraction={topMerchant === 0 ? 0 : row.paise / topMerchant}
                  detail={`${row.count}×`}
                  actionLabel={`${row.merchantName}: ${formatInr(row.paise, { paise: 'never' })} in ${plural(row.count, 'payment')}. Show these transactions`}
                  onSelect={() =>
                    dispatch({
                      type: 'show-transactions',
                      filter: { search: row.merchantName, direction: 'debit' },
                    })
                  }
                />
              ))}
            </ul>
          )}
        </Card>

        <Card
          id="calendar"
          wide
          title="Spend by day"
          subtitle="Money out on each day. A stronger colour means more. The steps are fifths of the days that had any spend, so one large payment does not wash out the rest."
        >
          <ChartWithTable
            label="money out by day"
            chart={<Heatmap months={heatMonths} days={days} />}
            table={
              <table class="data-table">
                <caption class="visually-hidden">Money out by day</caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col" class="num">
                      Money out
                    </th>
                    <th scope="col" class="num">
                      Payments
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...days]
                    .filter(([date]) => heatMonths.includes(monthOf(date)))
                    .sort(([a], [b]) => (a < b ? -1 : 1))
                    .map(([date, spend]) => (
                      <tr key={date}>
                        <th scope="row">{formatDate(date)}</th>
                        <td class="num">{formatInr(spend.paise)}</td>
                        <td class="num">{spend.count}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            }
          />
        </Card>

        <Card
          id="largest"
          title="Largest payments"
          subtitle={`The biggest single debits, ${periodLabel}.`}
        >
          {largest.length === 0 ? (
            <EmptyNote>No money went out in this period.</EmptyNote>
          ) : (
            <div class="table-scroll">
              <table class="data-table">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Merchant</th>
                    <th scope="col" class="num">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {largest.map((txn) => (
                    <tr key={txn.id}>
                      <td class="nowrap">{formatDate(txn.date)}</td>
                      <td>
                        {txn.merchantName}
                        <span class="cell-sub">{categoryLabel(txn.category)}</span>
                      </td>
                      <td class="num">{formatInr(txn.amountPaise)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {comparison ? (
          <Card
            id="compare"
            title={`${formatMonth(comparison.month)} against ${formatMonth(comparison.previous)}`}
            subtitle={
              period === 'all'
                ? 'Money out by category in the latest full month and the month before. Choose a month at the top to compare a different one.'
                : 'Money out by category in this month and the month before.'
            }
          >
            {!comparison.hasPrevious ? (
              <EmptyNote>
                The statement does not go back to {formatMonth(comparison.previous)}, so there is
                nothing to compare this month with.
              </EmptyNote>
            ) : (
              <>
                {comparison.currentPartial || comparison.previousPartial ? (
                  <p class="callout">
                    The statement covers only part of{' '}
                    {comparison.currentPartial && comparison.previousPartial
                      ? 'both months'
                      : formatMonth(
                          comparison.currentPartial ? comparison.month : comparison.previous,
                        )}
                    , so this is not a like-for-like comparison.
                  </p>
                ) : null}
                <Legend
                  items={[
                    { label: formatMonth(comparison.previous), colorVar: '--series-context' },
                    { label: formatMonth(comparison.month), colorVar: '--series-out' },
                  ]}
                />
                <ChartWithTable
                  label="month over month by category"
                  chart={
                    <BarChart
                      horizontal
                      height={Math.max(180, comparison.rows.length * 46 + 40)}
                      ariaLabel={`Bar chart comparing money out by category in ${formatMonth(comparison.month)} and ${formatMonth(comparison.previous)}. Use "View as table" for the figures.`}
                      labels={comparison.rows.map((row) => categoryLabel(row.category))}
                      series={[
                        {
                          label: formatMonth(comparison.previous),
                          colorVar: '--series-context',
                          values: comparison.rows.map((row) => row.previousPaise),
                        },
                        {
                          label: formatMonth(comparison.month),
                          colorVar: '--series-out',
                          values: comparison.rows.map((row) => row.currentPaise),
                        },
                      ]}
                    />
                  }
                  table={
                    <table class="data-table">
                      <caption class="visually-hidden">Month over month by category</caption>
                      <thead>
                        <tr>
                          <th scope="col">Category</th>
                          <th scope="col" class="num">
                            {formatMonth(comparison.previous, 'short')}
                          </th>
                          <th scope="col" class="num">
                            {formatMonth(comparison.month, 'short')}
                          </th>
                          <th scope="col" class="num">
                            Change
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {comparison.rows.map((row) => (
                          <tr key={row.category}>
                            <th scope="row">{categoryLabel(row.category)}</th>
                            <td class="num">{formatInr(row.previousPaise, { paise: 'never' })}</td>
                            <td class="num">{formatInr(row.currentPaise, { paise: 'never' })}</td>
                            <td class="num">
                              {formatInr(row.deltaPaise, { paise: 'never', plus: true })}
                              <span class="cell-sub">
                                {row.change === null ? 'new' : formatChange(row.change)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <th scope="row">All money out</th>
                          <td class="num">
                            {formatInr(comparison.total.previousPaise, { paise: 'never' })}
                          </td>
                          <td class="num">
                            {formatInr(comparison.total.currentPaise, { paise: 'never' })}
                          </td>
                          <td class="num">
                            {formatInr(comparison.total.deltaPaise, { paise: 'never', plus: true })}
                            <span class="cell-sub">
                              {comparison.total.change === null
                                ? ''
                                : formatChange(comparison.total.change)}
                            </span>
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  }
                />
              </>
            )}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
