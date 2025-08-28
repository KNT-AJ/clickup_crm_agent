# Authentication & OAuth

Source: https://developer.clickup.com/docs/authentication

## Personal token

- Header: `Authorization: {personal_token}`
- How to generate your token:
  1. Log in to ClickUp
  2. Avatar → Settings → Apps (or https://app.clickup.com/settings/apps)
  3. Under API Token click Generate/Regenerate → Copy token
- Personal tokens begin with `pk_` and currently do not expire.

## OAuth 2.0 (Authorization Code)

- Authorization URL: `https://app.clickup.com/api?client_id={client_id}&redirect_uri={redirect_uri}&state={optional_state}`
- Access token URL: `POST https://api.clickup.com/api/v2/oauth/token`
- Steps:
  1) Create an OAuth app (owner/admin). Get client_id and client_secret.
  2) Redirect user to the authorization URL.
  3) Exchange `code` for access token using `POST /reference/getaccesstoken`.
- Endpoint: `POST /reference/getaccesstoken`
  - Body includes: client_id, client_secret, code
  - Returns: access token used in `Authorization` header
  - Note: Today tokens don’t expire (subject to change).

## Authorized Workspaces

- Endpoint: `GET /reference/getauthorizedteams`
  - Returns Workspaces authorized for the current token.

## Required headers

- Use `Content-Type: application/json` for JSON endpoints.
- Attachments use `multipart/form-data`.

## Common auth errors

Source: https://developer.clickup.com/docs/common_errors

- Authorization Header Required (OAUTH_017)
- Client Not Found (OAUTH_010)
- Redirect URI not passed (OAUTH_017)
- Redirect URI mismatch (OAUTH_007)
- Team not authorized (OAUTH_023, OAUTH_026, OAUTH_027, OAUTH_029–045)
- Token not found (OAUTH_019, OAUTH_021, OAUTH_025, OAUTH_077)
