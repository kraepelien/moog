import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AuthConfig } from './identity.ts'

/* What each server says about itself as it comes up. The two modes look
   identical from outside — with no client id the app signs nobody in and hands
   everything to one local user — so the only way to tell a machine that is not
   configured from one whose configuration never arrived is to say so. */

export function describeAuth(config: AuthConfig): string {
  if (config.mode === 'off') {
    return 'off — everything belongs to the local user (MOOG_OAUTH_CLIENT_ID is unset)'
  }
  const admins = config.admins.length > 0 ? `, ${config.admins.length} admin(s)` : ''
  /* Where a sign-in comes back to, stated rather than warned about: it is right
     for a deployment to differ from the origin being served and wrong for a
     development machine, and only the person reading knows which this is.

     The loopback half is said out loud because the configured origin alone read
     as a warning that local sign-in was broken, when it is the case that
     works. */
  const back =
    config.publicOrigin === null
      ? 'the origin each request arrives on'
      : `${config.publicOrigin}, or to this machine when signed in from localhost`
  return `Google${admins} → returns to ${back}`
}

/* The name the runtime reads, which is the whole of the problem: a file called
   anything else is not an error, it is silence. */
const ENV_FILE = '.env'

/* A name one keystroke away from `.env` — `.emv`, `.enb`, `env`. Cheap, and it
   is the difference between "you did not configure this" and "you did, and it
   went nowhere". */
function withinOneEdit(name: string, target: string): boolean {
  if (name === target) return false
  if (Math.abs(name.length - target.length) > 1) return false

  let a = 0
  let b = 0
  let edits = 0
  while (a < name.length && b < target.length) {
    if (name[a] === target[b]) {
      a++
      b++
      continue
    }
    if (++edits > 1) return false
    if (name.length > target.length) a++
    else if (name.length < target.length) b++
    else {
      a++
      b++
    }
  }
  return edits + (name.length - a) + (target.length - b) <= 1
}

/* Reading the file is only ever to compare what it says against what arrived.
   No value is returned or printed. */
export interface Dir {
  list(): readonly string[]
  read(name: string): string | null
}

export function dirAt(cwd: string): Dir {
  return {
    list() {
      try {
        return readdirSync(cwd)
      } catch {
        return []
      }
    },
    read(name) {
      try {
        return readFileSync(join(cwd, name), 'utf8')
      } catch {
        return null
      }
    },
  }
}

/* One line when something is demonstrably wrong, and nothing at all otherwise:
   a development machine with no OAuth at all is the ordinary case and must not
   be nagged. */
export function envTrouble(dir: Dir, env: Record<string, string | undefined>): string | null {
  if (env.MOOG_OAUTH_CLIENT_ID) return null

  const names = dir.list()

  if (names.includes(ENV_FILE)) {
    const raw = dir.read(ENV_FILE) ?? ''
    /* A byte order mark is not whitespace, so it becomes part of the first key's
       name and that key alone goes missing. Nothing shows it in an editor. */
    const bom = raw.charCodeAt(0) === 0xfeff
    const text = bom ? raw.slice(1) : raw

    const line = /^[ \t]*(?:export[ \t]+)?MOOG_OAUTH_CLIENT_ID[ \t]*=[ \t]*(.*)$/m.exec(text)
    const written = (line?.[1] ?? '').trim().replace(/^['"]|['"]$/g, '')

    /* Written but not arrived. A value left deliberately blank is not this, and
       says nothing. */
    if (written !== '') {
      return bom
        ? `${ENV_FILE} sets MOOG_OAUTH_CLIENT_ID, but its first line starts with a byte order mark, which hides the first key. Re-save it as UTF-8 without BOM.`
        : `${ENV_FILE} sets MOOG_OAUTH_CLIENT_ID, but this process did not receive it. Check the key for stray characters or spaces before the =.`
    }
    return null
  }

  const near = names.filter((name) => withinOneEdit(name, ENV_FILE))
  if (near.length > 0) {
    return `No ${ENV_FILE} here, but there is ${near.join(', ')}. Did you mean ${ENV_FILE}?`
  }

  return null
}
