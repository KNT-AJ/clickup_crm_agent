# Custom Fields

Source: https://developer.clickup.com/docs/customfields

## Types (selected)
- url, drop_down, labels, email, phone, date, short_text, text, checkbox, number, currency
- tasks (link tasks without relationships), users (people/teams), emoji (rating), progress (automatic/manual), location

## Set values examples
- Text: `{ "value": "Some text" }`
- URL: `{ "value": "https://clickup.com" }`
- Email: `{ "value": "[email protected]" }`
- Phone: `{ "value": "+1 123 456 7890" }`
- Number: `{ "value": -28 }`
- Currency: `{ "value": 80000 }`
- Date: `{ "value": 1565993299379, "value_options": { "time": true } }`
- Dropdown: `{ "value": "option_1_id" }`
- Labels: `{ "value": ["label_1_id", "label_2_id"] }`
- Users: `{ "value": { "add": ["user_id_1"], "rem": ["user_id_3"] } }`
- Tasks: `{ "value": { "add": ["task_id_1"], "rem": ["task_id_3"] } }`
- Emoji rating: `{ "value": 4 }` (≤ count)
- Manual progress: `{ "value": { "current": 20 } }`

## Type configuration examples
- Currency: `{ precision: 2, currency_type: "USD", default: 10 }`
- Dropdown: options array with id/name/color/orderindex
- Labels: label options with id/label/color/orderindex
- Emoji rating: `{ code_point: "1f613", count: 5 }`
- Progress automatic: `{ method: "automatic", tracking: { subtasks, assigned_comments, checklists } }`
- Progress manual: `{ method: "manual", start: 0, end: 100, current: 50 }`

## Filtering with custom fields
- Use `custom_fields` query param with stringified JSON array of `{ field_id, operator, value }`
- Operators: `=, <, <=, >, >=, !=, IS NULL, IS NOT NULL, RANGE, ANY, ALL, NOT ANY, NOT ALL`
- RANGE value styles: `[low, high]` or `{ low_value, high_value }`

See also: Accessible custom fields (`/reference/getaccessiblecustomfields`).
