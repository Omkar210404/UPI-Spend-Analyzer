import {
  calendarWeeks,
  heatLevel,
  heatThresholds,
  HEAT_LEVELS,
  type DaySpend,
} from '../../core/analytics/calendar';
import { formatInr } from '../../core/format/inr';
import { formatDate, formatMonth, fromIso } from '../../core/import/dates';
import type { IsoDate, IsoMonth } from '../../core/types';
import { plural } from '../components/common';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * The colour steps actually in use. With fewer distinct thresholds than
 * steps, the steps are spread across the ramp so the top one is still the
 * darkest: two steps use shades 2 and 5, not 1 and 2.
 */
function shadeFor(level: number, steps: number): number {
  if (level === 0) return 0;
  if (steps <= 1) return HEAT_LEVELS;
  return 1 + Math.round(((level - 1) * (HEAT_LEVELS - 1)) / (steps - 1));
}

function MonthGrid({
  month,
  days,
  thresholds,
}: {
  month: IsoMonth;
  days: Map<IsoDate, DaySpend>;
  thresholds: number[];
}) {
  const steps = thresholds.length + 1;
  return (
    <table class="heat-month">
      <caption>{formatMonth(month)}</caption>
      <thead>
        <tr>
          {WEEKDAYS.map((weekday) => (
            <th key={weekday} scope="col">
              <abbr title={weekday}>{weekday[0]}</abbr>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {calendarWeeks(month).map((week, index) => (
          <tr key={index}>
            {week.map((date, weekday) => {
              if (!date) return <td key={weekday} class="heat-cell heat-outside" />;
              const spend = days.get(date);
              const shade = shadeFor(heatLevel(spend?.paise ?? 0, thresholds), steps);
              const text = spend
                ? `${formatDate(date)}: ${formatInr(spend.paise)} in ${plural(spend.count, 'payment')}`
                : `${formatDate(date)}: no spend`;
              return (
                <td key={weekday} class={`heat-cell heat-${shade}`} title={text}>
                  <span aria-hidden="true">{fromIso(date).day}</span>
                  <span class="visually-hidden">{text}</span>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A calendar of money out per day, one small month at a time. */
export function Heatmap({ months, days }: { months: IsoMonth[]; days: Map<IsoDate, DaySpend> }) {
  const shown = [...days].filter(([date]) => months.includes(date.slice(0, 7)));
  const thresholds = heatThresholds(shown.map(([, spend]) => spend.paise));
  const steps = thresholds.length + 1;
  const max = Math.max(0, ...shown.map(([, spend]) => spend.paise));

  const ranges: { shade: number; text: string }[] = [];
  for (let level = 1; level <= steps; level += 1) {
    const low = level === 1 ? null : thresholds[level - 2]!;
    const high = level === steps ? max : thresholds[level - 1]!;
    ranges.push({
      shade: shadeFor(level, steps),
      text:
        low === null
          ? `up to ${formatInr(high, { paise: 'never' })}`
          : `${formatInr(low, { paise: 'never' })} to ${formatInr(high, { paise: 'never' })}`,
    });
  }

  return (
    <div>
      <div class={months.length === 1 ? 'heat-grid heat-grid-single' : 'heat-grid'}>
        {months.map((month) => (
          <MonthGrid key={month} month={month} days={days} thresholds={thresholds} />
        ))}
      </div>
      {shown.length > 0 ? (
        <ul class="heat-legend" aria-label="Colour scale: money out in a day">
          <li>
            <span class="heat-swatch heat-0" />
            no spend
          </li>
          {ranges.map((range) => (
            <li key={range.shade}>
              <span class={`heat-swatch heat-${range.shade}`} />
              {range.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
