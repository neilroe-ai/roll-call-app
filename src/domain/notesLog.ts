/**
 * A Student's Notes Log: every Note about them, in date order.
 *
 * One module decides what a line says and when a line is added, because the
 * answers have to agree. A Note the teacher types during a roll call, a Note
 * she writes from the Notes screen and the reason she gives for a Behavior
 * Point all end up in the same cell, and a log that formatted them three ways
 * would read as three different things having happened.
 *
 * Notes are only ever added. Nothing here rewrites or removes a line: the log
 * is the one thing on the Summary tab the app reads back before rewriting the
 * tab, because a Note exists nowhere else.
 */
import type { CalendarDate } from './behavior';
import { signOf } from './behavior';
import type { BehaviorKind } from './points';

export type NotesLog = readonly string[];

/**
 * The line a Note makes, or nothing at all.
 *
 * Blank is not a Note. The teacher can open the field, think better of it and
 * walk away, and every path into the log goes through here so that decision is
 * made once rather than at each call site.
 */
export function noteLine(date: CalendarDate, note: string | undefined): string | undefined {
  const written = note?.trim() ?? '';
  return written === '' ? undefined : `${date}: ${written}`;
}

/**
 * What a Behavior Point writes in the log, before it is dated — or nothing.
 *
 * A point with no reason given earns no line: the bare fact of it is already in
 * the Behavior tab, and a log full of unexplained `+1`s tells the teacher
 * nothing the Score does not. The sign goes first, so a log read down the cell
 * shows what the Note was explaining.
 */
export function behaviorText(kind: BehaviorKind, note: string | undefined): string | undefined {
  if (note === undefined || note.trim() === '') return undefined;
  return `${signOf(kind)} ${note.trim()}`;
}

/** The log with one more line at the bottom, or the log exactly as it was when
    there is no line to add. */
export function addLine(log: NotesLog, line: string | undefined): NotesLog {
  return line === undefined ? log : [...log, line];
}
