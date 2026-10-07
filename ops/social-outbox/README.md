# StripUnion Native Social Outbox v1

The social outbox owns social-delivery state. Editorial publication does not depend on Buffer, Telegram, X, or any other transport.

## Event states

- `reconcile_required`: historical publication may already have partial delivery. Never blind-send.
- `pending`: safe to attempt delivery.
- `retryable`: prior attempt failed; retry after `next_attempt_at`.
- `scheduled`: provider accepted the post into a future queue slot.\n- `delivered`: provider confirms the post was actually sent/published.
- `failed`: non-retryable failure.
- `skipped`: intentionally not distributed.

## Event identity

One file per publication/channel:

`ops/social-outbox/events/<source>__<slug>__<channel>.json`

The `idempotency_key` is stable and must be checked before any future provider adapter sends.

## Rollout

1. Recovery-era publication ledgers with pending distribution are imported as `reconcile_required`.
2. The worker ignores `reconcile_required`, preventing duplicate historical sends.
3. New publication integration will enqueue provider-specific `pending` events only after recovery debt is cleared.
4. Buffer remains an adapter, not a publication dependency. X Direct can be added later without changing the outbox contract.

The scheduled workflow defaults to send-disabled until `SOCIAL_OUTBOX_SEND_ENABLED=true` is configured.
