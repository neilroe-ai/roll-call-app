/**
 * The device store. What matters is that a browser with no usable storage
 * behaves like a browser with nothing kept, rather than stopping the teacher.
 */
import { describe, expect, it } from 'vitest';
import { browserRollCallStore, noRollCallStore, type KeyValueStore } from './rollCallStore';
import type { SavedRollCall } from '../domain/rollCall';

const ROLL_CALL: SavedRollCall = {
  session: { id: 'sess1', groupId: 'g1', takenAt: '2026-08-26T09:05:00+08:00' },
  marks: [['s1', 'present']],
  notes: [['s2', 'left early']],
};

/** A browser's storage, in a Map. */
class Memory implements KeyValueStore {
  private readonly cells = new Map<string, string>();
  getItem(key: string): string | null {
    return this.cells.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.cells.set(key, value);
  }
  removeItem(key: string): void {
    this.cells.delete(key);
  }
}

/** Storage the browser refuses: a private window, or a full quota. */
class Refuses implements KeyValueStore {
  getItem(): string {
    throw new Error('access denied');
  }
  setItem(): void {
    throw new Error('quota exceeded');
  }
  removeItem(): void {
    throw new Error('access denied');
  }
}

describe('browserRollCallStore', () => {
  it('gives back what was kept', () => {
    const store = browserRollCallStore(new Memory());
    store.keep(ROLL_CALL);

    expect(store.kept()).toEqual(ROLL_CALL);
  });

  it('has nothing before anything is kept, and nothing once forgotten', () => {
    const store = browserRollCallStore(new Memory());
    expect(store.kept()).toBeUndefined();

    store.keep(ROLL_CALL);
    store.forget();
    expect(store.kept()).toBeUndefined();
  });

  it('reads a half-written value as nothing kept', () => {
    const storage = new Memory();
    const store = browserRollCallStore(storage);
    store.keep(ROLL_CALL);
    storage.setItem('rollCall.inProgress', '{"session":');

    expect(store.kept()).toBeUndefined();
  });

  it('swallows a browser that refuses storage', () => {
    const store = browserRollCallStore(new Refuses());

    expect(() => {
      store.keep(ROLL_CALL);
    }).not.toThrow();
    expect(store.kept()).toBeUndefined();
    expect(() => {
      store.forget();
    }).not.toThrow();
  });

  it('keeps nothing at all when the browser has no storage', () => {
    const store = browserRollCallStore(undefined);
    store.keep(ROLL_CALL);

    expect(store.kept()).toBeUndefined();
  });
});

describe('noRollCallStore', () => {
  it('forgets everything at once', () => {
    noRollCallStore.keep(ROLL_CALL);

    expect(noRollCallStore.kept()).toBeUndefined();
  });
});
