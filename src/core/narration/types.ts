import type { ParsedNarration } from '../types';

/** What a pattern returns: everything in ParsedNarration except its own id, which the registry adds. */
export type PatternResult = Omit<ParsedNarration, 'patternId'>;

export interface NarrationExample {
  /** A synthetic narration in this style. */
  input: string;
  /** The fields the pattern must read out of it. */
  expect: PatternResult;
}

/**
 * One narration style.
 *
 * A pattern is a small object: a name, the layout it understands, examples,
 * and a `parse` function that returns null when the narration is not in its
 * style. The examples are used three ways: as the pattern's unit tests, as a
 * check that no earlier pattern in the registry claims them first, and as the
 * "supported styles" list shown in the app.
 */
export interface NarrationPattern {
  id: string;
  /** Short name shown in the app, such as "Style A: UPI, hyphen separated". */
  label: string;
  /** The layout in words, with field names in place of values. */
  layout: string;
  examples: readonly NarrationExample[];
  parse(narration: string): PatternResult | null;
}
