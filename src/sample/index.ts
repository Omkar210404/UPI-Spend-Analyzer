// The synthetic statement written by scripts/generate-sample.mjs. It is bundled
// into the app, so loading the sample makes no network request.
import csv from './sample-statement.csv?raw';

export const SAMPLE_CSV: string = csv;
export const SAMPLE_FILE_NAME = 'sample-statement.csv';
