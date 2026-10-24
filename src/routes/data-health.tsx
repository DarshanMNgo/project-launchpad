import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BUILDINGS, DATA, bName, fmt } from "@/lib/pcrg";
import { reconcile, type Reading } from "@/lib/sync";
import { Btn, Kpi, PageHeader, Panel, Select, Table, Tag } from "@/components/kit";

export const Route = createFileRoute("/data-health")({
  head: () => ({
    meta: [
      { title: "Data Health — PCRG" },
      { name: "description", content: "Telemetry freshness, gaps, delayed uploads, duplicates and manual-log alias resolution." },
      { property: "og:title", content: "Data Health — PCRG" },
      { property: "og:description", content: "Telemetry freshness, gaps, delayed uploads, duplicates and manual-log alias resolution." },
    ],
  }),
  component: Health,
});

type H = { building_id: string; rows: number; expected: number; missing_hours: number; gap_count: number; gaps: { start: string; hours: number }[]; duplicates_removed: number; delayed_over_2h: number; max_delay_h: number; median_delay_min: number; last_capture: string; null_values: number };
type Log = { log_id: string; raw_building: string; building_id: string | null; stream: string; raw_value: number | null; raw_unit: string | null; value: number | null; unit: string | null; estimated: boolean; status: string };

function Health() {
  const health = DATA.health as H[];
  const logs = DATA.logs as Log[];
  const [thr, setThr] = useState("2");
  const ref = health.map((h) => h.last_capture).sort().at(-1)!;
  const stateOf = (h: H) => {
    const age = (new Date(ref.replace(" ", "T")).getTime() - new Date(h.last_capture.replace(" ", "T")).getTime()) / 3.6e6;
    return age <= Number(thr) ? "online" : age <= Number(thr) * 6 ? "stale" : "offline";
  };
  const unresolved = logs.filter((l) => l.status === "needs_review");
  const estimated = logs.filter((l) => l.estimated);

  // Offline simulation
  const [simB, setSimB] = useState("B03");
  const [offline, setOffline] = useState(false);
  const [queue, setQueue] = useState<Reading[]>([]);
  const [store, setStore] = useState<Record<string, Reading>>({});
  const [syncLog, setSyncLog] = useState<string[]>([]);
  const capture = () => {
    const n = queue.length + Object.keys(store).length;
    const t = new Date(Date.UTC(2026, 9, 18, n % 24)).toISOString().slice(0, 16);
    const r: Reading = { id: `${simB}-${t}`, building_id: simB, captured_at: t, electricity_kwh: Math.round(8 + Math.random() * 10) };
    if (offline) setQueue([...queue, r, ...(Math.random() < 0.4 ? [r] : [])]);
    else { const res = reconcile(store, [r]); setStore(res.store); setSyncLog([`${r.id}: inserted (live)`, ...syncLog]); }
  };
  const reconnect = () => {
    const res = reconcile(store, queue);
    setStore(res.store); setQueue([]); setOffline(false);
    setSyncLog([...res.log.map((l) => `${l.id}: ${l.result}`), ...syncLog]);
  };

  return (
    <>
      <PageHeader title="Data Health" crumb="Data Health" desc="Freshness is judged relative to the latest capture in the historical dataset."
        right={<Select label="Freshness threshold" value={thr} onChange={setThr} options={["1", "2", "6"].map((v) => ({ value: v, label: `${v} h` }))} />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Raw hourly rows" value={fmt(DATA.ingest.raw_rows)} />
        <Kpi label="Duplicates removed" value={fmt(DATA.ingest.duplicates_removed)} note="Key: timestamp + building_id; first arrival kept" />
        <Kpi label="Out-of-range values" value={fmt(DATA.ingest.out_of_range_count)} note="Set to missing, never zero" tone="warn" />
        <Kpi label="Unresolved log aliases" value={fmt(unresolved.length)} tone={unresolved.length ? "bad" : "good"} />
      </div>
      <Panel className="mt-6" title="Telemetry status by building">
        <Table head={["Building", "Status", "Last capture", "Coverage", "Missing h", "Largest gap", "Dupes", "Delayed >2h", "Median delay"]}>
          {health.map((h) => {
            const s = stateOf(h);
            return (
              <tr key={h.building_id}>
                <td>{bName(h.building_id)}</td>
                <td><Tag tone={s === "online" ? "good" : s === "stale" ? "warn" : "bad"}>{s}</Tag></td>
                <td className="num text-xs">{h.last_capture}</td>
                <td className="num">{fmt((h.rows / h.expected) * 100, 1)}%</td>
                <td className="num">{h.missing_hours}</td>
                <td className="num text-xs">{h.gaps[0] ? `${h.gaps[0].hours} h @ ${h.gaps[0].start}` : "—"}</td>
                <td className="num">{h.duplicates_removed}</td><td className="num">{h.delayed_over_2h}</td>
                <td className="num">{fmt(h.median_delay_min)} min</td>
              </tr>
            );
          })}
        </Table>
        <p className="mt-2 text-xs text-muted-foreground">Buildings with partial coverage remain in campus totals; coverage % flags the gap.</p>
      </Panel>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Offline gateway simulation" sub="Simulated in this browser — not real edge buffering." right={<Tag tone={offline ? "bad" : "good"}>{offline ? "offline" : "online"}</Tag>}>
          <div className="flex flex-wrap items-end gap-2">
            <Select label="Building" value={simB} onChange={setSimB} options={BUILDINGS.map((b) => ({ value: b.building_id, label: b.building_name }))} />
            <Btn variant="ghost" onClick={() => setOffline(true)} disabled={offline}>Go offline</Btn>
            <Btn variant="ghost" onClick={capture}>Capture reading</Btn>
            <Btn onClick={reconnect} disabled={!offline}>Reconnect & sync</Btn>
          </div>
          <div className="mt-3 text-sm">Queue: {queue.length ? queue.map((q, i) => <Tag key={i} tone="warn">{q.captured_at.slice(11)} pending sync</Tag>) : <span className="text-muted-foreground">empty</span>}</div>
          <div className="mt-2 text-sm">Stored: <b className="num">{Object.keys(store).length}</b> readings</div>
          <div className="num mt-3 max-h-40 overflow-y-auto text-xs text-muted-foreground">{syncLog.map((l, i) => <div key={i}>{l}</div>)}</div>
          <p className="mt-2 text-xs text-muted-foreground">Retries are queued twice at random to show idempotent dedupe by stable ID; older data never overwrites newer readings.</p>
        </Panel>
        <Panel title="Manual log normalisation" sub={`${logs.length} logs · ${estimated.length} bag counts estimated at 8 kg/bag · units→kWh, kL→L`}>
          <Table head={["Log", "Raw building", "Resolved", "Raw", "Normalised", "Status"]}>
            {[...unresolved, ...logs.filter((l) => l.raw_building !== l.building_id && l.status !== "needs_review").slice(0, 8)].map((l) => (
              <tr key={l.log_id}><td className="num">{l.log_id}</td><td>{l.raw_building}</td><td className="num">{l.building_id ?? "—"}</td>
                <td className="num text-xs">{fmt(l.raw_value, 1)} {l.raw_unit}</td><td className="num text-xs">{fmt(l.value, 1)} {l.unit} {l.estimated && <Tag tone="warn">estimated</Tag>}</td>
                <td>{l.status === "needs_review" ? <Tag tone="bad">needs review</Tag> : <Tag tone="good">resolved</Tag>}</td></tr>
            ))}
          </Table>
        </Panel>
      </div>
    </>
  );
}
