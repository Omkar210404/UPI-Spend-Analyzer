import { useMemo, useState } from 'preact/hooks';

import { formatInr } from '../../core/format/inr';
import {
  DATE_FORMATS,
  detectDateFormat,
  formatDate,
  type DateFormatId,
} from '../../core/import/dates';
import {
  applyMapping,
  createProfile,
  SKIP_REASON_TEXT,
  validateMapping,
  type AmountMode,
  type MappingDraft,
} from '../../core/import/mapping';
import { columnValues } from '../../core/import/table';
import { plural } from '../components/common';
import { useApp } from '../context';
import { baseName } from '../files';
import { buildStatement } from '../import-file';

const AMOUNT_MODES: readonly { id: AmountMode; label: string; hint: string }[] = [
  {
    id: 'debit-credit',
    label: 'Two columns',
    hint: 'One column for money out (debit, withdrawal) and one for money in (credit, deposit).',
  },
  {
    id: 'amount-marker',
    label: 'One amount, with Dr/Cr',
    hint: 'One amount column, with Dr or Cr in its own column or written after the amount.',
  },
  {
    id: 'signed',
    label: 'One signed amount',
    hint: 'One amount column where a minus sign tells money out from money in.',
  },
];

type ColumnField =
  'date' | 'narration' | 'debit' | 'credit' | 'amount' | 'marker' | 'balance' | 'reference';

export function MappingView() {
  const { state, dispatch } = useApp();
  const pending = state.pending!;
  const { table, sensitive } = pending.prepared;
  const { draft } = pending;

  const [remember, setRemember] = useState(pending.source !== 'sample');
  const [profileName, setProfileName] = useState(
    pending.profile?.name ?? baseName(pending.fileName),
  );

  const flagged = useMemo(
    () => sensitive.filter((entry) => !pending.unflagged.includes(entry.column)),
    [sensitive, pending.unflagged],
  );
  const flaggedColumns = useMemo(() => new Set(flagged.map((entry) => entry.column)), [flagged]);

  const validation = useMemo(() => validateMapping(draft, table), [draft, table]);
  const result = useMemo(
    () =>
      validation.ok
        ? applyMapping(table, validation.mapping, { mergeContinuations: pending.source === 'pdf' })
        : null,
    [validation, table, pending.source],
  );
  const dateDetection = useMemo(
    () => (draft.date === null ? null : detectDateFormat(columnValues(table, draft.date))),
    [draft.date, table],
  );

  const update = (changes: Partial<MappingDraft>) => {
    const next = { ...draft, ...changes };
    // Picking a new date column re-detects its format.
    if (changes.date !== undefined && changes.date !== null && changes.date !== draft.date) {
      next.dateFormat =
        detectDateFormat(columnValues(table, changes.date)).format ?? next.dateFormat;
    }
    dispatch({ type: 'set-draft', draft: next });
  };

  const sampleOf = (column: number): string => {
    const value = table.rows.find((row) => (row[column] ?? '') !== '')?.[column] ?? '';
    return value.length > 28 ? `${value.slice(0, 28)}…` : value;
  };

  const columnSelect = (field: ColumnField, label: string, required: boolean, hint?: string) => (
    <div class="field">
      <label for={`map-${field}`}>
        {label}
        {required ? null : <span class="optional"> (optional)</span>}
      </label>
      <select
        id={`map-${field}`}
        value={draft[field] === null ? '' : String(draft[field])}
        onChange={(event) => {
          const value = event.currentTarget.value;
          update({ [field]: value === '' ? null : Number(value) });
        }}
      >
        <option value="">{required ? 'Choose a column' : 'Not in this file'}</option>
        {table.header.map((name, column) => {
          const sensitiveHere = flaggedColumns.has(column);
          const example = sampleOf(column);
          return (
            <option key={column} value={String(column)} disabled={sensitiveHere}>
              {name}
              {sensitiveHere ? ' (not imported)' : example ? `  ·  ${example}` : ''}
            </option>
          );
        })}
      </select>
      {hint ? <p class="field-hint">{hint}</p> : null}
    </div>
  );

  const confirm = () => {
    if (!validation.ok) return;
    const name = profileName.trim();
    dispatch({
      type: 'statement-loaded',
      statement: buildStatement(pending, validation.mapping),
      saveProfile:
        remember && name !== ''
          ? createProfile(
              pending.profile?.id ?? `profile-${Date.now().toString(36)}`,
              name.slice(0, 80),
              table,
              validation.mapping,
            )
          : null,
    });
  };

  const usedColumns = new Set(
    [
      draft.date,
      draft.narration,
      draft.debit,
      draft.credit,
      draft.amount,
      draft.marker,
      draft.balance,
      draft.reference,
    ].filter((column): column is number => column !== null),
  );
  const leftBehind = table.header
    .map((name, column) => ({ name, column }))
    .filter(({ column }) => !usedColumns.has(column));

  return (
    <div class="mapping">
      <header class="page-head">
        <h1 tabIndex={-1}>Match the columns</h1>
        <p class="lead">
          Tell the app which column of <strong>{pending.fileName}</strong> is which. It has made a
          first guess; check it against the preview, then import.
        </p>
        {pending.source === 'sample' ? <p class="sample-badge">Sample data</p> : null}
        {pending.source === 'pdf' ? (
          <p class="callout">
            PDF import is experimental. The table was rebuilt from the positions of the text on each
            page, which can go wrong. Check the preview carefully, and prefer a CSV export if your
            bank offers one.
          </p>
        ) : null}
        {pending.profile ? (
          <p class="callout">
            Using your saved mapping <strong>{pending.profile.name}</strong>, because this file has
            the same columns.
          </p>
        ) : null}
      </header>

      <div class="mapping-grid">
        <form
          class="card mapping-form"
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <h2 class="card-title">Columns</h2>

          <div class="field">
            <label for="map-header-row">Header row</label>
            <input
              id="map-header-row"
              type="number"
              min={1}
              max={Math.max(1, pending.fileRows.length - 1)}
              value={table.headerRowIndex + 1}
              onChange={(event) => {
                const row = Number(event.currentTarget.value);
                if (Number.isInteger(row) && row >= 1 && row < pending.fileRows.length) {
                  dispatch({ type: 'set-header-row', index: row - 1 });
                }
              }}
            />
            <p class="field-hint">
              The line of the file that names the columns. Anything above it (the bank's block about
              the account) is discarded: {plural(table.headerRowIndex, 'line')} here.
            </p>
          </div>

          {columnSelect('date', 'Date', true)}
          <div class="field">
            <label for="map-date-format">Date format</label>
            <select
              id="map-date-format"
              value={draft.dateFormat}
              onChange={(event) =>
                update({ dateFormat: event.currentTarget.value as DateFormatId })
              }
            >
              {DATE_FORMATS.map((format) => (
                <option key={format.id} value={format.id}>
                  {format.label} ({format.example.split(',')[0]})
                </option>
              ))}
            </select>
            {dateDetection ? (
              <p class={dateDetection.ambiguous ? 'field-hint field-hint-warn' : 'field-hint'}>
                {dateDetection.reason}
                {dateDetection.ambiguous ? ' Change it here if that is wrong.' : ''}
              </p>
            ) : null}
          </div>

          {columnSelect('narration', 'Narration or description', true)}

          <fieldset class="field">
            <legend>How the file shows amounts</legend>
            {AMOUNT_MODES.map((mode) => (
              <label key={mode.id} class="radio">
                <input
                  type="radio"
                  name="amount-mode"
                  checked={draft.amountMode === mode.id}
                  onChange={() => update({ amountMode: mode.id })}
                />
                <span>
                  <strong>{mode.label}</strong>
                  <span class="radio-hint">{mode.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {draft.amountMode === 'debit-credit' ? (
            <div class="field-pair">
              {columnSelect('debit', 'Debit (money out)', true)}
              {columnSelect('credit', 'Credit (money in)', true)}
            </div>
          ) : null}
          {draft.amountMode !== 'debit-credit' ? columnSelect('amount', 'Amount', true) : null}
          {draft.amountMode === 'amount-marker'
            ? columnSelect(
                'marker',
                'Dr/Cr column',
                false,
                'Leave as "Not in this file" when Dr or Cr is written after the amount itself.',
              )
            : null}
          {draft.amountMode === 'signed' ? (
            <div class="field">
              <label for="map-positive">A positive amount means</label>
              <select
                id="map-positive"
                value={draft.positiveIs}
                onChange={(event) =>
                  update({ positiveIs: event.currentTarget.value === 'debit' ? 'debit' : 'credit' })
                }
              >
                <option value="credit">Money in (negative is money out)</option>
                <option value="debit">Money out (negative is money in)</option>
              </select>
            </div>
          ) : null}

          <div class="field-pair">
            {columnSelect('balance', 'Balance', false)}
            {columnSelect('reference', 'Reference number', false)}
          </div>

          <div class="field">
            <label class="checkbox">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.currentTarget.checked)}
              />
              <span>Remember this mapping for files with the same columns</span>
            </label>
            {remember ? (
              <>
                <label for="map-profile-name" class="sub-label">
                  Name for this mapping
                </label>
                <input
                  id="map-profile-name"
                  type="text"
                  maxLength={80}
                  value={profileName}
                  onInput={(event) => setProfileName(event.currentTarget.value)}
                />
              </>
            ) : null}
            <p class="field-hint">
              Saved in this browser only, as column positions and formats. No rows are saved.
            </p>
          </div>

          {!validation.ok ? (
            <ul class="form-error" role="alert">
              {validation.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          <div class="button-row">
            <button
              type="submit"
              class="button button-primary"
              disabled={!result || result.rows.length === 0}
            >
              {result && result.rows.length > 0
                ? `Import ${plural(result.rows.length, 'transaction')}`
                : 'Import'}
            </button>
            <button
              type="button"
              class="button button-quiet"
              onClick={() => dispatch({ type: 'cancel-import' })}
            >
              Cancel
            </button>
          </div>
        </form>

        <div class="mapping-side">
          <section class="card" aria-labelledby="preview-title">
            <h2 class="card-title" id="preview-title">
              Preview
            </h2>
            {result ? (
              <>
                <p class="card-subtitle">
                  {result.rows.length} of {table.rows.length} rows read
                  {result.skipped.length > 0 ? `, ${result.skipped.length} skipped` : ''}. Showing
                  the first {Math.min(6, result.rows.length)}.
                </p>
                <div class="table-scroll">
                  <table class="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Date</th>
                        <th scope="col">Narration</th>
                        <th scope="col" class="num">
                          Money out
                        </th>
                        <th scope="col" class="num">
                          Money in
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.rows.slice(0, 6).map((row) => (
                        <tr key={row.rowNumber}>
                          <td class="nowrap">{formatDate(row.date)}</td>
                          <td class="narration-cell">{row.narration}</td>
                          <td class="num">
                            {row.direction === 'debit' ? formatInr(row.amountPaise) : ''}
                          </td>
                          <td class="num">
                            {row.direction === 'credit' ? formatInr(row.amountPaise) : ''}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.rows.length === 0 ? (
                  <p class="form-error">
                    No row could be read with this mapping. Check the date column, the date format
                    and the amount columns.
                  </p>
                ) : null}
                {result.skipped.length > 0 ? (
                  <details class="details">
                    <summary>
                      {plural(result.skipped.length, 'row')} will be skipped. See which and why
                    </summary>
                    <ul class="skipped-list">
                      {result.skipped.slice(0, 50).map((row) => (
                        <li key={row.rowNumber}>
                          <strong>Row {row.rowNumber}:</strong> {SKIP_REASON_TEXT[row.reason]}
                          <span class="skipped-preview">{row.preview}</span>
                        </li>
                      ))}
                    </ul>
                    {result.skipped.length > 50 ? (
                      <p class="field-hint">Showing the first 50.</p>
                    ) : null}
                  </details>
                ) : null}
              </>
            ) : (
              <p class="empty-note">Choose the required columns to see a preview.</p>
            )}
          </section>

          <section class="card" aria-labelledby="left-title">
            <h2 class="card-title" id="left-title">
              Columns that will not be imported
            </h2>
            {leftBehind.length === 0 ? (
              <p class="empty-note">Every column in this file is mapped.</p>
            ) : (
              <ul class="left-list">
                {leftBehind.map(({ name, column }) => {
                  const flag = flagged.find((entry) => entry.column === column);
                  return (
                    <li key={column} class={flag ? 'left-item left-item-flagged' : 'left-item'}>
                      <span class="left-name">{name}</span>
                      {flag ? (
                        <span class="left-reason">
                          Looks sensitive. {flag.reason}{' '}
                          <button
                            type="button"
                            class="link-button"
                            onClick={() => dispatch({ type: 'unflag-column', column })}
                          >
                            It is not sensitive, let me map it
                          </button>
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
            <p class="field-hint">
              Only the columns you map above are read. The rest of the file is discarded when you
              import and is never stored.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
