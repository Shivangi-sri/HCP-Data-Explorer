# Assumptions

This file has two parts. First, the problems I found in the generated data and what I did
about each one. Second, the places where the requirement was not clear and what I decided.

One rule I followed everywhere: I never change the data that the generator gives. If a value
needs fixing, I fix it only at the time of reading it.

## Part 1: Problems I found in the data

To find these I read the generator code and also ran a small script to count each case.

### 1. Some IDs are duplicate

There are 5 pairs of rows with the same ID. For example `HCP-009973` comes two times. It
happens on every 9973rd row, which copies the ID of the row before it.

I checked these pairs. The names are different and in 3 pairs even the territory is
different. So these are two different doctors where one got a wrong ID. They are not the
same record repeated.

What I did:
- I show both rows. I do not remove any.
- Both rows get a warning icon next to the ID, with a tooltip.
- Because of this I cannot use ID as the key of a row. I use the row's position in the
  original data as its row number. This is the most important decision in the app, more on
  it in Part 2.

Also because of this, 5 IDs are missing from the data (like `HCP-009974`). I cannot do
anything for that, just noting it.

### 2. Specialty is null in some rows

515 rows have `specialty: null` (every 97th row).

I show a dash in place of it, with a tooltip saying it is missing in source data. I did not
want to show the word "null" or keep it blank because that looks like a bug in my UI. While
sorting, these rows always go to the bottom.

### 3. Calls is sometimes a string

236 rows have calls as a string like `"35"` and not a number (every 211th row). This is why
the type is `number | string`.

I checked that all of them are proper numbers inside the string. So I convert to number in
one function, `parseCalls`, and everything else (display, sorting, totals, CPI) uses that.
If I had not done this, sorting would compare `"35"` as text and totals would join strings.

If some string cannot be converted, `parseCalls` returns 0. That case is not there in this
data.

### 4. Calls is 99999 in 4 rows

Every 12007th row has calls = 99999. All other rows are between 0 and 40, so this is clearly
wrong data, maybe a default value or a typing mistake.

What I did:
- I show the value as it is, in a warning colour with a tooltip.
- I still count it in the group totals and in CPI.

I thought about leaving it out of the totals. But then the total shown on the group would
not match the rows inside it, and the user would not know why. So I kept it and made it
easy to notice. The side effect is that those 4 territories and their regions show a very
big Calls total.

### 5. TRx is 0 in some rows

112 rows have TRx = 0. CPI is Calls divided by TRx, so for these rows it would be divide by
zero.

I show a dash for CPI in these rows and highlight the TRx value. More about CPI in Part 2.

### 6. NRx is bigger than TRx in many rows

NRx (new prescriptions) is a part of TRx (total prescriptions), so it should never be
bigger. But in 8,307 rows it is.

I show both values as they are. I did not mark these rows, because that would be a warning
on one sixth of the table and then nobody would notice the other warnings. Nothing in my
app calculates using NRx and TRx together, so it does not break anything.

### 7. "National" is in the list of regions

The regions are Midwest, Northeast, Southeast, Southwest, West and National. The first five
are areas of the country and National is not. It may be a group for doctors who do not
belong to one area.

I do not know the business meaning, so I treat it like any other region.

### 8. Names repeat a lot

There are only 256 different names for 50,000 rows. So a name cannot identify a doctor.
I only use name for display and search.

### 9. The meridian theme has wrong values

In `meridian`, the primary colour is `#ZZ8800` which is not a valid colour, the radius is
the text `"huge"`, and two colours are missing.

I check every field one by one. If a field is wrong or missing I take that field from
`DEFAULT_THEME`. The correct fields of the same theme are still used. So meridian keeps its
name, background and surface, and gets the default for the rest.

## Part 2: Things that were not clear and what I decided

### Row identity

I use the row's position in the original data array as its identity. Think of it as a row
number that each record gets once, when the data is loaded. Edits, undo history and React
keys all use it.

Reason: ID is not unique (Part 1, point 1). The row number is always unique. It also never
changes, because the generator gives the same data every time and I never reorder, add or
remove anything in that array.

I know the usual advice is "do not use the array index as a key". That advice is about the
index in the list that is being rendered, because that index changes when the list is
sorted, filtered or an item is removed. I am not using that. Sorting and filtering in my app
make new lists of row numbers, they do not move the rows. So a doctor keeps the same row
number in every sort, filter and grouping.

I also thought about a key made of ID + index. It does not help. If the index is stable
then the index alone is enough, and if the index is not stable then ID + index is also not
stable.

When this would stop working: if rows could be added, deleted or loaded again in a
different order (for example from a real API). In that case I would ask the backend for a
proper unique key. If that is not possible, I would build the key once at load time as ID
plus a counter for repeated IDs (`HCP-009973` and `HCP-009973#2`) and keep it on the record.
Only the key would change, the rest of the design stays the same.

### Grouping and subtotals

- Subtotals are for the rows that match the current search and region filter. So the count
  and the sums always match what is inside the group.
- An edit is added to the subtotal only after the validator accepts it. Pending and rejected
  edits are not counted.
- A collapsed group still shows its subtotals.
- All groups are open when the app loads.
- When no number column is sorted, groups are in A to Z order.

### Sorting

- Clicking a column goes ascending, then descending, then no sort. Only one column at a time.
- Rows are sorted inside their territory. A row never moves to another group.
- No sort means the original order from the generator.
- If two rows have the same value they stay in their original order.
- For values that do not compare properly:
  - Calls as a string is compared as a number.
  - Null specialty and empty CPI always go to the bottom, in ascending and in descending
    both. I did not want missing data to come on top.
  - ID is compared as text. It works because the IDs are padded with zeros.
- When I sort a number column (Calls, TRx, NRx, CPI), the regions and territories also get
  reordered by their own total of that column. For text columns (ID, name, specialty) the
  groups stay A to Z, because a group has no single name or specialty.
- After an edit is accepted, I do not sort again. The row stays where it is until the user
  clicks sort again. I did this for two reasons. The row should not jump away from the user
  just after editing it. And I did not want to sort 50,000 rows on every edit. The subtotals
  and CPI still update immediately.

### CPI

- For a row: Calls / TRx x 100, using the saved Calls value.
- For a group: total Calls / total TRx x 100. I do not take the average of the row CPIs,
  because then a doctor with very few prescriptions would affect the number as much as a
  doctor with many.
- If TRx is 0 (or the group total of TRx is 0), I show a dash. This also covers 0 / 0. The
  `cpi` function returns null in this case, so NaN or Infinity can never come on screen.
- A row with TRx = 0 still adds its Calls to the group total.
- I show CPI with one decimal.

### Search and filter

- Search checks name and ID. It is not case sensitive and it matches anywhere in the text.
- Search and region filter work together (both must match).
- When the user types in search, I open all groups, so the groups that have matches are
  visible. The user can still collapse a group after that. One side effect: groups that were
  collapsed before searching are open when the search is cleared.
- Groups with no matching rows are hidden.

### Editing

- Only Calls can be edited. Enter saves, Esc or clicking outside cancels.
- Only whole numbers from 0 and above are allowed. For anything else the input shows as
  invalid and I do not call the validator.
- What if the user edits a cell that is still pending? I do not allow it. The pending cell
  is locked and cannot be clicked, and the reducer also ignores a second edit on it. I chose
  this because the validator call cannot be cancelled. If two calls were running for the same
  cell I would need a rule for which answer wins, and locking is simpler and clear for the
  user.
- If the user enters the same value that is already saved, nothing happens. No validator
  call and no undo entry.
- When an edit is rejected, the cell goes back to the saved value and shows red with the
  reason. The reason is in the tooltip and also in the footer. It stays until the user opens
  that cell again. When they open it, the input has the rejected value so they can correct
  it.
- The random 503 error is handled the same as any rejection. I do not retry automatically.
- A cell shows as edited (blue) only while its value is different from the original. If undo
  takes it back to the original, the blue goes away.
- If the user scrolls away while typing in a cell, the typed text is lost, because that row
  is removed from the DOM. A pending edit is safe because it is in the state.

### Undo and redo

- Only accepted edits go in the history. Rejected or cancelled edits do not.
- Redo does not call the validator again, because that value was already accepted once.
- A new edit clears the redo list.
- Undo is allowed while another edit is pending. The history stays correct because I read
  the "from" value at the time the edit is accepted, not when it was typed.
- Shortcuts are Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z. They do not run when the cursor is in an
  input, so normal text undo still works there.
- Edits and history are only in memory. A page refresh clears them.

### Theme

- The tenant can be changed from the dropdown, or with `?tenant=meridian` in the URL.
- Rules for a valid value: a colour must be like `#RGB` or `#RRGGBB`, radius must be a number
  from 0 to 24, app name must not be empty.
- If radius is out of range I use the default. I do not adjust it to the nearest limit.
- An unknown tenant name gets the default theme.
- The colours for pending, edited and rejected cells are fixed and do not come from the
  theme. Each one also has its own icon. This way they can be told apart in any theme.
- One thing I did not handle: a tenant can give valid colours that are hard to read
  together, like light text on a light background.

### Footer

- "rows in DOM" is the number of rows rendered right now (group rows and doctor rows) out of
  the total rows in the list.
- For "last operation timing" I show two numbers: time of the last filter and group, and
  time of the last sort.
