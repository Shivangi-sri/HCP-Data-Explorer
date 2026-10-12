# HCP Data Explorer

A React + TypeScript app that shows 50,000 doctor (HCP) records in a table. The table can be
grouped, sorted, searched and edited. Everything runs in the browser, there is no backend.

```bash
npm install && npm run dev
```

Other commands: `npm test`, `npm run build`, `npm run lint`.

The data problems I found and the decisions I took are in [ASSUMPTIONS.md](ASSUMPTIONS.md).

## What is done

| Requirement | Status |
|---|---|
| FR-1 Virtualized grid with footer | Done |
| FR-2 Region and Territory grouping with live subtotals | Done |
| FR-3 Sort, search, region filter | Done |
| FR-4 Editing Calls with validation, undo/redo | Done |
| FR-5 Bulk edit with partial failure | Design only (written below) |
| FR-6 Undo at scale | Design only (written below) |
| FR-7 CPI column | Done |
| FR-8 Tenant themes | Done |

Time spent: about 1.5 days.

## How the app is organised

I split the code in three parts. Data goes only in one direction, from top to bottom.

```
store.ts      the state and the reducer          (what is true)
   |
derive.ts     filter, group, totals, sort        (what to show)
   |
components/   Grid, Rows, CallsCell, Toolbar     (how it looks)
```

| File | What it does |
|---|---|
| `src/store.ts` | The state, the reducer with all actions, and `commitEdit` which calls the validator |
| `src/derive.ts` | Plain functions that turn the state into the list shown on screen |
| `src/theme.ts` | Checks a tenant theme and converts it to CSS variables |
| `src/components/Grid.tsx` | Calls the derive functions, runs the virtualizer, shows header and footer |
| `src/components/Rows.tsx` | One group row and one doctor row |
| `src/components/CallsCell.tsx` | The Calls cell that can be edited |
| `src/components/Toolbar.tsx` | Search, region filter, undo/redo, tenant dropdown |
| `src/lib/` | The three files given in the assignment, not changed |

The components do not calculate anything and do not call the validator. They only read the
state and send actions. This kept the components small and made the logic easy to test
without rendering anything.

## State model

All state is in one object and one `useReducer` in `App.tsx`.

```ts
interface State {
  rows: HcpRecord[]              // data from the generator, never changed
  accepted: Map<number, number>  // row -> Calls value that the validator accepted
  cells: Map<number, CellState>  // row -> pending or rejected edit
  undo: Command[]                // Command = { row, from, to }
  redo: Command[]
  sort: { col, dir } | null
  search: string
  region: string                 // '' means all regions
  collapsed: Set<string>         // closed groups, like "West" or "West / T3"
}
```

Why I made it like this:

- **A row is identified by its position in the original data**, not by its ID. The data has
  duplicate IDs, so ID cannot be used. The position never changes because I never sort or
  modify the `rows` array. Sorting and filtering create new lists of row numbers. There is
  more on this in ASSUMPTIONS.md.
- **The original data and the edits are kept separately.** The current value of a cell is
  the accepted edit if there is one, otherwise the original value. So I can always get the
  original back.
- **A pending edit is stored in `cells`, not in `accepted`.** The subtotals only read
  `accepted`. So a pending edit can never get counted in a subtotal by mistake.
- **Undo is a list of small commands**, each one is `{ row, from, to }`. Undo puts back
  `from`, redo puts back `to`. I do not save copies of the data.
- **Nothing calculated is stored in the state.** Groups, totals and the sorted order are
  calculated from the state when needed.

### How one edit works (FR-4)

```
press Enter -> commit -> cell becomes pending and locked, saved value is same as before
                   |
        validator answers after 300 to 900 ms
                   |
         +---------+---------+
      resolve              reject
  value is saved        cell shows rejected with the reason
  command added to      saved value is same as before
  undo, redo cleared
```

- While a cell is pending it is locked. A second edit on it is ignored and the validator is
  not called again.
- When the answer comes, the reducer first checks that the cell is still pending with the
  same value. If not, the answer is ignored. This is how a late answer cannot break the
  state.
- The `from` value of a command is read when the edit is accepted, not when the user typed
  it. Example: a row is 10, I change it to 15 (accepted), then change it to 30 (pending),
  and press undo before the answer comes. The row is 10 again. When 30 is accepted the
  command is saved as 10 to 30, which is what really happened.
- Entering the same value again does nothing.
- Undo and redo use the row number, so they work the same in any sort, filter or grouping.
- For a rejected cell the reason is shown in the tooltip and in the footer.

## Virtualization and performance

Rendering 50,000 rows would make the page very slow. So I render only the rows that are
visible.

How it works: the groups and rows are converted to one flat list, where each item is a
group row or a doctor row. I give `@tanstack/react-virtual` the number of items and the row
height (32 px). It tells me which items are visible right now, and I render only those. The
column header is sticky inside the same scroll area.

In the browser there are around 30 to 40 rows in the DOM out of 50,054.

What work happens on each action:

| Action | Work |
|---|---|
| Typing in a Calls cell | Only that cell re-renders. The typed text is local state of the cell. |
| Typing in search | The input updates immediately. Filter, group and sort run in a React transition. |
| Edit accepted, undo, redo | Only the totals are adjusted, then the visible rows re-render. |
| Open or close a group | Only the flat list is rebuilt. |
| Click on sort | Sort and rebuild the flat list. |

Two things I did to avoid working on all 50,000 rows again and again:

- **Totals are in two steps.** `baseTotals` adds up the rows once, when the filter changes.
  `liveTotals` takes those totals and only adds the difference for each accepted edit. So
  accepting an edit does not add up 50,000 rows again.
- **The sorted order is not recalculated after an edit.** It is recalculated only when the
  sort or the filter changes. This saves a sort on every edit, and the edited row does not
  jump away from the user.

Timings I saw in the footer on my machine (dev build): filter and group around 6 to 8 ms,
sort around 1 to 8 ms. I did not measure the scrolling frame rate.

## Build vs buy

I used one library, for virtualization. The rest I wrote myself.

| Part | Decision | Reason |
|---|---|---|
| Virtualization | Library: `@tanstack/react-virtual` | It is only maths about which rows are visible. There is no business rule in it, and it does not force any behaviour or styling on me. |
| Grouping, totals, sorting | Wrote it | The assignment has its own rules: pending edits not counted, group CPI from totals, groups reordered by their total, missing values at the bottom. It came to about 160 lines of plain functions. |
| Edit flow and undo | Wrote it | This is the main part of the assignment. I did not find a grid library that has pending and rejected cells with a command history. |
| State | `useReducer` | One reducer was enough. A state library would be one more dependency for no less code. |

Libraries I looked at and did not use:

- **AG Grid and MUI X Data Grid**: row grouping and aggregation are in the paid versions,
  which need a licence key. The assignment does not allow that.
- **MindFusion DataViews** (`@mindfusion/dataviews`): it is a commercial product, it has no
  row grouping or aggregation, and its React wrapper is deprecated.
- **TanStack Table**: it is free and good. But I would have to override most of its default
  behaviour to match the rules here, and then I would have more code to explain than with
  my own functions.

## FR-5 design: bulk edit with partial failure

I did not code this. This is how I would build it.

### What I would add to the state

```ts
selection: Set<number>                        // selected row numbers
type Change  = { row: number; from: number; to: number }
type Command = { label: string; changes: Change[] }   // a single edit is one change
bulk: {                                       // result of the last bulk action
  applied: Change[]
  rejected: { row: number; value: number; reason: string }[]
  skipped: number
} | null
```

The selection uses row numbers, same as everything else. The checkbox on a territory adds or
removes all rows of that territory that match the current filter.

The main change is in `Command`. Today a command is one change. For bulk it becomes a list
of changes. A single edit is then just a command with one change in it.

### Rules

- New value = current saved value x 1.1, rounded to a whole number.
- A row is skipped (validator not called) if its cell is already pending, or if the rounded
  value is the same as before (for example 0 stays 0, 4 stays 4).
- The action runs on all selected rows, also the ones inside a collapsed group. Before the
  user confirms, the toolbar shows how many rows are selected.
- Every row is validated separately and at the same time, using `Promise.allSettled`.
- **I wait for all answers and then apply the successful ones together in one action.**
  This is the important part. Because they are applied together, they become one command,
  so one undo. The subtotals also change only once. The cost is that the user sees the
  result only after the slowest answer (max 900 ms). Until then all those cells show as
  pending.
- If no row was applied, no command is added.

### One bulk action from start to end

Three rows are selected: A has Calls 20, B has 58, C has 30.

1. The user clicks "+10% calls". The new values are A 22, B 64, C 33.
2. Action `bulkStart`: A, B and C become pending. Subtotals do not change.
3. Three validator calls run at the same time. A is accepted. B is rejected with "exceeds
   per-HCP call cap (60)". C is rejected with "validation service 503 (simulated)".
4. After all three have answered, one action `bulkSettle` is sent with the three results.
   For each result the reducer checks that the cell is still pending with that value, then:
   - A: saves 22 in `accepted` and clears the cell.
   - B and C: marks the cell as rejected with its reason.
   - Adds one command `{ label: '+10% calls', changes: [A 20 to 22] }` and clears redo.
   - Sets `bulk` to 1 applied, 2 rejected.
5. The UI shows "1 applied, 2 rejected" and the reasons with their counts. For the 503 rows
   there is a "Retry rejected" button, because that error is random and can pass next time.
6. Undo takes A back to 20 in one step. B and C keep their rejected mark until the user
   dismisses them.

### One limit

If 1,000 rows are selected, 1,000 validator calls start at the same time. For the mock this
is fine. For a real server I would send them in small batches or ask for a bulk API.

## FR-6 design: undo at scale

I did not code this. It builds on the FR-4 undo and the `Command` with many changes from
FR-5.

- **A partly failed bulk action as one undo step.** Undo puts back the `from` of every
  change in the command, in one reducer call. Redo puts back every `to`. The rejected rows
  are not in the command, so undo does not touch them.

- **The row is inside a collapsed group.** In the `undo` and `redo` cases of the reducer I
  would remove the region and territory of the changed rows from `collapsed`, so they open.
  I would also set `focus: { row, seq }` in the state for the first changed row. The Grid
  watches `focus`. It finds that row in the flat list, calls
  `virtualizer.scrollToIndex(index, { align: 'center' })` and highlights the row for a
  moment. If the command has many rows, all their groups open and a message shows how many
  rows changed.

- **Does redo validate again? No.** The value was already accepted once. If redo validated
  again, redo would become async and it could fail. With the 10% random failure, redo of a
  bulk action could pass for some rows and fail for others, and then the command would not
  match the data any more. The downside is that if a rule changed on the server in between,
  I would not catch it here. In a real product the final save would be checked by the server
  again anyway.

- **The row is hidden by the current search or filter.** Undo still changes the value,
  because a command works on a row number and not on what is on screen. I would not clear
  the user's filter automatically, because the user chose it. I would show a message like
  "Undid edit on HCP-000123 (hidden by current filter)" with a "Show" button. The button
  clears the search and region filter and scrolls to the row. The filtered subtotals stay
  correct, because `liveTotals` already ignores rows that do not match the filter.

- **Undo while an edit on the same row is pending.** This already works, because `from` is
  read when the pending edit is accepted.

- **A new edit after undo** clears the redo list.

## Tests

There are 19 tests in four files. Run them with `npm test`.

- `store.test.ts`: the edit flow (pending to saved, pending to rejected), the lock on a
  pending cell, undo and redo, the three-state sort, and two race cases. The first race is
  two rows where the second answer comes before the first. The second race is undo while a
  later edit on the same row is still pending.
- `derive.test.ts`: grouping, subtotals that count accepted edits and do not count pending
  ones, subtotals with a search, sorting of string numbers and missing values, collapse, and
  one run on the real 50,000 rows.
- `theme.test.ts`: the fallback for the wrong `meridian` values and for an unknown tenant.

The async tests always give the same result. `commitEdit` takes the validator as a
parameter, so in tests I pass my own validator and decide myself when it accepts or rejects.
There are no timers and nothing random in the tests.

I did not write tests for the React components.

## What is not finished and what I would do with more time

- Code FR-5 and FR-6 as written above.
- Arrow key navigation between cells. Right now Tab moves between cells and group buttons,
  Enter saves and Esc cancels.
- If the user scrolls away while typing in a cell, the typed text is lost. I would keep the
  draft in the state.
- The rejection reason is in the tooltip and the footer. A small popup next to the cell
  would be easier to notice.
- Tests for the Grid and the CallsCell, and a proper check of scroll performance.
- I only check that theme colours are valid colours. A tenant can still pick colours that
  are hard to read together. I would add a contrast check.
- Export of the changes as JSON.
