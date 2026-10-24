import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { BUILDINGS, DATA, bName, fmt } from "@/lib/pcrg";
import { Btn, Kpi, PageHeader, Panel, Select, Table, Tag } from "@/components/kit";

export const Route = createFileRoute("/waste")({
  head: () => ({
    meta: [
      { title: "Waste Intelligence — PCRG" },
      { name: "description", content: "Smart-bin waste classification into six classes with confidence and routing guidance." },
      { property: "og:title", content: "Waste Intelligence — PCRG" },
      { property: "og:description", content: "Smart-bin waste classification into six classes with confidence and routing guidance." },
    ],
  }),
  component: Waste,
});

type Pred = { event_id: string; timestamp: string; building_id: string; bin_id: string; weight_g: number; predicted: string; confidence: number; status: string };
const PREDS: Pred[] = DATA.predictions;
const CLASSES = DATA.model.labels as string[];

export function routeFor(cls: string, buildingId: string) {
  const b = BUILDINGS.find((x) => x.building_id === buildingId);
  switch (cls) {
    case "food_organic": return b?.has_composter ? "On-site composter" : "Collect for central composting (no composter here)";
    case "paper_cardboard": return "Dry recycling — keep dry, flatten";
    case "plastic": return "Dry recycling — rinse, sort by type";
    case "glass": return "Glass recycling — separate, handle carefully";
    case "metal": return "Metal recycling";
    case "ewaste": return "Designated e-waste route — authorised recycler only";
    default: return "Review";
  }
}

const PAGE = 25;

function Waste() {
  const [q, setQ] = useState("");
  const [cls, setCls] = useState("all");
  const [bid, setBid] = useState("all");
  const [st, setSt] = useState("all");
  const [page, setPage] = useState(0);
  const rows = useMemo(() => PREDS.filter((p) =>
    (cls === "all" || p.predicted === cls) && (bid === "all" || p.building_id === bid) && (st === "all" || p.status === st) &&
    (!q || p.event_id.toLowerCase().includes(q.toLowerCase()) || p.bin_id.toLowerCase().includes(q.toLowerCase()))), [q, cls, bid, st]);
  const review = PREDS.filter((p) => p.status === "needs_review").length;
  const counts = CLASSES.map((c) => ({ c, n: PREDS.filter((p) => p.predicted === c).length }));

  const exportCsv = () => {
    const csv = "event_id,predicted_class\n" + PREDS.map((p) => `${p.event_id},${p.predicted}`).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "waste_events_test_predictions.csv"; a.click();
  };

  return (
    <>
      <PageHeader title="Waste Intelligence" crumb="Waste" desc={`Random Forest trained on ${DATA.model.train_rows} labelled events; predictions on the ${PREDS.length} unlabelled test events.`}
        right={<Btn onClick={exportCsv}><Download className="h-3.5 w-3.5" /> Export predictions CSV</Btn>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Validation accuracy" value={fmt(DATA.model.accuracy * 100, 1)} unit="%" note={`Stratified 20% hold-out (${DATA.model.val_rows} events)`} />
        <Kpi label="Macro-F1" value={fmt(DATA.model.macro_f1, 3)} />
        <Kpi label="Needs review" value={fmt(review)} tone="warn" note="Confidence < 60%" />
        <Kpi label="Inference latency" value={fmt(DATA.model.latency_ms, 1)} unit="ms/event" tone="good" note="Measured in build environment; target < 2 s" />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {counts.map((c) => <button key={c.c} onClick={() => { setCls(cls === c.c ? "all" : c.c); setPage(0); }} className={`rounded-md border px-3 py-1.5 text-xs ${cls === c.c ? "border-primary bg-accent" : "bg-card"}`}>{c.c} <b className="num">{c.n}</b></button>)}
      </div>
      <Panel className="mt-4" title="Test-event predictions" sub="Test rows were never used for training."
        right={<div className="flex flex-wrap gap-2">
          <input placeholder="Search event / bin" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} className="h-9 rounded-md border bg-card px-2 text-sm" />
          <Select label="" value={bid} onChange={(v) => { setBid(v); setPage(0); }} options={[{ value: "all", label: "All buildings" }, ...BUILDINGS.map((b) => ({ value: b.building_id, label: b.building_name }))]} />
          <Select label="" value={st} onChange={(v) => { setSt(v); setPage(0); }} options={[{ value: "all", label: "Any status" }, { value: "auto", label: "Auto" }, { value: "needs_review", label: "Needs review" }]} />
        </div>}>
        <Table head={["Event", "Time", "Building", "Bin", "Weight g", "Predicted", "Confidence", "Status", "Route"]}>
          {rows.slice(page * PAGE, page * PAGE + PAGE).map((p) => (
            <tr key={p.event_id}>
              <td className="num">{p.event_id}</td><td className="num text-xs">{p.timestamp}</td><td className="text-xs">{bName(p.building_id)}</td>
              <td className="num text-xs">{p.bin_id}</td><td className="num">{fmt(p.weight_g)}</td><td><Tag tone="info">{p.predicted}</Tag></td>
              <td className="num">{fmt(p.confidence * 100, 0)}%</td>
              <td>{p.status === "needs_review" ? <Tag tone="warn">Needs review</Tag> : <Tag tone="good">Auto</Tag>}</td>
              <td className="text-xs">{routeFor(p.predicted, p.building_id)}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>{rows.length} events · page {page + 1} of {Math.max(1, Math.ceil(rows.length / PAGE))}</span>
          <div className="flex gap-2"><Btn variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Prev</Btn><Btn variant="ghost" disabled={(page + 1) * PAGE >= rows.length} onClick={() => setPage(page + 1)}>Next</Btn></div>
        </div>
      </Panel>
      <Panel className="mt-4" title="Schema note">
        <p className="text-sm text-muted-foreground">Smart-bin classes (6) differ from daily-summary fields (wet organic, dry recyclable, e-waste, hazardous). Assumed mapping: food_organic → wet organic; paper/plastic/glass/metal → dry recyclable; ewaste → e-waste. Hazardous has no bin class. Never handle hazardous items through ordinary bins.</p>
      </Panel>
    </>
  );
}
