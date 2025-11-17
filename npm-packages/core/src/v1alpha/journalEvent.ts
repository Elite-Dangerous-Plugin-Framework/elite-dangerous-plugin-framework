/**
 * EDPF sends Journal Items as stringified JSON.
 * EDPF does a bit of buffering to reduce the amount of internal events being sent.
 *
 * Events are guaranteed to be sorted as they are found in the journal.
 */
export interface JournalEventBatchV1Alpha {
  cmdr: string;
  file: string;
  events: string[];
}
