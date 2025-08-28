# Rate limits

Source: https://developer.clickup.com/docs/rate-limits

Per-token limits by Workspace plan:
- Free Forever, Unlimited, Business: 100 requests/minute
- Business Plus: 1,000 requests/minute
- Enterprise: 10,000 requests/minute

If exceeded:
- HTTP 429 response
- Headers include:
  - `X-RateLimit-Limit`: current limit
  - `X-RateLimit-Remaining`: remaining in window
  - `X-RateLimit-Reset`: reset time (Unix ms)
