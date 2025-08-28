# Comments

Source: https://developer.clickup.com/docs/comments and https://developer.clickup.com/docs/comment-formatting

## Endpoints
- Create: `/reference/createtaskcomment`, `/reference/createlistcomment`, `/reference/createchatviewcomment`
- Get: `/reference/gettaskcomments`, `/reference/getlistcomments`, `/reference/getchatviewcomments`

## Formatting
- Plain text plus rich formatting blocks (bold, italic, lists, code, links, emoji, mentions)
- Example hyperlink embed payload shape is supported; to tag people you’ll need their user IDs (see `GET /reference/getauthorizedteams`).

## Related webhooks
- taskCommentPosted, taskCommentUpdated
- Webhook payloads embed the comment block array and text content alongside user info
