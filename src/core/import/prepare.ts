import { suggestMapping, type MappingSuggestion } from './mapping';
import { detectSensitiveColumns, type SensitiveColumn } from './sensitive';
import { buildTable, detectHeaderRow, type RawTable } from './table';

/** Everything the mapping screen needs to know about a freshly read file. */
export interface PreparedImport {
  /** How many rows the file had in all, before the table was cut out of it. */
  fileRowCount: number;
  table: RawTable;
  sensitive: SensitiveColumn[];
  suggestion: MappingSuggestion;
}

/**
 * Finds the table in the file's rows, flags sensitive columns and proposes a
 * mapping. `headerRowIndex` overrides the detected header row when the user
 * corrects it.
 */
export function prepareImport(
  fileRows: readonly (readonly string[])[],
  headerRowIndex: number = detectHeaderRow(fileRows),
): PreparedImport {
  const table = buildTable(fileRows, headerRowIndex);
  const sensitive = detectSensitiveColumns(table);
  return {
    fileRowCount: fileRows.length,
    table,
    sensitive,
    suggestion: suggestMapping(table, sensitive),
  };
}
