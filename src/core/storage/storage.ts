/**
 * A wrapper around the browser's localStorage that cannot throw.
 *
 * Storage can be missing, blocked (private windows, strict settings) or full.
 * Every read and write is wrapped; when the real storage fails, values are
 * kept in memory for the rest of the visit and `persistent` says so, so the
 * app can tell the user their settings will not survive a reload.
 *
 * The storage object is passed in, so this file never touches `window` and
 * the tests can hand it a fake.
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const STORAGE_PREFIX = 'upi-spend-analyzer:v1:';

/** Every key the app may write. Nothing else is ever stored. */
export const STORAGE_KEYS = ['rules', 'overrides', 'profiles', 'theme'] as const;
export type StorageKey = (typeof STORAGE_KEYS)[number];

export interface SafeStore {
  /** False when values are only being held in memory. */
  readonly persistent: boolean;
  /** Reads a value and checks it with `parse`. Returns null when absent or not valid. */
  read<T>(key: StorageKey, parse: (value: unknown) => T | null): T | null;
  /** Writes a value. Returns false when it could only be kept in memory. */
  write(key: StorageKey, value: unknown): boolean;
  remove(key: StorageKey): void;
  /** Removes everything the app has stored. */
  clear(): void;
}

export function createStore(storage: StorageLike | null): SafeStore {
  const memory = new Map<string, string>();
  let persistent = storage !== null;

  if (storage) {
    try {
      const probe = `${STORAGE_PREFIX}probe`;
      storage.setItem(probe, '1');
      storage.removeItem(probe);
    } catch {
      persistent = false;
    }
  }

  return {
    get persistent() {
      return persistent;
    },

    read<T>(key: StorageKey, parse: (value: unknown) => T | null): T | null {
      const fullKey = STORAGE_PREFIX + key;
      let text: string | null = memory.get(fullKey) ?? null;
      if (text === null && storage) {
        try {
          text = storage.getItem(fullKey);
        } catch {
          persistent = false;
        }
      }
      if (text === null) return null;
      try {
        return parse(JSON.parse(text));
      } catch {
        return null;
      }
    },

    write(key: StorageKey, value: unknown): boolean {
      const fullKey = STORAGE_PREFIX + key;
      const text = JSON.stringify(value);
      if (storage && persistent) {
        try {
          storage.setItem(fullKey, text);
          memory.delete(fullKey);
          return true;
        } catch {
          persistent = false;
        }
      }
      memory.set(fullKey, text);
      return false;
    },

    remove(key: StorageKey): void {
      const fullKey = STORAGE_PREFIX + key;
      memory.delete(fullKey);
      try {
        storage?.removeItem(fullKey);
      } catch {
        // Nothing to do: the in-memory copy is already gone.
      }
    },

    clear(): void {
      for (const key of STORAGE_KEYS) this.remove(key);
    },
  };
}
