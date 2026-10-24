import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from "recharts";
import { ALERTS, BUILDINGS, DAILY, DATA, cost, co2, diversionRate, fmt, fmtShort, sumDaily } from "@/lib/pcrg";
import { Kpi, PageHeader, Panel, Table, Tag, sevTone, tooltipStyle } from "@/components/kit";

export const Route = createFileRoute("/buildings/$id")({
  loader: ({ params }) => {
    const b = BUILDINGS.find((x) => x.building_id === params.id);
    if (!b) throw notFound();
    return b;
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.building_name ?? "Building"} — PCRG` },
      { name: "description", content: `Energy, water, solar and waste drill-down for ${loaderData?.building_name}.` },
      { property: "og:title", content: `${loaderData?.building_name ?? "Building"} — PCRG` },
      { property: "og:description", content: `Energy, water, solar and waste drill-down for ${loaderData?.building_name}.` },
    ],
  }),
  component: BuildingPage,
});

function BuildingPage() {
  const b = Route.useLoaderData();
  const id = b.building_id;
  const rows = DAILY.filter((r) => r.building_id === id);
  const last30 = rows.slice(-30);
  const t = sumDaily(last30);
  const grid = Math.max(0, t.elec - t.solar);
  const hourly = DATA.hourly_recent[id] as { t: string; e: number; w: number; s: number; f: number }[];
  const health = (DATA.health as { building_id: string; last_capture: string; missing_hours: number; gap_count: number; duplicates_removed: number; delayed_over_2h: number }[]).find((h) => h.building_id === id)!;
  const alerts = ALERTS.filter((a) => a.building_id === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
  const notes = (DATA.logs as { log_id: string; logged_at: string; building_id: string; note: string | null; stream: string; value: number | null; unit: string | null }[])
    .filter((l) => l.building_id === id && l.note).slice(-6).reverse();
  const fc = DATA.forecasts[id].electricity_kwh;
  const peak = fc.forecast.reduce((m: { v: number; t: string }, x: { v: number; t: string }) => (x.v > m.v ? x : m), fc.forecast[0]);

  return (
    <>
      <PageHeader title={b.building_name} crumb={`Buildings / ${id}`} desc={`${b.building_type} · ${b.floors} floors · ${fmt(b.area_sqm)} m² · capacity ${b.design_capacity}`}
        right={<div className="flex gap-2"><Tag tone={health.missing_hours ? "warn" : "good"}>Last capture {health.last_capture}</Tag><Link to="/buildings" className="text-sm text-primary">← All buildings</Link></div>} />
      <div className="mb-2 text-xs text-muted-foreground">KPIs: last 30 days of record ({last30[0]?.date} → {last30.at(-1)?.date})</div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Grid electricity" value={fmtShort(grid)} unit="kWh" note={`₹${fmtShort(cost(grid))} · ${fmtShort(co2(grid))} kg CO₂ (est.)`} />
        <Kpi label="Water" value={fmt(t.water / 1000, 1)} unit="kL" />
        <Kpi label="Solar" value={fmtShort(t.solar)} unit="kWh" tone="good" note={b.has_solar ? `${b.solar_capacity_kw} kW array` : "No array"} />
        <Kpi label="Diversion" value={fmt(diversionRate(t.composted, t.recycled, t.waste), 1)} unit="%" note={`Contamination ${fmt(t.contamination, 1)}%`} tone="good" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Last 7 days, hourly" sub="Electricity kWh, water L/10, footfall" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={hourly.map((h) => ({ ...h, w10: h.w == null ? null : h.w / 10 }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="t" tick={{ fontSize: 10 }} minTickGap={40} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line dataKey="e" name="Electricity kWh" stroke="var(--chart-1)" dot={false} />
              <Line dataKey="w10" name="Water (L÷10)" stroke="var(--chart-2)" dot={false} />
              <Line dataKey="s" name="Solar kWh" stroke="var(--solar)" dot={false} />
              <Line dataKey="f" name="Footfall" stroke="var(--chart-5)" dot={false} strokeDasharray="3 3" />
            </LineChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground">Gaps in lines are missing readings — not zeros.</p>
        </Panel>
        <Panel title="Next 12 h electricity" sub="Baseline estimate">
          <div className="num text-3xl font-semibold">{fmt(peak.v, 1)} <span className="text-sm text-muted-foreground">kWh peak</span></div>
          <div className="text-sm text-muted-foreground">expected at {peak.t}</div>
          <Link to="/forecasts" search={{ b: id }} className="mt-3 inline-block text-sm text-primary">Open forecast →</Link>
          <div className="mt-5 space-y-1 text-xs">
            <div>Missing hours: <b className="num">{health.missing_hours}</b> in {health.gap_count} gaps</div>
            <div>Duplicates removed: <b className="num">{health.duplicates_removed}</b></div>
            <div>Uploads delayed &gt;2 h: <b className="num">{health.delayed_over_2h}</b></div>
          </div>
        </Panel>
        <Panel title="Waste categories" sub="Daily kg, last 30 days" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={last30}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="wet_organic_kg" stackId="a" name="Wet organic" fill="var(--success)" />
              <Bar dataKey="dry_recyclable_kg" stackId="a" name="Dry recyclable" fill="var(--chart-2)" />
              <Bar dataKey="ewaste_kg" stackId="a" name="E-waste" fill="var(--solar)" />
              <Bar dataKey="hazardous_kg" stackId="a" name="Hazardous" fill="var(--destructive)" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Manual notes" sub="From manual_logs (alias-resolved)">
          {notes.length === 0 ? <p className="text-sm text-muted-foreground">No notes.</p> :
            <ul className="space-y-2 text-sm">{notes.map((n) => <li key={n.log_id}><span className="num text-xs text-muted-foreground">{n.logged_at}</span><br />{n.note}</li>)}</ul>}
        </Panel>
      </div>
      <Panel title="Recent anomalies" className="mt-4">
        <Table head={["Date", "Kind", "Observed / baseline", "Severity", "Action"]}>
          {alerts.map((a) => (
            <tr key={a.id}><td className="num">{a.date}</td><td>{a.kind}</td><td className="num">{fmt(a.observed, 1)} / {fmt(a.baseline, 1)}</td>
              <td><Tag tone={sevTone(a.severity)}>{a.severity}</Tag></td><td className="text-xs">{a.action}</td></tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
