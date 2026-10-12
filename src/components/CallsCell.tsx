import { useState, type Dispatch } from 'react'
import { callsOf, commitEdit, parseCalls, type Action, type State } from '../store'

interface Props {
  state: State
  dispatch: Dispatch<Action>
  row: number
}

// The editable Calls cell: view -> editing -> pending -> saved or rejected.
// The text being typed lives here, so a keystroke re-renders only this cell.
export function CallsCell({ state, dispatch, row }: Props) {
  const [draft, setDraft] = useState<string | null>(null) // null = not editing
  const cell = state.cells.get(row)
  const saved = callsOf(state, row)

  if (draft !== null) {
    const value = Number(draft)
    const valid = draft.trim() !== '' && Number.isInteger(value) && value >= 0
    return (
      <input
        className="calls-input"
        type="number"
        min={0}
        step={1}
        autoFocus
        onFocus={(e) => e.target.select()}
        aria-label="Calls"
        aria-invalid={!valid}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setDraft(null)
          if (e.key === 'Enter' && valid) {
            commitEdit(state, dispatch, row, value)
            setDraft(null)
          }
        }}
      />
    )
  }

  if (cell?.status === 'pending') {
    return (
      <span className="calls pending" aria-busy="true" title="Validating… this cell is locked">
        ⏳ {cell.value.toLocaleString()}
      </span>
    )
  }

  const rejected = cell?.status === 'rejected'
  const edited = saved !== parseCalls(state.rows[row].calls)
  const startEditing = () => {
    // Reopening a rejected cell starts from the rejected value and clears the marker.
    if (rejected) dispatch({ type: 'dismiss', row })
    setDraft(String(rejected ? cell.value : saved))
  }
  return (
    <button
      className={`calls ${rejected ? 'rejected' : edited ? 'saved' : ''}`}
      title={rejected ? `Rejected ${cell.value}: ${cell.reason}` : edited ? 'Edited and saved' : 'Click to edit'}
      onClick={startEditing}
    >
      {rejected ? '⚠ ' : edited ? '✓ ' : ''}
      {saved.toLocaleString()}
    </button>
  )
}
