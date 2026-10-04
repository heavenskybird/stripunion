# WordPress editorial queue

Store GitHub-controlled WordPress publication payloads here. These files are source records for the direct WordPress REST publisher and do not use WPWriter generation credits.

Example:

```json
{
  "title": "Example Guide",
  "slug": "example-guide",
  "excerpt": "Concise search/social summary.",
  "content": "<h2>Section</h2><p>Production-ready HTML.</p>",
  "status": "publish",
  "categories": [123],
  "tags": [456]
}
```

Notes:
- `title`, `slug`, `excerpt` and `content` are required.
- Category/tag IDs are optional and must be real WordPress term IDs; never guess them.
- Do not put credentials, affiliate secrets or private notes in payload files.
- Avoid publishing the same article on both Main and Blog as two indexable copies. Choose one canonical destination or create genuinely distinct content.
