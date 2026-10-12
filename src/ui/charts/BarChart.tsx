import { BarController, BarElement, CategoryScale, Chart, LinearScale, Tooltip } from 'chart.js';
import { useEffect, useRef } from 'preact/hooks';

import { formatInr, formatInrAxis } from '../../core/format/inr';
import { useApp } from '../context';

// Only the pieces a bar chart needs are registered, so the rest of Chart.js is left out of the bundle.
Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip);

export interface BarSeries {
  label: string;
  /** Amounts in paise, one per label. */
  values: number[];
  /** Name of the CSS custom property holding this series' colour. */
  colorVar: string;
}

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * A bar chart of rupee amounts. Colours and fonts come from the page's CSS
 * variables, so the chart follows the light and dark themes. It is drawn in
 * its final state: no entrance animation.
 */
export function BarChart({
  labels,
  series,
  horizontal = false,
  height,
  ariaLabel,
}: {
  labels: string[];
  series: BarSeries[];
  horizontal?: boolean;
  height: number;
  ariaLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { state } = useApp();
  const theme = state.theme;
  // The chart is rebuilt when the data or the theme changes; this key says when.
  const dataKey = JSON.stringify([labels, series, horizontal]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ink2 = cssVar('--ink-2');
    const rule = cssVar('--rule');
    const fontFamily = cssVar('--font-sans');
    const valueAxis = {
      beginAtZero: true,
      border: { display: false },
      grid: { color: rule, drawTicks: false },
      ticks: {
        color: ink2,
        padding: 8,
        maxTicksLimit: 6,
        font: { family: fontFamily, size: 12 },
        callback: (value: string | number) => formatInrAxis(Number(value)),
      },
    };
    const categoryAxis = {
      border: { color: cssVar('--axis') },
      grid: { display: false },
      ticks: { color: ink2, font: { family: fontFamily, size: 12 } },
    };

    const chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: series.map((entry) => ({
          label: entry.label,
          data: entry.values,
          backgroundColor: cssVar(entry.colorVar),
          hoverBackgroundColor: cssVar(entry.colorVar),
          borderRadius: 4,
          maxBarThickness: 24,
          categoryPercentage: 0.72,
          barPercentage: 0.86,
        })),
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
        plugins: {
          tooltip: {
            backgroundColor: cssVar('--ink'),
            titleColor: cssVar('--paper'),
            bodyColor: cssVar('--paper'),
            titleFont: { family: fontFamily, size: 13, weight: 600 },
            bodyFont: { family: fontFamily, size: 13 },
            padding: 10,
            cornerRadius: 8,
            boxPadding: 4,
            callbacks: {
              label: (item) => ` ${item.dataset.label ?? ''}: ${formatInr(Number(item.raw))}`,
            },
          },
        },
      },
    });
    return () => chart.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dataKey stands in for labels, series and horizontal
  }, [dataKey, theme]);

  return (
    <div class="chart-frame" style={{ height: `${height}px` }}>
      <canvas ref={canvasRef} role="img" aria-label={ariaLabel} />
    </div>
  );
}

/** The legend for a chart with more than one series: a swatch and a name each. */
export function Legend({ items }: { items: { label: string; colorVar: string }[] }) {
  return (
    <ul class="legend">
      {items.map((item) => (
        <li key={item.label}>
          <span class="legend-swatch" style={{ background: `var(${item.colorVar})` }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}
