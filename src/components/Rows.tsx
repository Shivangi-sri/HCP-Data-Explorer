import type { CSSProperties, Dispatch } from 'react'
import { cpi, type Totals } from '../derive'
import { callsOf, parseCalls, type Action, type State } from '../store'
import { CallsCell } from './CallsCell'

// A per-HCP call count this large is treated as a source-data outlier and flagged.
const OUTLIER_CALLS = 1000

const formatCpi = (value: number | null) => (value === null ? '—' : value.toFixed(1))

interface GroupRowProps {
  label: string
  level: 0 | 1
  totals: Totals
  open: boolean
  onToggle: () => void
  style: CSSProperties
}

export function GroupRow({ label, level, totals, open, onToggle, style }: GroupRowProps) {
  return (
    <div className={`row group level-${level}`} role="row" style={style}>
      <button className="group-toggle" role="gridcell" aria-expanded={open} onClick={onToggle}>
        {open ? '▾' : '▸'} {label} <span className="muted">({totals.count.toLocaleString()} HCPs)</span>
      </button>
      <span className="num" role="gridcell">{totals.calls.toLocaleString()}</span>
      <span className="num" role="gridcell">{totals.trx.toLocaleString()}</span>
      <span className="num" role="gridcell">{totals.nrx.toLocaleString()}</span>
      <span className="num" role="gridcell">{formatCpi(cpi(totals.calls, totals.trx))}</span>
    </div>
  )
}

interface DataRowProps {
  state: State
  dispatch: Dispatch<Action>
  row: number
  duplicateId: boolean
  style: CSSProperties
}

export function DataRow({ state, dispatch, row, duplicateId, style }: DataRowProps) {
  const r = state.rows[row]
  const outlier = parseCalls(r.calls) >= OUTLIER_CALLS
  return (
    <div className="row" role="row" style={style}>
      <span role="gridcell" className={duplicateId ? 'flag' : ''} title={duplicateId ? 'Duplicate ID in source data' : undefined}>
        {r.id}{duplicateId && ' ⚠'}
      </span>
      <span role="gridcell">{r.name}</span>
      <span role="gridcell" className={r.specialty ? '' : 'muted'} title={r.specialty ? undefined : 'Missing in source data'}>
        {r.specialty ?? '—'}
      </span>
      <span role="gridcell" className={`num ${outlier ? 'flag' : ''}`} title={outlier ? 'Outlier in source data' : undefined}>
        <CallsCell state={state} dispatch={dispatch} row={row} />
      </span>
      <span role="gridcell" className={`num ${r.trx === 0 ? 'flag' : ''}`} title={r.trx === 0 ? 'TRx is 0, so CPI is undefined' : undefined}>
        {r.trx.toLocaleString()}
      </span>
      <span role="gridcell" className="num">{r.nrx.toLocaleString()}</span>
      <span role="gridcell" className="num">{formatCpi(cpi(callsOf(state, row), r.trx))}</span>
    </div>
  )
}
