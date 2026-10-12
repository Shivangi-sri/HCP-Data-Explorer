import { expect, test } from 'vitest'
import { generateRows, type HcpRecord } from './lib/data-generator'
import { baseTotals, cpi, flatten, groupRows, liveTotals, sortGroups } from './derive'
import { initialState, reducer, type Action, type State } from './store'

const row = (name: string, territory: string, calls: number | string, trx: number, specialty: string | null = 'Oncology'): HcpRecord => ({
  id: 'HCP-' + name, name, specialty, region: territory.split(' / ')[0], territory, calls, trx, nrx: 1,
})

const rows = [
  row('Ann', 'West / T1', 10, 100), // 0
  row('Bob', 'West / T1', '30', 0, null), // 1: string calls, zero TRx, null specialty
  row('Cid', 'West / T2', 5, 50), // 2
  row('Dee', 'East / T1', 20, 400), // 3
]

const apply = (state: State, ...actions: Action[]) => actions.reduce(reducer, state)

// The same steps the UI runs.
function view(state: State) {
  const totals = liveTotals(state, state.accepted, baseTotals(state.rows, groupRows(state)))
  const regions = sortGroups(state, groupRows(state), totals)
  return { totals, regions, items: flatten(regions, state.collapsed) }
}

test('cpi is null when TRx is 0', () => {
  expect(cpi(10, 100)).toBe(10)
  expect(cpi(10, 0)).toBeNull()
  expect(cpi(0, 0)).toBeNull()
})

test('groups by region then territory, alphabetically, with subtotals', () => {
  const { regions, totals } = view(initialState(rows))
  expect(regions.map((r) => r.key)).toEqual(['East', 'West'])
  expect(regions[1].territories.map((t) => t.key)).toEqual(['West / T1', 'West / T2'])
  expect(totals.get('West / T1')).toEqual({ count: 2, calls: 40, trx: 100, nrx: 2 })
  expect(totals.get('West')).toEqual({ count: 3, calls: 45, trx: 150, nrx: 3 })
})

test('subtotals include accepted edits but not pending ones', () => {
  const pending = apply(initialState(rows), { type: 'commit', row: 0, value: 50 })
  expect(view(pending).totals.get('West')!.calls).toBe(45)

  const accepted = apply(pending, { type: 'resolve', row: 0, value: 50 })
  expect(view(accepted).totals.get('West')!.calls).toBe(85)
  expect(view(accepted).totals.get('West / T1')!.calls).toBe(80)

  const undone = apply(accepted, { type: 'undo' })
  expect(view(undone).totals.get('West')!.calls).toBe(45)
})

test('search filters rows and subtotals', () => {
  const { regions, totals } = view(apply(initialState(rows), { type: 'search', text: 'bob' }))
  expect(regions.map((r) => r.key)).toEqual(['West'])
  expect(totals.get('West')).toEqual({ count: 1, calls: 30, trx: 0, nrx: 1 })
})

test('numeric sort orders rows in a territory and reorders groups by aggregate', () => {
  const desc = apply(initialState(rows), { type: 'sort', col: 'calls' }, { type: 'sort', col: 'calls' })
  const { regions } = view(desc)
  expect(regions.map((r) => r.key)).toEqual(['West', 'East']) // 45 calls vs 20
  expect(regions[0].territories[0].rows).toEqual([1, 0]) // "30" is compared as a number
})

test('missing values sort last in both directions', () => {
  const asc = apply(initialState(rows), { type: 'sort', col: 'specialty' })
  const desc = apply(asc, { type: 'sort', col: 'specialty' })
  const westT1 = (s: State) => view(s).regions.find((r) => r.key === 'West')!.territories[0].rows
  expect(westT1(asc)).toEqual([0, 1])
  expect(westT1(desc)).toEqual([0, 1])
})

test('collapsed groups keep their header but hide their contents', () => {
  const all = view(initialState(rows)).items
  expect(all).toHaveLength(9) // 2 regions + 3 territories + 4 rows

  const collapsed = view(apply(initialState(rows), { type: 'toggle', key: 'West' })).items
  expect(collapsed).toEqual([
    { type: 'group', key: 'East', level: 0 },
    { type: 'group', key: 'East / T1', level: 1 },
    { type: 'row', row: 3 },
    { type: 'group', key: 'West', level: 0 },
  ])
})

test('real dataset: every row lands in exactly one group, and it is fast', () => {
  const state = initialState(generateRows())
  const start = performance.now()
  const { regions, totals, items } = view(apply(state, { type: 'sort', col: 'cpi' }))
  const ms = performance.now() - start
  const count = regions.reduce((sum, r) => sum + totals.get(r.key)!.count, 0)
  expect(count).toBe(50000)
  expect(items).toHaveLength(50000 + 6 + 48)
  console.log(`group + totals + sort + flatten over 50k rows: ${ms.toFixed(0)} ms`)
})
