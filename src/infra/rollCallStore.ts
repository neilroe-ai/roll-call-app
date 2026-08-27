/**
 * Where a roll call in progress waits out a reload.
 *
 * The Sheet is no use for this: a roll call is not committed until the teacher
 * taps Save, and half a roll call must never reach the Points Ledger. So it is
 * kept on the device instead, and read back when the app starts.
 *
 * Storage is a courtesy, never a gate. A browser with storage turned off, a
 * full quota, or a half-written value from a crash must all leave the teacher
 * able to take roll — so every failure here is swallowed and reads the same as
 * having nothing kept.
 */
import type { SavedRollCall } from '../domain/rollCall';

/** The port: what the app needs of the device between one load and the next. */
export interface RollCallStore {
  keep(rollCall: SavedRollCall): void;
  /** What was kept, or `undefined` if there is nothing readable. */
  kept(): SavedRollCall | undefined;
  forget(): void;
}

/** The slice of `localStorage` this uses, so a test needs no browser. */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = 'rollCall.inProgress';

/** Keeps the roll call in `localStorage`, or nowhere at all if the browser has
    none — an app running without storage simply starts each load fresh. */
export function browserRollCallStore(
  storage: KeyValueStore | undefined = globalThis.localStorage,
): RollCallStore {
  if (!storage) return noRollCallStore;

  return {
    keep(rollCall) {
      try {
        storage.setItem(KEY, JSON.stringify(rollCall));
      } catch {
        // A full or blocked quota costs the reload safety net, nothing more.
      }
    },
    kept() {
      try {
        const written = storage.getItem(KEY);
        return written === null ? undefined : (JSON.parse(written) as SavedRollCall);
      } catch {
        // Unreadable is the same as nothing kept.
        return undefined;
      }
    },
    forget() {
      try {
        storage.removeItem(KEY);
      } catch {
        // Nothing to do: the next keep or start overwrites it.
      }
    },
  };
}

/** Keeps nothing. What a browser with no storage gets, and what a test uses
    when the reload path is not what it is about. */
export const noRollCallStore: RollCallStore = {
  keep: () => undefined,
  kept: () => undefined,
  forget: () => undefined,
};
