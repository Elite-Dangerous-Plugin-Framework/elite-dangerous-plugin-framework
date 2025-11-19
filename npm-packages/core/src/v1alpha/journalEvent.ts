/**
 * EDPF sends Journal Items as stringified JSON.
 * EDPF does a bit of buffering to reduce the amount of internal events being sent.
 * 
 * As of 2025-11, this buffering is based on two timers: 
 * - a soft-resettable 0.1s (if a new event drops in, the timer resets)
 * - a hard cap at 0.5s
 *
 * Events are guaranteed to be sorted as they are found in the journal.
 */
export interface JournalEventItemV1Alpha {
  cmdr: string;
  file: string;
  event: string;
}
