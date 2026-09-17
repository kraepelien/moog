import type { Database } from 'bun:sqlite'
import {
  readChannels,
  readParts,
  toBase64,
  type Arrangement,
  type ArrangementSummary,
} from '@components/midi/arrangement.ts'

/* Rows for a MIDI file and the sounds put on its parts. The file is a blob
   because it is bytes and nothing here reads inside it; everything the list
   needs is a column beside it, so listing never loads a file. */

interface Row {
  uid: string
  name: string
  file_name: string
  midi: Uint8Array
  bpm: string
  parts: string
  soloed: string
  muted: string
  updated_at: string
}

interface SummaryRow {
  uid: string
  name: string
  file_name: string
  bpm: string
  parts: string
  updated_at: string
}

const parsed = (json: string): unknown => {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

function toArrangement(row: Row): Arrangement {
  return {
    id: row.uid,
    name: row.name,
    fileName: row.file_name,
    midi: toBase64(row.midi),
    bpm: row.bpm,
    parts: readParts(parsed(row.parts)),
    soloed: readChannels(parsed(row.soloed)),
    muted: readChannels(parsed(row.muted)),
    updatedAt: row.updated_at,
  }
}

export interface ArrangementWrite {
  readonly name: string
  readonly fileName: string
  readonly midi: Uint8Array
  readonly bpm: string
  readonly parts: unknown
  readonly soloed: readonly number[]
  readonly muted: readonly number[]
}

export function createArrangements(db: Database) {
  const repository = {
    listOwnedBy(owner: number): ArrangementSummary[] {
      return db
        .query<SummaryRow, [number]>(
          `select uid, name, file_name, bpm, parts, updated_at
             from arrangements where owner_id = ? order by updated_at desc`,
        )
        .all(owner)
        .map((row) => ({
          id: row.uid,
          name: row.name,
          fileName: row.file_name,
          bpm: row.bpm,
          parts: Object.keys(readParts(parsed(row.parts))).length,
          updatedAt: row.updated_at,
        }))
    },

    /* Scoped to the owner in the query rather than fetched and then checked:
       one of these belongs to exactly one person, so there is no reading of
       somebody else's to refuse afterwards. */
    get(uid: string, owner: number): Arrangement | null {
      const row = db
        .query<Row, [string, number]>(
          `select uid, name, file_name, midi, bpm, parts, soloed, muted, updated_at
             from arrangements where uid = ? and owner_id = ?`,
        )
        .get(uid, owner)
      return row ? toArrangement(row) : null
    },

    create(uid: string, owner: number, write: ArrangementWrite, at: string): Arrangement {
      db.run(
        `insert into arrangements (uid, owner_id, name, file_name, midi, bpm, parts,
                                   soloed, muted, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uid,
          owner,
          write.name,
          write.fileName,
          write.midi,
          write.bpm,
          JSON.stringify(write.parts),
          JSON.stringify(write.soloed),
          JSON.stringify(write.muted),
          at,
          at,
        ],
      )
      return repository.get(uid, owner)!
    },

    replace(uid: string, owner: number, write: ArrangementWrite, at: string): Arrangement | null {
      const changed = db.run(
        `update arrangements
            set name = ?, file_name = ?, midi = ?, bpm = ?, parts = ?, soloed = ?,
                muted = ?, updated_at = ?
          where uid = ? and owner_id = ?`,
        [
          write.name,
          write.fileName,
          write.midi,
          write.bpm,
          JSON.stringify(write.parts),
          JSON.stringify(write.soloed),
          JSON.stringify(write.muted),
          at,
          uid,
          owner,
        ],
      ).changes
      return changed > 0 ? repository.get(uid, owner) : null
    },

    delete(uid: string, owner: number): boolean {
      return db.run(`delete from arrangements where uid = ? and owner_id = ?`, [uid, owner])
        .changes > 0
    },

    countOwnedBy(owner: number): number {
      return (
        db
          .query<{ n: number }, [number]>(
            `select count(*) as n from arrangements where owner_id = ?`,
          )
          .get(owner)?.n ?? 0
      )
    },
  }

  return repository
}

export type Arrangements = ReturnType<typeof createArrangements>
