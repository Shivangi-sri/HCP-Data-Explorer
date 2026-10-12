import { useMemo, useRef, type Dispatch } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { baseTotals, flatten, groupRows, liveTotals, sortGroups } from '../derive'
import type { Action, SortCol, State } from '../store'
import { DataRow, GroupRow } from './Rows'

const ROW_HEIGHT = 32

const COLUMNS: { col: SortCol; label: string; numeric?: boolean }[] = [
  { col: 'id', label: 'ID' },
  { col: 'name', label: 'HCP Name' },
  { col: 'specialty', label: 'Specialty' },
  { col: 'calls', label: 'Calls', numeric: true },
  { col: 'trx', label: 'TRx', numeric: true },
  { col: 'nrx', label: 'NRx', numeric: true },
  { col: 'cpi', label: 'CPI', numeric: true },
]

function timed<T>(work: () => T): { value: T; ms: number } {
  const start = performance.now()
  const value = work()
  return { value, ms: performance.now() - start }
}

interface Props {
  state: State
  dispatch: Dispatch<Action>
}

export function Grid({ state, dispatch }: Props) {
  const { rows, search, region, sort, accepted, collapsed, cells } = state

  // Each step is memoized on what it really depends on, so an edit or a
  // collapse never redoes the filtering or sorting of 50k rows.
  const filter = useMemo(() => ({ rows, search, region }), [rows, search, region])
  const grouped = useMemo(
    () => timed(() => {
      const regions = groupRows(filter)
      return { regions, base: baseTotals(filter.rows, regions) }
    }),
    [filter],
  )
  const totals = useMemo(() => liveTotals(filter, accepted, grouped.value.base), [filter, accepted, grouped])
  // The order is a snapshot taken when the sort or filter changes. Accepted
  // edits are left out of the dependencies on purpose: an edited row stays
  // where it is instead of jumping away, and edits never trigger a re-sort.
  const sorted = useMemo(
    () => timed(() => sortGroups(state, grouped.value.regions, totals)),
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- deliberate snapshot, see comment above
    [grouped, sort],
  )
  const items = useMemo(() => flatten(sorted.value, collapsed), [sorted, collapsed])

  const duplicateIds = useMemo(() => {
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const r of rows) (seen.has(r.id) ? duplicates : seen).add(r.id)
    return duplicates
  }, [rows])

  const scroller = useRef<HTMLDivElement>(null)
  // oxlint-disable-next-line react/incompatible-library -- this project does not use React Compiler
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT,
    paddingStart: ROW_HEIGHT, // room for the sticky header
    overscan: 8,
  })
  const visible = virtualizer.getVirtualItems()

  const pending = [...cells.values()].filter((c) => c.status === 'pending').length
  const rejections = [...cells].filter(([, c]) => c.status === 'rejected')
  const lastRejection = rejections.at(-1)

  return (
    <>
      <div className="scroller" ref={scroller} role="grid" aria-rowcount={items.length + 1}>
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          <div className="row header" role="row">
            {COLUMNS.map(({ col, label, numeric }) => {
              const dir = sort?.col === col ? sort.dir : null
              return (
                <span
                  key={col}
                  role="columnheader"
                  className={numeric ? 'num' : ''}
                  aria-sort={dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none'}
                >
                  <button onClick={() => dispatch({ type: 'sort', col })}>
                    {label} {dir === 'asc' ? '▲' : dir === 'desc' ? '▼' : ''}
                  </button>
                </span>
              )
            })}
          </div>

          {visible.map((v) => {
            const item = items[v.index]
            console.log(item)
            const style = { transform: `translateY(${v.start}px)` }
            return item.type === 'group' ? (
              <GroupRow
                key={item.key}
                label={item.key}
                level={item.level}
                totals={totals.get(item.key)!}
                open={!collapsed.has(item.key)}
                onToggle={() => dispatch({ type: 'toggle', key: item.key })}
                style={style}
              />
            ) : (
              <DataRow
                key={item.row}
                state={state}
                dispatch={dispatch}
                row={item.row}
                duplicateId={duplicateIds.has(rows[item.row].id)}
                style={style}
              />
            )
          })}
          {items.length === 0 && <p className="empty">No HCPs match the current search and filter.</p>}
        </div>
      </div>

      <footer>
        <span>rows in DOM: {visible.length} of {items.length.toLocaleString()}</span>
        <span>filter + group: {grouped.ms.toFixed(0)} ms</span>
        <span>sort: {sorted.ms.toFixed(0)} ms</span>
        <span>pending: {pending}</span>
        <span role="status" className={lastRejection ? 'error' : ''}>
          {lastRejection &&
            `${rejections.length} rejected. Latest: ${rows[lastRejection[0]].id} → ${lastRejection[1].value}: ${
              lastRejection[1].status === 'rejected' ? lastRejection[1].reason : ''
            }`}
        </span>
      </footer>
    </>
  )
}
