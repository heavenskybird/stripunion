// A success from weeks ago is not proof that today's auth or data pipeline works.
export function freshSnapshot(snapshot, now = Date.now(), maxAgeMs = 3 * 24 * 60 * 60 * 1000) {
  if (!snapshot?.data?.collectedAt) return null;
  const collected = Date.parse(snapshot.data.collectedAt);
  if (!Number.isFinite(collected) || collected > now || now - collected > maxAgeMs) return null;
  return snapshot;
}
