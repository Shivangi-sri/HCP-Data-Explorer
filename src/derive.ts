import type { HcpRecord } from './lib/data-generator'
import { callsOf, parseCalls, type SortCol, type State } from './store'

// Pure functions that turn the state into what the grid shows:
// groupRows -> baseTotals -> liveTotals -> sortGroups -> flatten

export interface Territory {
  key: string // e.g. "West / T3"
  rows: number[] // row indices
}

export interface Region {
  key: string // e.g. "West"
  territories: Territory[]
}

export interface Totals {
  count: number
  calls: number
  trx: number
  nrx: number
}

// The parts of the state that decide which rows are shown.
export type Filter = Pick<State, 'rows' | 'search' | 'region'>

// One line of the virtualized list.
export type Item =
  | { type: 'group'; key: string; level: 0 | 1 }
  | { type: 'row'; row: number }

// CPI = Calls / TRx x 100. Undefined when TRx is 0, so the UI never sees NaN or Infinity.
export function cpi(calls: number, trx: number): number | null {
  return trx > 0 ? (calls / trx) * 100 : null
}

function matcher(search: string, region: string): (r: HcpRecord) => boolean {
  const q = search.trim().toLowerCase()
  return (r) =>
    (!region || r.region === region) &&
    (!q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q))
}

// Filter, then bucket rows into Region -> Territory. One pass over all rows;
// only needs to run when the search text or region filter changes.
export function groupRows(filter: Filter): Region[] {
  const match = matcher(filter.search, filter.region)
  const regions = new Map<string, Map<string, number[]>>()
  filter.rows.forEach((r, i) => {
    if (!match(r)) return
    if (!regions.has(r.region)) regions.set(r.region, new Map())
    const territories = regions.get(r.region)!
    if (!territories.has(r.territory)) territories.set(r.territory, [])
    territories.get(r.territory)!.push(i)
  })
  return [...regions].map(([key, territories]) => ({
    key,
    territories: [...territories].map(([key, rows]) => ({ key, rows })),
  }))
}

// Subtotals from the original data, keyed by group key. One pass over the grouped rows.
export function baseTotals(rows: HcpRecord[], regions: Region[]): Map<string, Totals> {
  const totals = new Map<string, Totals>()
  for (const region of regions) {
    const regionTotal = { count: 0, calls: 0, trx: 0, nrx: 0 }
    totals.set(region.key, regionTotal)
    for (const territory of region.territories) {
      const t = { count: 0, calls: 0, trx: 0, nrx: 0 }
      for (const i of territory.rows) {
        t.count += 1
        t.calls += parseCalls(rows[i].calls)
        t.trx += rows[i].trx
        t.nrx += rows[i].nrx
      }
      totals.set(territory.key, t)
      regionTotal.count += t.count
      regionTotal.calls += t.calls
      regionTotal.trx += t.trx
      regionTotal.nrx += t.nrx
    }
  }
  return totals
}

// Base subtotals plus the accepted edits. Costs one step per accepted edit,
// not one per row, so an accepted edit never re-adds 50k rows.
// Pending edits are not in `accepted`, so they are never counted.
export function liveTotals(
  filter: Filter,
  accepted: Map<number, number>,
  base: Map<string, Totals>,
): Map<string, Totals> {
  const match = matcher(filter.search, filter.region)
  const totals = new Map([...base].map(([key, t]) => [key, { ...t }]))
  for (const [row, value] of accepted) {
    const r = filter.rows[row]
    if (!match(r)) continue
    const delta = value - parseCalls(r.calls)
    totals.get(r.region)!.calls += delta
    totals.get(r.territory)!.calls += delta
  }
  return totals
}

type Value = string | number | null

// Missing values (null specialty, undefined CPI) sort last in both directions.
function order(a: Value, b: Value, dir: 1 | -1): number {
  if (a === null || b === null) return a === b ? 0 : a === null ? 1 : -1
  return dir * (typeof a === 'string' ? a.localeCompare(b as string) : a - (b as number))
}

function rowValue(state: State, row: number, col: SortCol): Value {
  const r = state.rows[row]
  if (col === 'calls') return callsOf(state, row)
  if (col === 'cpi') return cpi(callsOf(state, row), r.trx)
  return r[col]
}

// Rows sort inside their territory; ties keep source order (Array.sort is stable).
// Groups sort by their aggregate for numeric columns, otherwise alphabetically.
export function sortGroups(state: State, regions: Region[], totals: Map<string, Totals>): Region[] {
  const { sort } = state
  const dir = sort?.dir === 'desc' ? -1 : 1
  const col = sort?.col

  const groupValue = (key: string): Value => {
    const t = totals.get(key)!
    if (col === 'cpi') return cpi(t.calls, t.trx)
    return col === 'calls' || col === 'trx' || col === 'nrx' ? t[col] : null
  }
  const byGroup = (a: { key: string }, b: { key: string }) =>
    order(groupValue(a.key), groupValue(b.key), dir) || a.key.localeCompare(b.key)

  return [...regions].sort(byGroup).map((region) => ({
    key: region.key,
    territories: [...region.territories].sort(byGroup).map((territory) => ({
      key: territory.key,
      rows: col
        ? [...territory.rows].sort((a, b) => order(rowValue(state, a, col), rowValue(state, b, col), dir))
        : territory.rows,
    })),
  }))
}

// The grouped tree as one flat list, skipping the contents of collapsed groups.
export function flatten(regions: Region[], collapsed: Set<string>): Item[] {
  const items: Item[] = []
  for (const region of regions) {
    items.push({ type: 'group', key: region.key, level: 0 })
    if (collapsed.has(region.key)) continue
    for (const territory of region.territories) {
      items.push({ type: 'group', key: territory.key, level: 1 })
      if (collapsed.has(territory.key)) continue
      for (const row of territory.rows) items.push({ type: 'row', row })
    }
  }
  return items
}
