# Views and Filters

Source: https://developer.clickup.com/docs/views and https://developer.clickup.com/docs/filter-views

## Views
- Create/manage team/space/folder/list views.
- Types: list, board, calendar, gantt (pages like Docs/Whiteboards not supported via API).
- Parent types: Team (7), Space (4), Folder (5), List (6).
- Related endpoints: `/reference/getviewtasks`, `/reference/createteamview`.

## Filter structure
- Individual filter: `{ field, op, values }`.
- Group filters and combine with logical ops: AND/OR.
- Search filter combines as `(all filters) AND search`.

### Common filters
- archived: op EQ/NOT, values: []
- assignee: ops ANY/ALL/NOT ANY/NOT ALL; values: user IDs or "me"
- priority: EQ/NOT with values [-1, 1, 2, 3, 4]
- status: EQ/NOT with names or `{ type: done|open|custom }`
- tag: ANY/ALL/NOT ANY/NOT ALL with tag names
- recurring: EQ/NOT, values: []
- date fields (dueDate, startDate, dateCreated, dateUpdated, dateDone, dateClosed) and `cf_{field_id}`:
  - Operators: EQ/NOT/GT/GTE/LT/LTE/RA
  - Dynamic values: today, yesterday, tomorrow, next7, last7, overdue, earlier, thisweek, thismonth, lastmonth, notNull, null
  - Examples include specific eq and RA ranges

### Set/Not set checks
- Use `values: [null]` for IS SET / IS NOT SET semantics on fields.

## Notes
- Use `GET /reference/getaccessiblecustomfields` to list custom field ids used by filters.
