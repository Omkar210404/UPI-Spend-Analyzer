import Papa from 'papaparse';

/**
 * Turns CSV text into rows of trimmed cells.
 *
 * Papa Parse runs here on the calling thread (no worker), works out the
 * delimiter itself (comma, tab, semicolon or pipe) and copes with quoted
 * cells that contain commas or line breaks. Blank lines are dropped.
 */
export function parseCsvText(text: string): string[][] {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const result = Papa.parse<string[]>(withoutBom, {
    header: false,
    skipEmptyLines: 'greedy',
    dynamicTyping: false,
  });
  return result.data.map((row) =>
    row.map((cell) => (typeof cell === 'string' ? cell.replace(/\s+/g, ' ').trim() : '')),
  );
}
