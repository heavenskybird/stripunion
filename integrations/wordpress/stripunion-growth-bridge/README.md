# StripUnion Growth Bridge

Private WordPress integration for blog.stripunion.com.

## Purpose

On the first transition of a WordPress post into the published state, the plugin dispatches the GitHub Actions workflow:

`social-distribution.yml`

The GitHub workflow creates tracked social copy and queues it through Buffer. This removes any dependency on an active ChatGPT conversation for routine distribution.

## Security

Use a dedicated fine-grained GitHub Personal Access Token:
- Repository access: only `heavenskybird/stripunion`
- Repository permission: Actions = Read and write
- Expiration: 1 year or less

The token is encrypted using WordPress salts + AES-256-GCM when OpenSSL is available.

Never commit the token to this repository.

## Duplicate prevention / retries

- Only first publish transition triggers dispatch.
- Successful posts receive a private post-meta dispatch marker.
- Failed dispatches retry up to 3 times via WP-Cron.
