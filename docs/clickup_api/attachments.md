# Attachments

Source: https://developer.clickup.com/docs/attachments

- Endpoint: `POST /reference/createtaskattachment`
- Authorization: API token
- Headers: `Content-Type: multipart/form-data`
- File fields: `attachment[]` (attachment[0], attachment[1], ...)
- Optional query: `custom_task_ids`, `team_id`
- Limits: up to 1 GB per file; file types unrestricted
- Error: `GBUSED_005` when account storage limit exceeded
