/**
 * One way to drive the screens in a test: an `App` on a `FakeSheet`, rendered
 * into a fresh jsdom root, plus the few readings a screen test makes.
 *
 * Every `ui` test needs the same three things wired together and the same
 * handful of queries over the result, so they live here once. A test says what
 * the Sheet holds and what the teacher taps; it never rebuilds the harness.
 *
 * Only for tests — nothing the app ships imports this.
 */
import { vi } from 'vitest';
import { App, type Clock } from './app';
import { FakeSheet, type FakeSheetSeed } from '../infra/fakeSheet';
import type { SheetGateway } from '../infra/sheetGateway';
import type { RollCallStore } from '../infra/rollCallStore';

/** Where the teacher is standing, unless a test says otherwise: one fixed
    morning, and a fresh id for every Session and Behavior Point. Ids only have
    to differ — two writes sharing one would read as a retry of the first. */
export function testClock(now = new Date(2026, 7, 26, 9, 5)): Clock {
  let issued = 0;
  return {
    now: () => now,
    newId: () => `id-${String(++issued)}`,
  };
}

export interface ScreenOptions {
  clock?: Clock;
  store?: RollCallStore;
  /** A gateway other than the seeded `FakeSheet` — for the failures and delays
      a `FakeSheet` will not produce. It is still read back through `sheet`. */
  gateway?: (sheet: FakeSheet) => SheetGateway;
}

/** The running app, as a test sees it: what is on screen, and what can be
    tapped. */
export class Screen {
  constructor(
    readonly root: HTMLElement,
    readonly sheet: FakeSheet,
  ) {}

  /** A button by its exact words. */
  button(label: string): HTMLButtonElement {
    const found = this.buttons().find((candidate) => candidate.textContent === label);
    if (!found)
      throw new Error(`No button labelled "${label}". Buttons: ${this.labels().join(', ')}`);
    return found;
  }

  /** A button whose words carry a count — "Held (2)", "Save roll call (1 not
      marked)" — matched by what it starts with. */
  starting(prefix: string): HTMLButtonElement {
    const found = this.buttons().find((candidate) => candidate.textContent?.startsWith(prefix));
    if (!found)
      throw new Error(`No button starting "${prefix}". Buttons: ${this.labels().join(', ')}`);
    return found;
  }

  /** A control by its `aria-label` — how the per-student buttons are told
      apart, since their words repeat down the list. */
  control(label: string): HTMLButtonElement {
    const found = this.root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
    if (!found) throw new Error(`No control labelled "${label}"`);
    return found;
  }

  /** The open text box, if one is. Only ever one at a time. */
  field(): HTMLTextAreaElement | null {
    return this.root.querySelector('textarea');
  }

  /** Type into the open text box. */
  type(text: string): void {
    const field = this.field();
    if (!field) throw new Error('No text box is open');
    field.value = text;
  }

  labels(): string[] {
    return this.buttons().map((candidate) => candidate.textContent ?? '');
  }

  /** The screen's title. */
  heading(): string | undefined {
    return this.root.querySelector('h1')?.textContent ?? undefined;
  }

  /** The student names down a list — every screen heads its rows with an
      `h2`. */
  names(): string[] {
    return [...this.root.querySelectorAll('h2')].map((node) => node.textContent ?? '');
  }

  /** The text of every match, in screen order. */
  all(selector: string): string[] {
    return [...this.root.querySelectorAll(selector)].map((node) => node.textContent ?? '');
  }

  /** The text of the first match, or `undefined` if there is none. */
  first(selector: string): string | undefined {
    return this.root.querySelector(selector)?.textContent ?? undefined;
  }

  text(): string {
    return this.root.textContent ?? '';
  }

  /** Wait for a write to land. Every save reads the Sheet back and redraws, so
      a test that taps Save has to wait for the redraw before reading either. */
  until(check: () => void | Promise<void>): Promise<void> {
    return vi.waitFor(check);
  }

  private buttons(): HTMLButtonElement[] {
    return [...this.root.querySelectorAll('button')];
  }
}

/** Start the app on a Sheet holding `seed`, and hand back the screen it drew. */
export async function openApp(
  seed: FakeSheetSeed = {},
  options: ScreenOptions = {},
): Promise<Screen> {
  const root = document.createElement('div');
  document.body.replaceChildren(root);
  const sheet = new FakeSheet(seed);
  const gateway = options.gateway ? options.gateway(sheet) : sheet;
  const app = new App(root, gateway, options.clock ?? testClock(), options.store);
  await app.start();
  return new Screen(root, sheet);
}
