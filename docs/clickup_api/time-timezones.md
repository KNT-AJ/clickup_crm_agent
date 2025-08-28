# Time & Timezones

Source: https://developer.clickup.com/docs/general-time

- Dates accepted as milliseconds since Unix epoch (and sometimes strings depending on endpoint).
- API returns timestamps in UTC.
- Task start/due dates without explicit time default to 4am in the user’s local timezone.
- Changing a user’s timezone doesn’t retroactively adjust existing task dates.
