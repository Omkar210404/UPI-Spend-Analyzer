/** The seed the committed sample statement is generated from. */
export const SEED: number;

/** The synthetic sample statement as CSV text. The same seed always gives the same text. */
export function generateSample(seed?: number): string;
