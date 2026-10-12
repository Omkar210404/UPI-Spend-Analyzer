/** Building blocks shared by the narration patterns. */

/** A UPI handle: `local-part@provider`. */
export const VPA_SOURCE = '[a-z0-9][a-z0-9._-]*@[a-z][a-z0-9]+';
export const VPA_ANYWHERE = new RegExp(VPA_SOURCE, 'i');

/** A UPI reference (RRN) is twelve digits. */
export const UPI_REF_SOURCE = '\\d{12}';

/** Collapses whitespace and trims separators left over at either end. */
export function tidy(text: string | undefined): string | undefined {
  if (text === undefined) return undefined;
  const cleaned = text
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-/.,:*#]+|[\s\-/.,:*#]+$/g, '')
    .trim();
  return cleaned === '' ? undefined : cleaned;
}

/** A name must contain at least one letter; a bare number is not a payee. */
export function tidyName(text: string | undefined): string | undefined {
  const cleaned = tidy(text);
  return cleaned !== undefined && /[A-Za-z]/.test(cleaned) ? cleaned : undefined;
}

export function tidyVpa(text: string | undefined): string | undefined {
  const cleaned = text?.trim().toLowerCase();
  return cleaned !== undefined && VPA_ANYWHERE.test(cleaned) ? cleaned : undefined;
}

/**
 * A readable name from a UPI handle, for narrations that carry no name:
 * `fresh.basket@bank` becomes `fresh basket`. A handle whose local part is
 * only digits (usually a phone number) gives no name at all.
 */
export function nameFromVpa(vpa: string | undefined): string | undefined {
  if (vpa === undefined) return undefined;
  const local = vpa.split('@')[0] ?? '';
  const words = local.replace(/[._-]+/g, ' ').replace(/\d+/g, ' ');
  return tidyName(words);
}

/** Removes masked card fragments and other long runs of digits or mask characters. */
export function dropNumberRuns(text: string): string {
  return text.replace(/[\dXx*]{6,}/g, ' ').replace(/\b\d{1,2}[/-]\d{1,2}([/-]\d{2,4})?\b/g, ' ');
}

/** Removes keys whose value is undefined, so results compare cleanly. */
export function compact<T extends object>(value: T): T {
  const entries = Object.entries(value).filter(([, v]) => v !== undefined);
  return Object.fromEntries(entries) as T;
}
