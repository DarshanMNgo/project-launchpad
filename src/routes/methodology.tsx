import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { BUILDINGS, CO2_KG_PER_KWH, COMPOST_RATIO, DATA, KG_PER_BAG, PUMP_KWH_PER_KL, TARIFF_INR_PER_KWH, fmt } from "@/lib/pcrg";
import { PageHeader, Panel, Table, Tag } from "@/components/kit";

export const Route = createFileRoute("/methodology")({
  head: () => ({
    meta: [
      { title: "Model & Methodology — PCRG" },
      { name: "description", content: "Classifier metrics, confusion matrix, forecast method, formulas, assumptions and limitations." },
      { property: "og:title", content: "Model & Methodology — PCRG" },
      { property: "og:description", content: "Classifier metrics, confusion matrix, forecast method, formulas, assumptions and limitations." },
    ],
  }),
  component: Method,
});

function Method() {
  const m = DATA.model;
  const max = Math.max(...m.confusion.flat());
  const [hw, setHw] = useState({ meter: 6000, gateway: 4500, bins: 4 * 3500, install: 3000 });
  const per = hw.meter + hw.gateway + hw.bins + hw.install;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const evals = DATA.forecast_eval as any;
  return (
    <>
      <PageHeader title="Model & Methodology" crumb="Methodology" desc={`Dataset: ${DATA.dataset}. Artefacts generated ${DATA.generated_at} by scripts/build_data.py.`} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="Waste classifier" right={<Tag tone="good">trained / evaluated</Tag>}>
          <p className="text-sm">{m.name}. Features: weight_g, moisture_pct, metal_signal, transparency, acoustic_hardness. Stratified 80/20 split ({m.train_rows}/{m.val_rows}); final model refit on all labelled rows for test inference.</p>
          <div className="mt-3 flex gap-6 text-sm"><div>Accuracy <b className="num">{fmt(m.accuracy * 100, 1)}%</b></div><div>Macro-F1 <b className="num">{fmt(m.macro_f1, 3)}</b></div><div>Latency <b className="num">{fmt(m.latency_ms, 1)} ms</b>/event</div></div>
          <Table head={["Class", "Precision", "Recall", "F1", "Support"]}>
            {m.per_class.map((c: { class: string; precision: number; recall: number; f1: number; support: number }) => (
              <tr key={c.class}><td>{c.class}</td><td className="num">{fmt(c.precision, 3)}</td><td className="num">{fmt(c.recall, 3)}</td><td className="num">{fmt(c.f1, 3)}</td><td className="num">{c.support}</td></tr>
            ))}
          </Table>
        </Panel>
        <Panel title="Confusion matrix" sub="Rows = actual, columns = predicted (validation split)">
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead><tr><th />{m.labels.map((l: string) => <th key={l} className="px-1 pb-1 font-normal text-muted-foreground">{l.slice(0, 6)}</th>)}</tr></thead>
              <tbody>
                {m.confusion.map((row: number[], i: number) => (
                  <tr key={i}><th className="pr-2 text-right font-normal text-muted-foreground">{m.labels[i]}</th>
                    {row.map((v, j) => <td key={j} className="num h-10 w-14 border text-center" style={{ background: `color-mix(in oklab, var(--primary) ${(v / max) * 80}%, transparent)` }}>{v}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3 className="mt-4 text-sm font-semibold">Feature importance</h3>
          {m.importance.map((f: { feature: string; value: number }) => (
            <div key={f.feature} className="mt-1 flex items-center gap-2 text-xs"><span className="w-32">{f.feature}</span><div className="h-2 rounded bg-primary" style={{ width: `${f.value * 300}px` }} /><span className="num">{fmt(f.value, 3)}</span></div>
          ))}
        </Panel>
        <Panel title="Forecast method" right={<Tag tone="warn">demo baseline</Tag>}>
          <p className="text-sm">Same-hour, same-day-type median over the prior 28 days × recent level factor. Validation {DATA.forecast_validation.start} → {DATA.forecast_validation.end}, chronological, horizons 6/9/12 h.</p>
          <Table head={["Building", "Elec MAE 12h (kWh)", "Elec RMSE", "Water MAE 12h (L)", "Water RMSE"]}>
            {BUILDINGS.map((b) => { const e = evals[b.building_id]; return (
              <tr key={b.building_id}><td>{b.building_id}</td><td className="num">{fmt(e.electricity_kwh["12"]?.mae, 2)}</td><td className="num">{fmt(e.electricity_kwh["12"]?.rmse, 2)}</td><td className="num">{fmt(e.water_litres["12"]?.mae, 1)}</td><td className="num">{fmt(e.water_litres["12"]?.rmse, 1)}</td></tr>
            ); })}
          </Table>
        </Panel>
        <Panel title="Formulas & assumptions">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Cost = grid kWh × ₹{TARIFF_INR_PER_KWH}</li>
            <li>Emissions = grid kWh × {CO2_KG_PER_KWH} kg CO₂</li>
            <li>Grid kWh = metered electricity − on-site solar (floored at 0)</li>
            <li>Water-pumping energy = L ÷ 1,000 × {PUMP_KWH_PER_KL} kWh (estimate, not added)</li>
            <li>Total waste = wet organic + dry recyclable + e-waste + hazardous</li>
            <li>Diversion = (composted + recycled) ÷ total waste</li>
            <li>Compost output = composted ÷ {COMPOST_RATIO}</li>
            <li>Units: 1 unit = 1 kWh; 1 kL = 1,000 L; 1 bag ≈ {KG_PER_BAG} kg (estimated)</li>
            <li>Hourly dedupe key: timestamp + building_id, first arrival retained</li>
            <li>Missing / out-of-range values kept as missing — never zero</li>
          </ul>
        </Panel>
        <Panel title="Per-building hardware budget" sub="Assumed prototype costs (₹) — not supplier quotes. Edit to model scenarios.">
          {(Object.keys(hw) as (keyof typeof hw)[]).map((k) => (
            <label key={k} className="mt-2 flex items-center justify-between text-sm"><span className="capitalize">{k === "bins" ? "Smart-bin sensors (4)" : k === "meter" ? "Meter interface / CT clamps" : k === "gateway" ? "Edge gateway + storage" : "Installation"}</span>
              <input type="number" value={hw[k]} onChange={(e) => setHw({ ...hw, [k]: Number(e.target.value) })} className="num h-8 w-28 rounded border bg-card px-2 text-right" /></label>
          ))}
          <div className="mt-3 border-t pt-2 text-sm">Per building: <b className="num">₹{fmt(per)}</b> · 8 buildings: <b className="num">₹{fmt(per * 8)}</b> · 30 buildings: <b className="num">₹{fmt(per * 30)}</b></div>
        </Panel>
        <Panel title="Limitations">
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>All data is synthetic and historical; nothing here is live.</li>
            <li>Forecasts are a statistical baseline, not a trained ML model.</li>
            <li>Anomaly causes are hypotheses backed by evidence, not confirmed root causes.</li>
            <li>Alert status and role switching are browser-local prototypes, not secure multi-user storage.</li>
            <li>Smart-bin classes and daily waste categories do not align one-to-one.</li>
            <li>Challenge results are before/after comparisons, confounded by season and events.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
