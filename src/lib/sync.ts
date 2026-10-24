export type Reading = { id: string; building_id: string; captured_at: string; electricity_kwh: number };

/**
 * Idempotent reconciliation: dedupe by stable id, never overwrite a stored
 * reading whose capture time is newer than or equal to the incoming one.
 */
export function reconcile(store: Record<string, Reading>, incoming: Reading[]) {
  const next = { ...store };
  const log: { id: string; result: "inserted" | "duplicate" | "stale" }[] = [];
  for (const r of incoming) {
    const cur = next[r.id];
    if (!cur) { next[r.id] = r; log.push({ id: r.id, result: "inserted" }); }
    else if (cur.captured_at >= r.captured_at) log.push({ id: r.id, result: cur.captured_at === r.captured_at ? "duplicate" : "stale" });
    else { next[r.id] = r; log.push({ id: r.id, result: "inserted" }); }
  }
  return { store: next, log };
}
