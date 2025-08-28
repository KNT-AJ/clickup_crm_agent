# Common errors & FAQ

Sources: https://developer.clickup.com/docs/common_errors and https://developer.clickup.com/docs/faq

## Common errors
- CORS blocks when calling API directly from browser; use a server proxy.
- Rate limit reached — HTTP 429. See rate-limits.md.
- Team not authorized — OAUTH_023/026/027/029–045. Ensure scopes and workspace authorization.
- Token not found — OAUTH_019/021/025/077.
- Authorization header required — OAUTH_017.
- Client not found — OAUTH_010.
- Redirect URI missing — OAUTH_017.
- Redirect URI mismatch — OAUTH_007.
- Webhook configuration already exists — OAUTH_171.

## Terminology (v2/v3)
- team = Workspace; team_id = Workspace ID
- group_id = Team (group of users)
- Projects = legacy term for Folders

## Roles
- 1 owner, 2 admin, 3 member, 4 guest

## Headers
- Use `Content-Type: application/json` except where multipart/form-data is required (attachments)
