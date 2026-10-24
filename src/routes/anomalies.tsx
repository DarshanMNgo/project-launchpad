import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ALERTS, BUILDINGS, bName, fmt, type Alert } from "@/lib/pcrg";
import { useLocal, useRole } from "@/lib/role";
import { Btn, PageHeader, Panel, Select, Tag, sevTone } from "@/components/kit";

export const Route = createFileRoute("/anomalies")({
  head: () => ({
    meta: [
      { title: "Anomalies & Actions — PCRG" },
      { name: "description", content: "Detected resource anomalies with evidence, probable cause and ranked actions." },
      { property: "og:title", content: "Anomalies & Actions — PCRG" },
      { property: "og:description", content: "Detected resource anomalies with evidence, probable cause and ranked actions." },
    ],
  }),
  component: Anomalies,
});

type State = Record<string, { status: string; log: { at: string; by: string; what: string }[] }>;
const SEV = { critical: 4, high: 3, medium: 2, low: 1 } as const;
const CONF = { high: 3, medium: 2, low: 1 } as Record<string, number>;
const rank = (a: Alert) => SEV[a.severity] * 10 + (CONF[a.confidence] ?? 1) * 2 + (a.ratio ?? 1);

function Anomalies() {
  const [st, setSt] = useLocal<State>("pcrg-alerts", {});
  const [role] = useRole();
  const [b, setB] = useState("all");
  const [sev, setSev] = useState("all");
  const [kind, setKind] = useState("all");
  const kinds = [...new Set(ALERTS.map((a) => a.kind))];
  const list = useMemo(() => ALERTS.filter((a) => (b === "all" || a.building_id === b) && (sev === "all" || a.severity === sev) && (kind === "all" || a.kind === kind))
    .sort((x, y) => rank(y) - rank(x)), [b, sev, kind]);
  const [sel, setSel] = useState<string | null>(list[0]?.id ?? null);
  const a = ALERTS.find((x) => x.id === sel);
  const status = (id: string) => st[id]?.status ?? "open";
  const act = (id: string, s: string) => {
    if (role === "Viewer / Judge") return;
    const cur = st[id] ?? { status: "open", log: [] };
    setSt({ ...st, [id]: { status: s, log: [...cur.log, { at: new Date().toISOString().slice(0, 16).replace("T", " "), by: role, what: s }] } });
  };

  return (
    <>
      <PageHeader title="Anomalies & Actions" crumb="Anomalies" desc={`${ALERTS.length} candidate anomalies computed from the dataset, ranked by severity, confidence and deviation. Status changes are stored in this browser (prototype).`}
        right={<div className="flex flex-wrap gap-3">
          <Select label="Building" value={b} onChange={setB} options={[{ value: "all", label: "All" }, ...BUILDINGS.map((x) => ({ value: x.building_id, label: x.building_name }))]} />
          <Select label="Severity" value={sev} onChange={setSev} options={["all", "critical", "high", "medium", "low"].map((v) => ({ value: v, label: v }))} />
          <Select label="Type" value={kind} onChange={setKind} options={[{ value: "all", label: "All" }, ...kinds.map((k) => ({ value: k, label: k }))]} />
        </div>} />
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="max-h-[75vh] space-y-2 overflow-y-auto lg:col-span-2">
          {list.map((x) => (
            <button key={x.id} onClick={() => setSel(x.id)} className={`w-full rounded-lg border p-3 text-left ${sel === x.id ? "border-primary bg-accent" : "bg-card hover:bg-muted"}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{x.kind}</span>
                <Tag tone={sevTone(x.severity)}>{x.severity}</Tag>
              </div>
              <div className="mt-1 flex justify-between text-xs text-muted-foreground"><span>{bName(x.building_id)} · {x.date}</span><span>{status(x.id)}</span></div>
            </button>
          ))}
          {list.length === 0 && <p className="text-sm text-muted-foreground">No anomalies match.</p>}
        </div>
        {a && (
          <Panel className="lg:col-span-3" title={a.kind} sub={`${bName(a.building_id)} · ${a.metric} · event date ${a.date} · detected by batch analysis of historical data`}
            right={<Tag tone={sevTone(a.severity)}>{a.severity}</Tag>}>
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><div className="text-xs text-muted-foreground">Observed</div><div className="num text-xl">{fmt(a.observed, 1)}</div></div>
              <div><div className="text-xs text-muted-foreground">Baseline</div><div className="num text-xl">{fmt(a.baseline, 1)}</div></div>
              <div><div className="text-xs text-muted-foreground">Deviation</div><div className="num text-xl">{a.ratio ? `${fmt(a.ratio, 2)}×` : "—"}</div></div>
            </div>
            <h3 className="mt-5 text-sm font-semibold">Probable cause <Tag>{a.confidence} confidence</Tag></h3>
            <p className="mt-1 text-sm">{a.cause}</p>
            <h3 className="mt-4 text-sm font-semibold">Evidence</h3>
            <ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">
              <li>Day type: {a.evidence.day_type ?? "n/a"}</li>
              <li>Calendar event: {a.evidence.event ?? "none"}</li>
              <li>Manual notes that day: {a.evidence.notes.length ? a.evidence.notes.join("; ") : "none"}</li>
              <li>Source: daily_summary / hourly_streams</li>
            </ul>
            {a.alternatives.length > 0 && <><h3 className="mt-4 text-sm font-semibold">Alternative explanations</h3><ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground">{a.alternatives.map((x) => <li key={x}>{x}</li>)}</ul></>}
            <div className="mt-4 rounded-md bg-secondary p-3 text-sm"><b>Recommended action:</b> {a.action} <span className="text-xs text-muted-foreground">— owner: {a.role}</span></div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Status: <b>{status(a.id)}</b></span>
              {["acknowledged", "assigned", "resolved"].map((s) => <Btn key={s} variant="ghost" disabled={role === "Viewer / Judge"} onClick={() => act(a.id, s)}>{s}</Btn>)}
            </div>
            {st[a.id]?.log.length ? (
              <div className="mt-3 text-xs text-muted-foreground"><b>Audit trail</b>{st[a.id].log.map((l, i) => <div key={i} className="num">{l.at} · {l.by} · {l.what}</div>)}</div>
            ) : null}
          </Panel>
        )}
      </div>
    </>
  );
}
