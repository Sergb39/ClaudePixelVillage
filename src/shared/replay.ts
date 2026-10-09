import { emptySnapshot, reduceEvent } from './reducer';
import type { JournalEvent, Snapshot } from './types';

/** Reconstruct only the retained, sanitized journal. Older history may be unavailable. */
export function replayJournal(events: JournalEvent[], through: number): Snapshot {
  let state = emptySnapshot();
  for (const event of events.slice(0, Math.max(0, through + 1))) state = reduceEvent(state, event, event.receivedAt);
  return state;
}
