import { useState, useTransition, type Dispatch } from 'react'
import { TENANT_THEMES } from '../lib/theme-config'
import type { Action, State } from '../store'

interface Props {
  state: State
  dispatch: Dispatch<Action>
  regions: string[]
  tenant: string
  onTenant: (tenant: string) => void
}

export function Toolbar({ state, dispatch, regions, tenant, onTenant }: Props) {
  // The input keeps its own text so typing stays instant; the 50k-row
  // filtering it triggers runs as a low-priority transition.
  const [text, setText] = useState(state.search)
  const [, startTransition] = useTransition()

  return (
    <div className="toolbar">
      <input
        type="search"
        placeholder="Search name or ID…"
        aria-label="Search name or ID"
        value={text}
        onChange={(e) => {
          const next = e.target.value
          setText(next)
          startTransition(() => dispatch({ type: 'search', text: next }))
        }}
      />
      <select aria-label="Region" value={state.region} onChange={(e) => dispatch({ type: 'region', region: e.target.value })}>
        <option value="">All regions</option>
        {regions.map((r) => <option key={r}>{r}</option>)}
      </select>
      <button disabled={state.undo.length === 0} onClick={() => dispatch({ type: 'undo' })}>↶ Undo</button>
      <button disabled={state.redo.length === 0} onClick={() => dispatch({ type: 'redo' })}>↷ Redo</button>
      <select className="tenant" aria-label="Tenant theme" value={tenant} onChange={(e) => onTenant(e.target.value)}>
        <option value="default">Default theme</option>
        {Object.keys(TENANT_THEMES).map((t) => <option key={t}>{t}</option>)}
      </select>
    </div>
  )
}
