export type Verdict = 'apply' | 'duplicate' | 'gap' | 'reset'

export interface Sequencer {
  readonly cursor: number
  accept(event: { id: number }): Verdict
}

/**
 * Decides what to do with each incoming event id. Ids go up by exactly one across the
 * whole stream, so anything else is a duplicate (replay overlap), a gap, or a server reset.
 *
 * The mock replays from `since - replayOverlap` (exclusive), so after a resume the ids
 * `cursor - 2 .. cursor` are expected duplicates. Anything older can only mean the server
 * restarted and its ids began again from 1.
 */
export const REPLAY_OVERLAP = 3

export function createSequencer(initialCursor: number, replayOverlap = REPLAY_OVERLAP): Sequencer {
  let cursor = initialCursor

  return {
    get cursor() {
      return cursor
    },
    accept({ id }) {
      if (id === cursor + 1) {
        cursor = id
        return 'apply'
      }
      if (id > cursor) return 'gap'
      if (id > cursor - replayOverlap) return 'duplicate'
      return 'reset'
    },
  }
}
