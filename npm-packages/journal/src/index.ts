import type { JournalEvent, JournalEvent_BI } from "./generated/index.js";

/**
 * Use this converter if you do not care about precision of numbers - primarily if you do not need to handle IDs (e.g. System Adresses).
 *
 * It will treat **any** number as a IEEE 754 64 bit Float. This way integers are precise up to 15 digits, which is not enough for IDs. In these cases,
 * use {@link parseWithBigInt} if large Integers matter.
 */
export function parseWithLossyIntegers(event: string): JournalEvent {
  return JSON.parse(event);
}

/**
 * Converts a Journal Entry to a Journal Event with *all* Integers replaced with BigInts.
 * An Item is considered an integer if it consists of at least one numerical (0..9), which can be prefixed by a `-`.
 * Trailing `.` or `.0` cause the item to be treated as a regular IEEE 754 64 bit Float.
 *
 * Use this if you need to work with System Addresses. Working with BigInt's is a bit more annoying as you cannot directly use some std library functions.
 */
export function parseWithBigInt(event: string): JournalEvent_BI {
  return JSON.parse(event, ((k: any, v: any, { source }: any) => {
    const isInteger = /^-?\d+$/.test(source ?? "");
    return isInteger ? BigInt(source) : v;
  }) as any);
}

export { type JournalEvent, type JournalEvent_BI };
