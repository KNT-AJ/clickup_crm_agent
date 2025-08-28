# Webhooks

Sources: https://developer.clickup.com/docs/webhooks and https://developer.clickup.com/docs/webhooksignature and https://developer.clickup.com/docs/webhookhealth

## Create a webhook
- `POST /reference/createwebhook`
- Body: `{ endpoint, events[], space_id?, folder_id?, list_id?, task_id? }`
- One location per hierarchy level; most specific applies.
- Returns an id and secret.

## Receiving events
- ClickUp sends POST with `Content-Type: application/json`.
- Common fields: `webhook_id`, `event`, `resource_id`, `history_items[]`, `before`, `after`.
- Use `{{webhook_id}}:{{history_item_id}}` as an idempotency key.
- Types and caveats:
  - history_items[x].user.id is an integer
  - Unset booleans may be null
  - Custom field values aren’t normalized; cast as needed

## Signature verification
- Header: `X-Signature`
- HMAC SHA-256 of the raw body using the webhook secret; hex digest.
- Compare computed signature with header.

## Health and retries
- Active → Failing if non-2xx or >7s response; retried up to 5x per event.
- Suspended at fail_count 100 or on immediate 401.
- Reactivate: `PUT /api/v2/webhook/{webhook_id}`
- Monitor: `GET /api/v2/webhook/{webhook_id}`

## Task events (selection)
- taskCreated, taskUpdated, taskDeleted
- taskPriorityUpdated, taskStatusUpdated, taskAssigneeUpdated
- taskDueDateUpdated, taskTagUpdated, taskMoved
- taskCommentPosted, taskCommentUpdated
- taskTimeEstimateUpdated, taskTimeTrackedUpdated

See docs for detailed payload examples for Task, List, Space, Folder, Automation, Goal/Key Result events.
