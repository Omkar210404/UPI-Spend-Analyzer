/** Browser-side file handling. Everything here stays on the device. */

const MAX_TEXT_BYTES = 15 * 1024 * 1024;
const MAX_PDF_BYTES = 25 * 1024 * 1024;

export type FileKind = 'csv' | 'pdf';

export function kindOf(file: File): FileKind | null {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return 'pdf';
  if (/\.(csv|tsv|txt)$/.test(name) || file.type.startsWith('text/')) return 'csv';
  return null;
}

export function sizeProblem(file: File, kind: FileKind): string | null {
  const limit = kind === 'pdf' ? MAX_PDF_BYTES : MAX_TEXT_BYTES;
  if (file.size === 0) return 'This file is empty.';
  if (file.size > limit) {
    return `This file is ${Math.round(file.size / 1024 / 1024)} MB. The limit is ${limit / 1024 / 1024} MB.`;
  }
  return null;
}

/** Hands the user a file made in the browser. No request is sent anywhere. */
export function downloadText(fileName: string, text: string, mimeType: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before the URL is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** `statement.csv` -> `statement`. */
export function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '');
}
