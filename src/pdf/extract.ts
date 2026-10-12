/**
 * Text extraction from a PDF, with pdf.js.
 *
 * This module, and pdf.js with it, is loaded only when the user picks a PDF.
 *
 * pdf.js normally does its parsing in a web worker. Here it runs on the main
 * thread instead, on purpose: a worker loaded from a file does not inherit the
 * page's Content-Security-Policy, so it would be outside `connect-src 'none'`.
 * Importing the worker module directly makes pdf.js use it in-page, where the
 * policy applies. The price is that the page can pause while a large PDF is read.
 */
import { getDocument, PasswordResponses, type PDFDocumentProxy } from 'pdfjs-dist';
import * as pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs';

import { pdfItemsToRows, type PdfTextItem } from '../core/import/pdf-rows';

// pdf.js looks for this global and, finding it, never starts a worker.
(globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = pdfWorker;

const MAX_PAGES = 200;

export type PdfResult = { ok: true; rows: string[][] } | { ok: false; error: string };

export async function extractPdfRows(data: ArrayBuffer): Promise<PdfResult> {
  const loading = getDocument({
    data: new Uint8Array(data),
    // Everything that could make pdf.js fetch something is off.
    // Text extraction needs none of it.
    useWorkerFetch: false,
    useWasm: false,
    useSystemFonts: false,
    disableFontFace: true,
    disableAutoFetch: true,
    disableStream: true,
    disableRange: true,
    stopAtErrors: false,
  });
  let pdf: PDFDocumentProxy;
  try {
    pdf = await loading.promise;
  } catch (error) {
    const name = (error as { name?: string } | null)?.name;
    const code = (error as { code?: number } | null)?.code;
    if (name === 'PasswordException' || code === PasswordResponses.NEED_PASSWORD) {
      return {
        ok: false,
        error:
          'This PDF is password-protected. This app does not ask for statement passwords, because they are often built from personal details. Export a CSV from your bank instead.',
      };
    }
    return { ok: false, error: 'This file could not be read as a PDF.' };
  }

  try {
    if (pdf.numPages > MAX_PAGES) {
      return { ok: false, error: `This PDF has ${pdf.numPages} pages. The limit is ${MAX_PAGES}.` };
    }
    const items: PdfTextItem[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const height = page.getViewport({ scale: 1 }).height;
      const content = await page.getTextContent();
      for (const entry of content.items) {
        if (!('str' in entry) || entry.str.trim() === '') continue;
        items.push({
          text: entry.str,
          x: entry.transform[4] as number,
          // PDF coordinates start at the bottom of the page; rows are easier to read top-down.
          y: height - (entry.transform[5] as number),
          width: entry.width,
          page: pageNumber,
        });
      }
      page.cleanup();
    }
    if (items.length === 0) {
      return {
        ok: false,
        error:
          'No text was found in this PDF. It is probably a scan (pictures of pages), which this app cannot read.',
      };
    }
    const rows = pdfItemsToRows(items);
    if (rows.length < 2) {
      return { ok: false, error: 'No table could be found in this PDF.' };
    }
    return { ok: true, rows };
  } catch {
    return { ok: false, error: 'This PDF could not be read.' };
  } finally {
    void loading.destroy();
  }
}
