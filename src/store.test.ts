import { expect, test } from 'vitest'
import type { HcpRecord } from './lib/data-generator'
import { callsOf, commitEdit, initialState, reducer, type Action } from './store'

const row = (calls: number | string): HcpRecord => ({
  id: 'HCP-1', name: 'A B', specialty: null, region: 'West', territory: 'West / T1', calls, trx: 100, nrx: 10,
})

// A tiny store plus a validator whose promises the test settles by hand.
function setup() {
  let state = initialState([row(10), row('20')])
  const dispatch = (action: Action) => { state = reducer(state, action) }
  const settle: Record<number, { ok: () => void; fail: (reason: string) => void }> = {}
  const validate = (value: number) =>
    new Promise<void>((ok, fail) => { settle[value] = { ok, fail } })
  const edit = (r: number, value: number) => commitEdit(state, dispatch, r, value, validate)
  return { get state() { return state }, dispatch, settle, edit }
}

test('string calls are read as numbers', () => {
  expect(callsOf(setup().state, 1)).toBe(20)
})

test('accepted edit: pending, then saved, and undo/redo work', async () => {
  const s = setup()
  const done = s.edit(0, 15)
  expect(s.state.cells.get(0)).toEqual({ status: 'pending', value: 15 })
  expect(callsOf(s.state, 0)).toBe(10) // pending value is not counted yet

  s.settle[15].ok()
  await done
  expect(s.state.cells.has(0)).toBe(false)
  expect(callsOf(s.state, 0)).toBe(15)

  s.dispatch({ type: 'undo' })
  expect(callsOf(s.state, 0)).toBe(10)
  s.dispatch({ type: 'redo' })
  expect(callsOf(s.state, 0)).toBe(15)
})

test('rejected edit: value reverts and the reason is kept', async () => {
  const s = setup()
  const done = s.edit(0, 75)
  s.settle[75].fail('exceeds per-HCP call cap (60)')
  await done
  expect(callsOf(s.state, 0)).toBe(10)
  expect(s.state.cells.get(0)).toEqual({ status: 'rejected', value: 75, reason: 'exceeds per-HCP call cap (60)' })
  expect(s.state.undo).toHaveLength(0)
})

test('a pending cell is locked against a second edit', () => {
  const s = setup()
  s.edit(0, 15)
  s.edit(0, 30)
  expect(s.state.cells.get(0)).toEqual({ status: 'pending', value: 15 })
  expect(s.settle[30]).toBeUndefined() // validator was never called for the second edit
})

test('race: results arriving out of order land on the right rows', async () => {
  const s = setup()
  const first = s.edit(0, 15)
  const second = s.edit(1, 25)
  s.settle[25].ok() // the later edit finishes first
  await second
  s.settle[15].ok()
  await first
  expect(callsOf(s.state, 0)).toBe(15)
  expect(callsOf(s.state, 1)).toBe(25)

  s.dispatch({ type: 'undo' }) // undoes the most recently accepted edit: row 0
  expect(callsOf(s.state, 0)).toBe(10)
  expect(callsOf(s.state, 1)).toBe(25)
})

test('race: undo while a later edit on the same row is still in flight', async () => {
  const s = setup()
  const first = s.edit(0, 15)
  s.settle[15].ok()
  await first

  const second = s.edit(0, 30) // pending
  s.dispatch({ type: 'undo' }) // row 0 goes back to 10 meanwhile
  s.settle[30].ok()
  await second

  expect(callsOf(s.state, 0)).toBe(30)
  s.dispatch({ type: 'undo' })
  expect(callsOf(s.state, 0)).toBe(10) // returns to what was actually there, not 15
})

test('sort cycles asc -> desc -> none', () => {
  const s = setup()
  s.dispatch({ type: 'sort', col: 'calls' })
  expect(s.state.sort).toEqual({ col: 'calls', dir: 'asc' })
  s.dispatch({ type: 'sort', col: 'calls' })
  expect(s.state.sort).toEqual({ col: 'calls', dir: 'desc' })
  s.dispatch({ type: 'sort', col: 'calls' })
  expect(s.state.sort).toBeNull()
})
