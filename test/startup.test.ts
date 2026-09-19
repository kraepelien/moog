import { describe, expect, test } from 'bun:test'
import { authConfigFromEnv } from '@server/identity.ts'
import { describeAuth, envTrouble, type Dir } from '@server/startup.ts'

/* Every case here cost real time to diagnose, and each one is silent: a server
   with no credentials behaves exactly like one whose credentials never arrived.
   What is tested is that it stops being silent. */

function dir(files: Record<string, string>): Dir {
  return {
    list: () => Object.keys(files),
    read: (name) => files[name] ?? null,
  }
}

const CONFIGURED = { PM_OAUTH_CLIENT_ID: 'client-abc' }

describe('what the line says', () => {
  test('names where a sign-in comes back to', () => {
    const config = authConfigFromEnv({
      PM_OAUTH_CLIENT_ID: 'client',
      PM_SESSION_SECRET: 'secret',
      PM_PUBLIC_ORIGIN: 'https://patchmemory.example',
    })
    expect(describeAuth(config)).toContain('returns to https://patchmemory.example')
  })

  /* A request from loopback answers as itself whatever this says, so a line
     naming only the live domain read as though local sign-in were broken. */
  test('says that a sign-in from this machine comes back here', () => {
    const config = authConfigFromEnv({
      PM_OAUTH_CLIENT_ID: 'client',
      PM_SESSION_SECRET: 'secret',
      PM_PUBLIC_ORIGIN: 'https://patchmemory.example',
    })
    expect(describeAuth(config)).toBe(
      'Google, nobody admitted — PM_ADMINS is empty → returns to ' +
        'https://patchmemory.example, or to this machine when signed in from localhost',
    )
  })

  /* Nothing to add when the two answers are already the same sentence. */
  test('says it once when no origin is configured', () => {
    const config = authConfigFromEnv({
      PM_OAUTH_CLIENT_ID: 'client',
      PM_SESSION_SECRET: 'secret',
    })
    expect(describeAuth(config)).toBe(
      'Google, nobody admitted — PM_ADMINS is empty → returns to the origin each request arrives on',
    )
  })

  /* The one that sent a local sign-in to production: browsing localhost while
     this says a live domain is the whole of the bug, visible at a glance. */
  test('a public origin is stated even when it is not where you are browsing', () => {
    const config = authConfigFromEnv({
      PM_OAUTH_CLIENT_ID: 'client',
      PM_SESSION_SECRET: 'secret',
      PM_PUBLIC_ORIGIN: 'https://patchmemory.app',
      PM_ADMINS: 'a@example.com,b@example.com',
    })
    expect(describeAuth(config)).toStartWith(
      'Google, 2 address(es) admitted → returns to https://patchmemory.app',
    )
  })

  test('says so when nothing is configured', () => {
    expect(describeAuth(authConfigFromEnv({}))).toContain('everything belongs to the local user')
  })
})

describe('a file that was never read', () => {
  /* The actual afternoon: the file was called .emv, so nothing read it, and
     nothing anywhere said a word. */
  test.each(['.emv', '.enb', 'env', '.en'])('%s is offered as the file you meant', (name) => {
    expect(envTrouble(dir({ [name]: 'PM_OAUTH_CLIENT_ID=abc' }), {})).toContain(
      `Did you mean .env?`,
    )
  })

  test('names the file it found', () => {
    expect(envTrouble(dir({ '.emv': 'x' }), {})).toContain('.emv')
  })

  test('a file that is nothing like .env is not a suggestion', () => {
    expect(envTrouble(dir({ '.gitignore': '', 'package.json': '' }), {})).toBeNull()
  })
})

describe('a file that was read but did not arrive', () => {
  /* A byte order mark is not whitespace, so it joins the first key's name and
     that key alone disappears. An editor shows nothing. */
  test('a byte order mark is named, since nothing else would show it', () => {
    const warning = envTrouble(dir({ '.env': '﻿PM_OAUTH_CLIENT_ID=abc\n' }), {})
    expect(warning).toContain('byte order mark')
  })

  test('a value in the file that the process never got is reported', () => {
    const warning = envTrouble(dir({ '.env': 'PM_OAUTH_CLIENT_ID=abc\n' }), {})
    expect(warning).toContain('did not receive it')
  })

  test('quotes and an export prefix are still a written value', () => {
    const warning = envTrouble(dir({ '.env': 'export PM_OAUTH_CLIENT_ID="abc"\n' }), {})
    expect(warning).toContain('did not receive it')
  })
})

describe('silence, which is most of the time', () => {
  test('nothing at all once it is configured', () => {
    expect(envTrouble(dir({ '.env': 'PM_OAUTH_CLIENT_ID=abc' }), CONFIGURED)).toBeNull()
    expect(envTrouble(dir({ '.emv': 'anything' }), CONFIGURED)).toBeNull()
  })

  /* Running without OAuth is the ordinary way to develop and the way the suite
     runs. It must not be nagged. */
  test('nothing when there is no env file and none was wanted', () => {
    expect(envTrouble(dir({ 'package.json': '' }), {})).toBeNull()
  })

  test('nothing when the value is deliberately left blank', () => {
    expect(envTrouble(dir({ '.env': 'PM_OAUTH_CLIENT_ID=\nPM_ADMINS=a@b.c\n' }), {})).toBeNull()
  })

  test('nothing when .env is about something else entirely', () => {
    expect(envTrouble(dir({ '.env': 'PM_DATA=./data\n' }), {})).toBeNull()
  })
})
