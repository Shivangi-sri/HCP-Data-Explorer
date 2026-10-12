import { useEffect, useReducer, useState } from 'react'
import { Grid } from './components/Grid'
import { Toolbar } from './components/Toolbar'
import { generateRows } from './lib/data-generator'
import { initialState, reducer } from './store'
import { resolveTheme, themeStyle } from './theme'

// Generated once at module load: the dataset is deterministic and never mutated.
const rows = generateRows()
const regions = [...new Set(rows.map((r) => r.region))].sort()

export default function App() {
  const [state, dispatch] = useReducer(reducer, rows, initialState)
  // The tenant can be preselected with ?tenant=meridian and switched at runtime.
  const [tenant, setTenant] = useState(() => new URLSearchParams(location.search).get('tenant') ?? 'default')
  const theme = resolveTheme(tenant)

  useEffect(() => {
    document.title = theme.appName
  }, [theme.appName])

  // Ctrl/Cmd+Z undoes, with Shift it redoes. Left alone while typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement
      if (typing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return
      e.preventDefault()
      dispatch({ type: e.shiftKey ? 'redo' : 'undo' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app" style={themeStyle(theme)}>
      <header>
        <h1>{theme.appName}</h1>
      </header>
      <Toolbar state={state} dispatch={dispatch} regions={regions} tenant={tenant} onTenant={setTenant} />
      <Grid state={state} dispatch={dispatch} />
    </div>
  )
}
