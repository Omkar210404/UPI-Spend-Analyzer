import { useEffect, useMemo, useState } from 'preact/hooks';

import { inPeriod } from '../../core/analytics/monthly';
import {
  CATEGORIES,
  categoryLabel,
  isCategoryId,
  type CategoryId,
} from '../../core/categorise/categories';
import { describeReason, type CategorisedTxn } from '../../core/categorise/categoriser';
import {
  clearMerchantOverride,
  clearTxnOverride,
  setMerchantOverride,
  setTxnOverride,
} from '../../core/categorise/overrides';
import { toCsv } from '../../core/export/csv';
import { formatInr } from '../../core/format/inr';
import { formatDate } from '../../core/import/dates';
import { PATTERNS } from '../../core/narration/registry';
import { EmptyNote, plural } from '../components/common';
import { ChevronIcon, DownloadIcon } from '../components/icons';
import { useApp } from '../context';
import { baseName, downloadText } from '../files';
import { PeriodPicker } from './OverviewView';

const PAGE_SIZE = 50;

function patternLabel(id: string): string {
  return PATTERNS.find((pattern) => pattern.id === id)?.label ?? id;
}

function Details({ txn, sameMerchant }: { txn: CategorisedTxn; sameMerchant: CategorisedTxn[] }) {
  const { state, dispatch } = useApp();
  const { overrides } = state.settings;
  const others = sameMerchant.length - 1;
  const merchantWide = overrides.byMerchant[txn.merchantKey];
  const overridden = txn.reason.kind === 'txn-override' || txn.reason.kind === 'merchant-override';

  return (
    <div class="txn-details">
      <dl class="detail-list">
        <div>
          <dt>Narration</dt>
          <dd class="mono">{txn.narration || 'None'}</dd>
        </div>
        <div>
          <dt>Read as</dt>
          <dd>{patternLabel(txn.parsed.patternId)}</dd>
        </div>
        {txn.parsed.vpa ? (
          <div>
            <dt>UPI handle</dt>
            <dd class="mono">{txn.parsed.vpa}</dd>
          </div>
        ) : null}
        {txn.reference ? (
          <div>
            <dt>Reference</dt>
            <dd class="mono">{txn.reference}</dd>
          </div>
        ) : null}
        {txn.parsed.note ? (
          <div>
            <dt>Note</dt>
            <dd>{txn.parsed.note}</dd>
          </div>
        ) : null}
        {txn.balancePaise !== null ? (
          <div>
            <dt>Balance after</dt>
            <dd class="amount">{formatInr(txn.balancePaise)}</dd>
          </div>
        ) : null}
        <div>
          <dt>Why {categoryLabel(txn.category)}</dt>
          <dd>{describeReason(txn.reason, txn.category)}</dd>
        </div>
      </dl>
      <div class="button-row">
        {merchantWide !== txn.category ? (
          <button
            type="button"
            class="button button-secondary button-small"
            onClick={() =>
              dispatch({
                type: 'set-overrides',
                overrides: setMerchantOverride(
                  overrides,
                  txn.merchantKey,
                  txn.category,
                  sameMerchant.map((entry) => entry.id),
                ),
                notice: `${categoryLabel(txn.category)} applied to ${plural(sameMerchant.length, 'transaction')} from ${txn.merchantName}.`,
              })
            }
          >
            Use {categoryLabel(txn.category)} for all {sameMerchant.length} from {txn.merchantName}
          </button>
        ) : null}
        {overridden ? (
          <button
            type="button"
            class="button button-quiet button-small"
            onClick={() =>
              dispatch({
                type: 'set-overrides',
                overrides:
                  txn.reason.kind === 'txn-override'
                    ? clearTxnOverride(overrides, txn.id)
                    : clearMerchantOverride(overrides, txn.merchantKey),
                notice: 'Your category choice was removed.',
              })
            }
          >
            {txn.reason.kind === 'txn-override'
              ? 'Undo my choice for this transaction'
              : `Undo my choice for ${txn.merchantName}`}
          </button>
        ) : null}
      </div>
      {others > 0 && merchantWide === txn.category ? (
        <p class="field-hint">
          Your choice applies to all {sameMerchant.length} transactions from {txn.merchantName}.
        </p>
      ) : null}
    </div>
  );
}

export function TransactionsView() {
  const { state, dispatch, txns } = useApp();
  const { filter, period, statement } = state;
  const { overrides } = state.settings;
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const byMerchant = useMemo(() => {
    const groups = new Map<string, CategorisedTxn[]>();
    for (const txn of txns) {
      const group = groups.get(txn.merchantKey);
      if (group) group.push(txn);
      else groups.set(txn.merchantKey, [txn]);
    }
    return groups;
  }, [txns]);

  const visible = useMemo(() => {
    const words = filter.search.toLowerCase().split(/\s+/).filter(Boolean);
    return txns
      .filter((txn) => {
        if (!inPeriod(txn, period)) return false;
        if (filter.direction !== 'all' && txn.direction !== filter.direction) return false;
        if (filter.category !== 'all' && txn.category !== filter.category) return false;
        if (words.length === 0) return true;
        const text =
          `${txn.merchantName} ${txn.narration} ${categoryLabel(txn.category)}`.toLowerCase();
        return words.every((word) => text.includes(word));
      })
      .reverse();
  }, [txns, filter, period]);

  // A new filter starts again from the first page.
  useEffect(() => setPage(0), [filter, period]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  const shown = visible.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const totalOut = visible.reduce(
    (sum, txn) => sum + (txn.direction === 'debit' ? txn.amountPaise : 0),
    0,
  );
  const totalIn = visible.reduce(
    (sum, txn) => sum + (txn.direction === 'credit' ? txn.amountPaise : 0),
    0,
  );

  const setCategory = (txn: CategorisedTxn, category: CategoryId) => {
    dispatch({
      type: 'set-overrides',
      overrides: setTxnOverride(overrides, txn.id, category),
      notice: `${txn.merchantName} on ${formatDate(txn.date)} is now ${categoryLabel(category)}.`,
    });
    setOpenId(txn.id);
  };

  return (
    <div class="transactions">
      <header class="page-head">
        <h1 tabIndex={-1}>Transactions</h1>
        <PeriodPicker />
      </header>

      <div class="toolbar">
        <div class="field field-grow">
          <label for="txn-search">Search</label>
          <input
            id="txn-search"
            type="search"
            placeholder="Merchant, narration or category"
            value={filter.search}
            onInput={(event) =>
              dispatch({
                type: 'set-filter',
                filter: { ...filter, search: event.currentTarget.value },
              })
            }
          />
        </div>
        <div class="field">
          <label for="txn-category">Category</label>
          <select
            id="txn-category"
            value={filter.category}
            onChange={(event) =>
              dispatch({
                type: 'set-filter',
                filter: { ...filter, category: event.currentTarget.value },
              })
            }
          >
            <option value="all">All categories</option>
            {CATEGORIES.map((category) => (
              <option key={category.id} value={category.id}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
        <div class="field">
          <label for="txn-direction">Direction</label>
          <select
            id="txn-direction"
            value={filter.direction}
            onChange={(event) => {
              const value = event.currentTarget.value;
              dispatch({
                type: 'set-filter',
                filter: {
                  ...filter,
                  direction: value === 'debit' || value === 'credit' ? value : 'all',
                },
              });
            }}
          >
            <option value="all">Money in and out</option>
            <option value="debit">Money out</option>
            <option value="credit">Money in</option>
          </select>
        </div>
        <button
          type="button"
          class="button button-secondary"
          onClick={() => {
            downloadText(
              `${baseName(statement?.fileName ?? 'statement')}-categorised.csv`,
              toCsv(txns),
              'text/csv',
            );
            dispatch({
              type: 'notice',
              text: `Exported ${plural(txns.length, 'transaction')} as CSV.`,
            });
          }}
        >
          <DownloadIcon />
          Export all as CSV
        </button>
      </div>

      <p class="result-line" aria-live="polite">
        {plural(visible.length, 'transaction')} shown
        {visible.length > 0 ? (
          <>
            : <span class="amount">{formatInr(totalOut)}</span> out,{' '}
            <span class="amount">{formatInr(totalIn)}</span> in
          </>
        ) : null}
        . The export always contains all {txns.length}.
      </p>

      {visible.length === 0 ? (
        <EmptyNote>No transaction matches these filters.</EmptyNote>
      ) : (
        <div class="card card-flush">
          <table class="data-table txn-table">
            <caption class="visually-hidden">
              Transactions, newest first. Change a category with the menu in its row.
            </caption>
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Merchant</th>
                <th scope="col">Category</th>
                <th scope="col" class="num">
                  Amount
                </th>
                <th scope="col">
                  <span class="visually-hidden">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((txn) => {
                const open = openId === txn.id;
                const own =
                  txn.reason.kind === 'txn-override' || txn.reason.kind === 'merchant-override';
                return (
                  <>
                    <tr key={txn.id} class={open ? 'txn-row txn-row-open' : 'txn-row'}>
                      <td class="nowrap txn-date">{formatDate(txn.date)}</td>
                      <td class="txn-merchant">
                        {txn.merchantName}
                        <span class="cell-sub">
                          {txn.parsed.channel === 'OTHER' ? 'Other' : txn.parsed.channel}
                          {txn.parsed.note ? ` · ${txn.parsed.note}` : ''}
                        </span>
                      </td>
                      <td class="txn-category">
                        <select
                          class={own ? 'select-inline select-own' : 'select-inline'}
                          aria-label={`Category for ${txn.merchantName}, ${formatDate(txn.date)}, ${formatInr(txn.amountPaise)}`}
                          value={txn.category}
                          onChange={(event) => {
                            const value = event.currentTarget.value;
                            if (isCategoryId(value)) setCategory(txn, value);
                          }}
                        >
                          {CATEGORIES.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                        {own ? <span class="own-mark">your choice</span> : null}
                      </td>
                      <td
                        class={
                          txn.direction === 'credit' ? 'num txn-amount txn-in' : 'num txn-amount'
                        }
                      >
                        {txn.direction === 'credit' ? '+' : ''}
                        {formatInr(txn.amountPaise)}
                        <span class="cell-sub">{txn.direction === 'credit' ? 'in' : 'out'}</span>
                      </td>
                      <td class="txn-toggle">
                        <button
                          type="button"
                          class={
                            open
                              ? 'button button-quiet icon-button is-open'
                              : 'button button-quiet icon-button'
                          }
                          aria-expanded={open}
                          aria-label={`${open ? 'Hide' : 'Show'} details for ${txn.merchantName}, ${formatDate(txn.date)}`}
                          onClick={() => setOpenId(open ? null : txn.id)}
                        >
                          <ChevronIcon />
                        </button>
                      </td>
                    </tr>
                    {open ? (
                      <tr key={`${txn.id}-details`} class="txn-details-row">
                        <td colSpan={5}>
                          <Details
                            txn={txn}
                            sameMerchant={byMerchant.get(txn.merchantKey) ?? [txn]}
                          />
                        </td>
                      </tr>
                    ) : null}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <nav class="pager" aria-label="Pages of transactions">
          <button
            type="button"
            class="button button-secondary button-small"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Newer
          </button>
          <span>
            Page {current + 1} of {pages}
          </span>
          <button
            type="button"
            class="button button-secondary button-small"
            disabled={current >= pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Older
          </button>
        </nav>
      ) : null}
    </div>
  );
}
