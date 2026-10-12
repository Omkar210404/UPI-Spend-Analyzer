import { parseCsvText } from '../core/import/csv';
import { applyMapping, validateMapping, type ColumnMapping } from '../core/import/mapping';
import { toTxns } from '../core/import/normalise';
import { prepareImport } from '../core/import/prepare';
import { SAMPLE_CSV, SAMPLE_FILE_NAME } from '../sample';
import { kindOf, sizeProblem } from './files';
import type { ImportSource, PendingImport, Statement } from './state';

export type ReadResult =
  { ok: true; source: ImportSource; fileRows: string[][] } | { ok: false; error: string };

/** Reads a chosen file into rows of cells, on this device. */
export async function readStatementFile(file: File): Promise<ReadResult> {
  const kind = kindOf(file);
  if (!kind) {
    return { ok: false, error: 'Choose a CSV file, or a PDF that contains selectable text.' };
  }
  const problem = sizeProblem(file, kind);
  if (problem) return { ok: false, error: problem };

  try {
    if (kind === 'pdf') {
      // pdf.js is large, so its code is only fetched (from this same site) when a PDF is chosen.
      const { extractPdfRows } = await import('../pdf/extract');
      const result = await extractPdfRows(await file.arrayBuffer());
      if (!result.ok) return result;
      return { ok: true, source: 'pdf', fileRows: result.rows };
    }
    const fileRows = parseCsvText(await file.text());
    if (fileRows.length < 2) {
      return { ok: false, error: 'No rows were found in this file. Is it a CSV export?' };
    }
    return { ok: true, source: 'csv', fileRows };
  } catch {
    return { ok: false, error: 'This file could not be read.' };
  }
}

export function sampleRows(): string[][] {
  return parseCsvText(SAMPLE_CSV);
}

/** Turns a confirmed mapping into the statement the workspace shows. */
export function buildStatement(
  pending: Pick<PendingImport, 'fileName' | 'source' | 'prepared'>,
  mapping: ColumnMapping,
): Statement {
  const { table } = pending.prepared;
  const result = applyMapping(table, mapping, { mergeContinuations: pending.source === 'pdf' });
  const used = new Set(
    [
      mapping.date,
      mapping.narration,
      mapping.debit,
      mapping.credit,
      mapping.amount,
      mapping.marker,
      mapping.balance,
      mapping.reference,
    ].filter((column) => column !== null),
  );
  return {
    fileName: pending.fileName,
    source: pending.source,
    txns: toTxns(result.rows),
    skipped: result.skipped,
    droppedColumns: table.header.filter((_, column) => !used.has(column)),
  };
}

/** The sample statement, imported with the mapping the app suggests for it. */
export function sampleStatement(): Statement {
  const prepared = prepareImport(sampleRows());
  const validation = validateMapping(prepared.suggestion.draft, prepared.table);
  if (!validation.ok) throw new Error('The bundled sample could not be mapped.');
  return buildStatement(
    { fileName: SAMPLE_FILE_NAME, source: 'sample', prepared },
    validation.mapping,
  );
}
