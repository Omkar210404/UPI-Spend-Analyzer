import { describe, expect, it } from 'vitest';

import { createStore, STORAGE_KEYS, STORAGE_PREFIX, type StorageLike } from './storage';

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
    removeItem: (key) => void data.delete(key),
  };
}

const throwing: StorageLike = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
  removeItem() {
    throw new Error('blocked');
  },
};

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

describe('createStore', () => {
  it('writes under its own prefix and reads the value back', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    expect(store.persistent).toBe(true);
    expect(store.write('theme', 'dark')).toBe(true);
    expect(storage.data.get(`${STORAGE_PREFIX}theme`)).toBe('"dark"');
    expect(store.read('theme', asString)).toBe('dark');
  });

  it('returns null for a missing value, broken JSON or a value that fails its check', () => {
    const storage = fakeStorage();
    const store = createStore(storage);
    expect(store.read('theme', asString)).toBeNull();
    storage.data.set(`${STORAGE_PREFIX}theme`, '{not json');
    expect(store.read('theme', asString)).toBeNull();
    storage.data.set(`${STORAGE_PREFIX}theme`, '42');
    expect(store.read('theme', asString)).toBeNull();
  });

  it('keeps working in memory when storage throws, and says it is not persistent', () => {
    const store = createStore(throwing);
    expect(store.persistent).toBe(false);
    expect(store.write('theme', 'dark')).toBe(false);
    expect(store.read('theme', asString)).toBe('dark');
    expect(() => store.remove('theme')).not.toThrow();
    expect(store.read('theme', asString)).toBeNull();
    expect(() => store.clear()).not.toThrow();
  });

  it('keeps working in memory when there is no storage at all', () => {
    const store = createStore(null);
    expect(store.persistent).toBe(false);
    store.write('rules', [1, 2]);
    expect(store.read('rules', (value) => (Array.isArray(value) ? value : null))).toEqual([1, 2]);
  });

  it('falls back to memory when storage fills up part-way through', () => {
    const storage = fakeStorage();
    let full = false;
    const flaky: StorageLike = {
      ...storage,
      setItem(key, value) {
        if (full) throw new Error('QuotaExceededError');
        storage.setItem(key, value);
      },
    };
    const store = createStore(flaky);
    expect(store.write('theme', 'light')).toBe(true);
    full = true;
    expect(store.write('theme', 'dark')).toBe(false);
    expect(store.persistent).toBe(false);
    expect(store.read('theme', asString)).toBe('dark');
  });

  it('clears every key it owns and nothing else', () => {
    const storage = fakeStorage();
    storage.data.set('someone-elses-key', 'keep');
    const store = createStore(storage);
    for (const key of STORAGE_KEYS) store.write(key, 'x');
    expect(storage.data.size).toBe(STORAGE_KEYS.length + 1);
    store.clear();
    expect([...storage.data.keys()]).toEqual(['someone-elses-key']);
  });
});
