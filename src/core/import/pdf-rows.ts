import { headerKind } from './table';

/**
 * Rebuilds table rows from the text of a PDF page.
 *
 * A PDF has no rows or columns, only pieces of text at positions. This turns
 * those pieces back into rows of cells:
 *
 *  1. pieces at about the same height form a line;
 *  2. pieces that nearly touch are joined into one cell;
 *  3. the first line that reads like column headings fixes the columns, and
 *     every later cell goes to the heading it overlaps or sits nearest to.
 *
 * It is a heuristic. Statements with unusual layouts will come out wrong,
 * which is why PDF import is labelled experimental and the mapping screen
 * shows a preview before anything is imported.
 */

export interface PdfTextItem {
  text: string;
  /** Left edge. */
  x: number;
  /** Distance from the top of the page. */
  y: number;
  width: number;
  /** Page number, starting at 1. */
  page: number;
}

interface Cell {
  text: string;
  left: number;
  right: number;
}

const LINE_TOLERANCE = 3;
const JOIN_GAP = 4.5;

function toLines(items: readonly PdfTextItem[]): Cell[][] {
  const sorted = items
    .filter((item) => item.text.trim() !== '')
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);

  const lines: { page: number; y: number; items: PdfTextItem[] }[] = [];
  for (const item of sorted) {
    const line = lines[lines.length - 1];
    if (line && line.page === item.page && Math.abs(item.y - line.y) <= LINE_TOLERANCE) {
      line.items.push(item);
    } else {
      lines.push({ page: item.page, y: item.y, items: [item] });
    }
  }

  return lines.map((line) => {
    const cells: Cell[] = [];
    for (const item of line.items.sort((a, b) => a.x - b.x)) {
      const last = cells[cells.length - 1];
      const gap = last ? item.x - last.right : Infinity;
      if (last && gap <= JOIN_GAP) {
        last.text += (gap > 1.5 ? ' ' : '') + item.text.trim();
        last.right = Math.max(last.right, item.x + item.width);
      } else {
        cells.push({ text: item.text.trim(), left: item.x, right: item.x + item.width });
      }
    }
    return cells;
  });
}

function isHeaderLine(cells: readonly Cell[]): boolean {
  const kinds = new Set(cells.map((cell) => headerKind(cell.text)).filter((kind) => kind !== null));
  return kinds.has('date') && kinds.size >= 3;
}

/** How far apart two horizontal spans are; 0 or less when they overlap. */
function distance(a: Cell, b: Cell): number {
  return Math.max(a.left, b.left) - Math.min(a.right, b.right);
}

/** Rows of cells for every line of text, aligned to the header's columns from the header down. */
export function pdfItemsToRows(items: readonly PdfTextItem[]): string[][] {
  const lines = toLines(items);
  const headerIndex = lines.findIndex(isHeaderLine);
  if (headerIndex === -1) return lines.map((cells) => cells.map((cell) => cell.text));

  const columns = lines[headerIndex]!;
  const headerText = columns.map((cell) => cell.text).join('|');
  const rows: string[][] = lines
    .slice(0, headerIndex)
    .map((cells) => cells.map((cell) => cell.text));
  rows.push(columns.map((cell) => cell.text));

  for (const cells of lines.slice(headerIndex + 1)) {
    // The headings are printed again at the top of each page.
    if (cells.map((cell) => cell.text).join('|') === headerText) continue;
    const row = columns.map(() => '');
    for (const cell of cells) {
      let best = 0;
      for (let column = 1; column < columns.length; column += 1) {
        if (distance(cell, columns[column]!) < distance(cell, columns[best]!)) best = column;
      }
      row[best] = row[best] === '' ? cell.text : `${row[best]} ${cell.text}`;
    }
    rows.push(row);
  }
  return rows;
}
