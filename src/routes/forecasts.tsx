import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BUILDINGS, CALENDAR, DATA, bName, fmt } from "@/lib/pcrg";
import { Kpi, PageHeader, Panel, Select, Tag, tooltipStyle } from "@/components/kit";

export const Route = createFileRoute("/forecasts")({
  validateSearch: (s: Record<string, unknown>) => ({ b: typeof s.b === "string" ? s.b : "B01" }),
  head: () => ({
    meta: [
      { title: "Resource Forecasts — PCRG" },
      { name: "description", content: "6–12 hour electricity and water forecasts per building with uncertainty bands and error metrics." },
      { property: "og:title", content: "Resource Forecasts — PCRG" },
      { property: "og:description", content: "6–12 hour electricity and water forecasts per building with uncertainty bands and error metrics." },
    ],
  }),
  component: Forecasts,
});

type Pt = { t: string; v: number | null; lo?: number | null; hi?: number | null };

function Forecasts() {
  const { b } = Route.useSearch();
  const nav = useNavigate({ from: "/forecasts" });
  const [metric, setMetric] = useState<"electricity_kwh" | "water_litres">("electricity_kwh");
  const [h, setH] = useState("12");
  const f = DATA.forecasts[b]?.[metric];
  const ev = DATA.forecast_eval[b]?.[metric]?.[h];
  if (!f) return <p>Unknown building.</p>;
  const fc: Pt[] = f.forecast.slice(0, Number(h));
  const series = [
    ...f.observed.map((o: Pt) => ({ t: o.t, obs: o.v })),
    ...fc.map((x) => ({ t: x.t, fc: x.v, band: [x.lo, x.hi] })),
  ];
  const peak = fc.reduce((m, x) => ((x.v ?? 0) > (m.v ?? 0) ? x : m), fc[0]);
  const unit = metric === "electricity_kwh" ? "kWh" : "L";
  const originDate = f.origin.slice(0, 10);
  const cal = CALENDAR.find((c) => c.date === originDate);
  const lastObs = f.observed.at(-1)?.v;

  return (
    <>
      <PageHeader title="Resource Forecasts" crumb="Forecasts" desc="Baseline estimate — not an ML model. Forecast issued from the last capture in the historical dataset, not live."
        right={<div className="flex flex-wrap gap-3">
          <Select label="Building" value={b} onChange={(v) => nav({ search: { b: v } })} options={BUILDINGS.map((x) => ({ value: x.building_id, label: x.building_name }))} />
          <Select label="Metric" value={metric} onChange={(v) => setMetric(v as typeof metric)} options={[{ value: "electricity_kwh", label: "Electricity (kWh)" }, { value: "water_litres", label: "Water (L)" }]} />
          <Select label="Horizon" value={h} onChange={setH} options={["6", "9", "12"].map((x) => ({ value: x, label: `${x} hours` }))} />
        </div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Expected peak" value={fmt(peak.v, 1)} unit={unit} note={`at ${peak.t}`} />
        <Kpi label={`MAE (${h}h)`} value={fmt(ev?.mae, 2)} unit={unit} note={`Held-out ${DATA.forecast_validation.start} → ${DATA.forecast_validation.end}`} />
        <Kpi label={`RMSE (${h}h)`} value={fmt(ev?.rmse, 2)} unit={unit} note={`${ev?.n ?? 0} hourly points`} />
        <Kpi label="Level factor" value={fmt(f.level_factor, 2)} unit="×" note="Last 6 h actual ÷ baseline" />
      </div>
      <Panel className="mt-6" title={`${bName(b)} — ${metric === "electricity_kwh" ? "electricity" : "water"}, next ${h} h`} sub={`Origin ${f.origin}. Shaded band = 10th–90th percentile of same-hour history × level factor.`}>
        <ResponsiveContainer width="100%" height={340}>
          <ComposedChart data={series}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={30} />
            <YAxis tick={{ fontSize: 10 }} label={{ value: unit, angle: -90, position: "insideLeft", fontSize: 10 }} />
            <Tooltip {...tooltipStyle} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Area dataKey="band" name="Uncertainty (P10–P90)" fill="var(--chart-1)" fillOpacity={0.15} stroke="none" />
            <Line dataKey="obs" name="Observed" stroke="var(--chart-5)" dot={false} />
            <Line dataKey="fc" name="Baseline forecast" stroke="var(--chart-1)" strokeDasharray="5 3" strokeWidth={2} dot={{ r: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      </Panel>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Explanatory factors">
          <ul className="space-y-1 text-sm">
            <li>Recent usage: last reading <b className="num">{fmt(lastObs, 1)} {unit}</b>, level factor {fmt(f.level_factor, 2)}×</li>
            <li>Day type on origin: <Tag>{cal?.day_type ?? "unknown"}</Tag></li>
            <li>Scheduled event: {cal?.event ? <Tag tone="warn">{cal.event}</Tag> : "none"}</li>
            <li>Weather: {fmt(cal?.avg_temp_c, 1)} °C, rainfall {fmt(cal?.rainfall_mm, 1)} mm</li>
          </ul>
        </Panel>
        <Panel title="Method">
          <p className="text-sm text-muted-foreground">For each target hour: median of the same hour over the previous 28 days on the same calendar day type (falls back to all days if &lt;3 samples), multiplied by a recent-level factor clamped to 0.6–1.6. Evaluated chronologically — forecasts issued daily over the last 21 days using only data before each origin, so no future data leaks. A compact gradient-boosting model on these same features is the planned next step; it would run on edge hardware in milliseconds.</p>
        </Panel>
      </div>
    </>
  );
}
