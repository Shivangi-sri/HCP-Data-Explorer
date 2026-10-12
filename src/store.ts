import type { HcpRecord } from './lib/data-generator'
import { validateCalls } from './lib/mock-validator'

export type SortCol = 'id' | 'name' | 'specialty' | 'calls' | 'trx' | 'nrx' | 'cpi'
export type Sort = { col: SortCol; dir: 'asc' | 'desc' } | null

// A cell with no entry here is in its normal (saved) state.
export type CellState =
  | { status: 'pending'; value: number }
  | { status: 'rejected'; value: number; reason: string }

// One accepted edit. Undo applies `from`, redo applies `to`.
export interface Command {
  row: number
  from: number
  to: number
}

// Rows are identified by their index in `rows` everywhere: the dataset
// contains duplicate ids, and the index is stable because rows never move.
export interface State {
  rows: HcpRecord[] // generator output, never mutated
  accepted: Map<number, number> // row -> validated Calls value
  cells: Map<number, CellState> // row -> pending / rejected edit
  undo: Command[]
  redo: Command[]
  sort: Sort
  search: string
  region: string // '' means all regions
  collapsed: Set<string> // group keys, e.g. "West" or "West / T3"
}

export type Action =
  | { type: 'commit'; row: number; value: number }
  | { type: 'resolve'; row: number; value: number }
  | { type: 'reject'; row: number; value: number; reason: string }
  | { type: 'dismiss'; row: number }
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'sort'; col: SortCol }
  | { type: 'search'; text: string }
  | { type: 'region'; region: string }
  | { type: 'toggle'; key: string }

export function initialState(rows: HcpRecord[]): State {
  return {
    rows,
    accepted: new Map(),
    cells: new Map(),
    undo: [],
    redo: [],
    sort: null,
    search: '',
    region: '',
    collapsed: new Set(),
  }
}

// Source `calls` is sometimes a numeric string; anything unparseable counts as 0.
export function parseCalls(raw: number | string): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

// The saved Calls value of a row. Pending edits are deliberately not included.
export function callsOf(state: State, row: number): number {
  return state.accepted.get(row) ?? parseCalls(state.rows[row].calls)
}

function isPending(state: State, row: number, value: number): boolean {
  const cell = state.cells.get(row)
  return cell?.status === 'pending' && cell.value === value
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'commit': {
      // Pending cells are locked: a second edit is ignored until the first settles.
      if (state.cells.get(action.row)?.status === 'pending') return state
      const cells = new Map(state.cells)
      cells.set(action.row, { status: 'pending', value: action.value })
      return { ...state, cells }
    }
    case 'resolve': {
      if (!isPending(state, action.row, action.value)) return state // late or stale result
      const cells = new Map(state.cells)
      cells.delete(action.row)
      // `from` is read now, not at commit time, so an undo that ran while this
      // edit was in flight is still recorded as a correct transition.
      const command = { row: action.row, from: callsOf(state, action.row), to: action.value }
      const accepted = new Map(state.accepted).set(action.row, action.value)
      return { ...state, cells, accepted, undo: [...state.undo, command], redo: [] }
    }
    case 'reject': {
      if (!isPending(state, action.row, action.value)) return state
      const cells = new Map(state.cells)
      cells.set(action.row, { status: 'rejected', value: action.value, reason: action.reason })
      return { ...state, cells }
    }
    case 'dismiss': {
      // Clears a rejection marker once the user has seen it; never touches a pending cell.
      if (state.cells.get(action.row)?.status !== 'rejected') return state
      const cells = new Map(state.cells)
      cells.delete(action.row)
      return { ...state, cells }
    }
    case 'undo': {
      const command = state.undo.at(-1)
      if (!command) return state
      const accepted = new Map(state.accepted).set(command.row, command.from)
      return { ...state, accepted, undo: state.undo.slice(0, -1), redo: [...state.redo, command] }
    }
    case 'redo': {
      // Redo does not re-validate: the value was already accepted once.
      const command = state.redo.at(-1)
      if (!command) return state
      const accepted = new Map(state.accepted).set(command.row, command.to)
      return { ...state, accepted, redo: state.redo.slice(0, -1), undo: [...state.undo, command] }
    }
    case 'sort': {
      // Three-state cycle per column: asc -> desc -> none.
      const { sort } = state
      if (sort?.col !== action.col) return { ...state, sort: { col: action.col, dir: 'asc' } }
      return { ...state, sort: sort.dir === 'asc' ? { col: action.col, dir: 'desc' } : null }
    }
    case 'search':
      // Searching expands every group, so groups containing matches are open.
      return { ...state, search: action.text, collapsed: action.text ? new Set() : state.collapsed }
    case 'region':
      return { ...state, region: action.region }
    case 'toggle': {
      const collapsed = new Set(state.collapsed)
      if (!collapsed.delete(action.key)) collapsed.add(action.key)
      return { ...state, collapsed }
    }
  }
}

// Starts an edit: marks the cell pending, then reports the validator's verdict.
// The validator is a parameter so tests can inject a deterministic one.
export function commitEdit(
  state: State,
  dispatch: (action: Action) => void,
  row: number,
  value: number,
  validate: (value: number) => Promise<void> = validateCalls,
): Promise<void> {
  const locked = state.cells.get(row)?.status === 'pending'
  if (locked || value === callsOf(state, row)) return Promise.resolve() // no-op edit
  dispatch({ type: 'commit', row, value })
  return validate(value).then(
    () => dispatch({ type: 'resolve', row, value }),
    (reason) => dispatch({ type: 'reject', row, value, reason: String(reason) }),
  )
}
