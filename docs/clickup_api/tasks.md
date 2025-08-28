# Tasks

Sources: 
- Overview/creation: https://developer.clickup.com/docs/tasks
- Filters: https://developer.clickup.com/docs/taskfilters and https://developer.clickup.com/docs/filter-views
- Links/relationships: https://developer.clickup.com/docs/tasks
- Attachments: https://developer.clickup.com/docs/attachments

## Core properties (create/update)
- name, description or markdown_description
- assignees[] (user IDs)
- status (string)
- priority (1 urgent, 2 high, 3 normal, 4 low)
- start_date, due_date (ms since epoch; can be strings on some endpoints)
- tags[]
- custom_fields[]: [{ id, value, value_options? }]
- time_estimate (ms), points (number)
- parent (task id for subtasks)
- links_to (array of task IDs to link)

Note on escaping:
- Escape double quotes inside JSON text fields, e.g. `{"description": "He said: \"hi\""}`

## Subtasks and access
- A task is a subtask if `parent` is not null.
- Use `subtasks=true` on GET task listing endpoints to include subtasks.
- Access via member routes:
  - `GET /api/v2/task/{task_id}/member`
  - `GET /api/v2/list/{list_id}/member`

## Attachments
- Endpoint: `POST /reference/createtaskattachment`
- Headers: `Content-Type: multipart/form-data`
- Field: `attachment[]` (attachment[0], attachment[1], ...)
- Limits: up to 1 GB per file
- Errors: GBUSED_005 when storage limit exceeded

## Linked tasks and dependencies
- Add link: `POST /reference/addtasklink`
- Delete link: `DELETE /reference/deletetasklink`
- Task payloads include `linked_tasks[]` and `dependencies[]` arrays.

## Filtering tasks by custom fields
- Endpoints:
  - `GET /reference/gettasks` (within a List)
  - `GET /reference/getfilteredteamtasks` (across Workspace)
- Query param `custom_fields` is a stringified JSON array:
  - Each object: `{ field_id, operator, value }`
  - Operators include: =, <, <=, >, >=, !=, IS NULL, IS NOT NULL, RANGE, ANY, ALL, NOT ANY, NOT ALL
- RANGE value can be:
  - Array: `[low, high]`
  - Object: `{ low_value, high_value }`

## Filtering via view-style filters
- Filters are objects with `{ field, op, values }` combined with groups/ops.
- Common fields: archived, assignee, priority, status, tag, recurring, dueDate/startDate/dateCreated/dateUpdated/dateDone/dateClosed, and `cf_{field_id}` for custom fields.
- Date values support dynamic operators like `today`, `yesterday`, `overdue`, and ranges via `RA`.

## Webhook task events (selected)
- taskCreated, taskUpdated, taskDeleted
- taskPriorityUpdated, taskStatusUpdated, taskAssigneeUpdated
- taskDueDateUpdated, taskTagUpdated, taskMoved
- taskCommentPosted, taskCommentUpdated
- taskTimeEstimateUpdated, taskTimeTrackedUpdated

See payload examples in Webhooks.
