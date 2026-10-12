import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';

import { formatInr } from '../../core/format/inr';

/** A money figure. Always in tabular numerals so columns of them line up. */
export function Amount({
  paise,
  paiseMode = 'always',
  plus = false,
}: {
  paise: number;
  paiseMode?: 'always' | 'never' | 'auto';
  plus?: boolean;
}) {
  return <span class="amount">{formatInr(paise, { paise: paiseMode, plus })}</span>;
}

export function Card({
  title,
  subtitle,
  actions,
  children,
  wide = false,
  id,
}: {
  title: string;
  subtitle?: ComponentChildren;
  actions?: ComponentChildren;
  children: ComponentChildren;
  wide?: boolean;
  id?: string;
}) {
  return (
    <section
      class={wide ? 'card card-wide' : 'card'}
      aria-labelledby={id ? `${id}-title` : undefined}
    >
      <header class="card-head">
        <div>
          <h2 class="card-title" id={id ? `${id}-title` : undefined}>
            {title}
          </h2>
          {subtitle ? <p class="card-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div class="card-actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

/**
 * A chart and its table twin. The chart is the default; the button swaps in a
 * plain table holding the same numbers, so no figure is only reachable by
 * hovering or by reading colour.
 */
export function ChartWithTable({
  chart,
  table,
  label,
}: {
  chart: ComponentChildren;
  table: ComponentChildren;
  /** What the chart shows, for the button's accessible name. */
  label: string;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <div class="chart-block">
      <div class="chart-toggle">
        <button
          type="button"
          class="button button-quiet button-small"
          aria-pressed={asTable}
          aria-label={`${asTable ? 'View as chart' : 'View as table'}: ${label}`}
          onClick={() => setAsTable(!asTable)}
        >
          {asTable ? 'View as chart' : 'View as table'}
        </button>
      </div>
      {asTable ? <div class="table-scroll">{table}</div> : chart}
    </div>
  );
}

export function EmptyNote({ children }: { children: ComponentChildren }) {
  return <p class="empty-note">{children}</p>;
}

/** `0.254` -> `25%`. Shares under 1% are written as `<1%`. */
export function formatShare(share: number): string {
  const percent = share * 100;
  if (percent > 0 && percent < 1) return '<1%';
  return `${Math.round(percent)}%`;
}

/** A change as a signed percentage: `0.25` -> `+25%`. */
export function formatChange(change: number): string {
  const percent = Math.round(change * 100);
  return `${percent > 0 ? '+' : percent < 0 ? '−' : ''}${Math.abs(percent)}%`;
}

export function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`;
}
