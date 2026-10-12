// pdf.js ships its worker as a module without type declarations. The app only
// hands the module to pdf.js, so its shape does not matter here.
declare module 'pdfjs-dist/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
