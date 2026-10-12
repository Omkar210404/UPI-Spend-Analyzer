/**
 * Builds a small, valid, text-based PDF in memory for the PDF import test, so
 * no PDF file needs to live in the repository. One page, one font, each cell
 * of each row drawn at a fixed x position.
 */

const COLUMN_X = [36, 92, 400, 460, 520];

function escapeText(text: string): string {
  return text.replace(/[\\()]/g, (character) => `\\${character}`);
}

export function makeStatementPdf(rows: readonly (readonly string[])[]): Uint8Array {
  const drawing: string[] = [];
  rows.forEach((row, rowIndex) => {
    const y = 780 - rowIndex * 18;
    row.forEach((cell, column) => {
      if (cell === '') return;
      drawing.push(`BT /F1 7 Tf ${COLUMN_X[column] ?? 40} ${y} Td (${escapeText(cell)}) Tj ET`);
    });
  });
  const stream = drawing.join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  // Every character used is ASCII, so one byte per character.
  return Uint8Array.from(pdf, (character) => character.charCodeAt(0));
}
