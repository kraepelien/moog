import { describe, expect, test } from 'bun:test'
import { authConfigFromEnv } from '../server/identity.ts'

/* The suite is meant to test the code rather than the machine it runs on. This
   is what catches the day that stops being true: it fails on a developer's
   laptop and passes in CI, which is the shape of failure that costs a morning. */
describe('the environment a test runs in', () => {
  test('carries none of the developer own configuration', () => {
    expect(Object.keys(process.env).filter((name) => name.startsWith('MOOG_'))).toEqual([])
  })

  /* The one that actually bit: with a client id present the server wants a real
     sign-in, and every test that saves a patch gets a 401 instead. */
  test('leaves the server unconfigured, so it authenticates nobody', () => {
    expect(authConfigFromEnv(process.env).mode).toBe('off')
  })
})
