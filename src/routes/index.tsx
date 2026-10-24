import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, ComposedChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BUILDINGS, CALENDAR, DATES, bName, co2, cost, diversionRate, filterDaily, fmt, fmtShort, pumpingKwh, sumDaily, TARIFF_INR_PER_KWH, CO2_KG_PER_KWH, PUMP_KWH_PER_KL, totalWaste } from "@/lib/pcrg";
import { DateInput, Kpi, PageHeader, Panel, Select, Tag, tooltipStyle } from "@/components/kit";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Campus Overview — PCRG" },
      { name: "description", content: "Campus-wide electricity, water, solar and waste KPIs with cost and emissions estimates." },
      { property: "og:title", content: "Campus Overview — PCRG" },
      { property: "og:description", content: "Campus-wide electricity, water, solar and waste KPIs with cost and emissions estimates." },
    ],
  }),
  component: Overview,
});

const TYPES = ["all", ...Array.from(new Set(BUILDINGS.map((b) => b.building_type)))];

function Overview() {
  const [from, setFrom] = useState(DATES[DATES.length - 30]);
  const [to, setTo] = useState(DATES[DATES.length - 1]);
  const [type, setType] = useState("all");
  const rows = useMemo(() => filterDaily({ from, to, type }), [from, to, type]);
  const t = sumDaily(rows);
  const gridKwh = Math.max(0, t.elec - t.solar);
  const div = diversionRate(t.composted, t.recycled, t.waste);
  const empty = rows.length === 0;

  const trend = useMemo(() => {
    const m = new Map<string, { date: string; elec: number; water: number; waste: number; composted: number; recycled: number; landfill: number }>();
    for (const r of rows) {
      const x = m.get(r.date) ?? { date: r.date, elec: 0, water: 0, waste: 0, composted: 0, recycled: 0, landfill: 0 };
      x.elec += r.electricity_kwh ?? 0; x.water += (r.water_litres ?? 0) / 1000; x.waste += totalWaste(r);
      x.composted += r.composted_kg ?? 0; x.recycled += r.recycled_kg ?? 0; x.landfill += r.landfill_kg ?? 0;
      m.set(r.date, x);
    }
    return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [rows]);
  const events = CALENDAR.filter((c) => c.event && c.date >= from && c.date <= to);

  const byB = BUILDINGS.filter((b) => type === "all" || b.building_type === type).map((b) => {
    const s = sumDaily(rows.filter((r) => r.building_id === b.building_id));
    return { id: b.building_id, name: b.building_name.split(" ").slice(0, 2).join(" "), grid: Math.max(0, s.elec - s.solar), solar: s.solar,
      perOcc: s.occupancy ? s.elec / s.occupancy : 0, div: diversionRate(s.composted, s.recycled, s.waste) };
  });

  return (
    <>
      <PageHeader title="Campus Overview" desc="All figures computed from the filtered daily summary records of the historical synthetic dataset."
        right={<div className="flex flex-wrap gap-3">
          <DateInput label="From" value={from} onChange={setFrom} min={DATES[0]} max={to} />
          <DateInput label="To" value={to} onChange={setTo} min={from} max={DATES[DATES.length - 1]} />
          <Select label="Building type" value={type} onChange={setType} options={TYPES.map((v) => ({ value: v, label: v === "all" ? "All types" : v }))} />
        </div>} />
      <div className="mb-2 text-xs text-muted-foreground">{t.days} days · {rows.length} building-day records · source: daily_summary.xlsx {t.missing > 0 && <Tag tone="warn">{t.missing} records with missing values</Tag>}</div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Grid electricity" value={empty ? "insufficient data" : fmtShort(gridKwh)} unit="kWh" note="Metered minus on-site solar" />
        <Kpi label="Water" value={empty ? "insufficient data" : fmt(t.water / 1000, 1)} unit="kL" note={`Pumping est. ${fmt(pumpingKwh(t.water))} kWh (not added)`} />
        <Kpi label="Solar generation" value={fmtShort(t.solar)} unit="kWh" tone="good" />
        <Kpi label="Total waste" value={fmt(t.waste)} unit="kg" note="Wet + dry + e-waste + hazardous" />
        <Kpi label="Diversion rate" value={div == null ? "insufficient data" : fmt(div, 1)} unit="%" tone="good" note="(Composted + recycled) / total" />
        <Kpi label="Landfill" value={fmt(t.landfill)} unit="kg" tone="warn" />
        <Kpi label="Electricity cost" value={`₹${fmtShort(cost(gridKwh))}`} note={`Estimate @ ₹${TARIFF_INR_PER_KWH}/kWh`} />
        <Kpi label="Emissions" value={fmtShort(co2(gridKwh))} unit="kg CO₂" note={`Estimate @ ${CO2_KG_PER_KWH} kg/kWh`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Electricity & water trend" sub={`Daily totals, ${from} → ${to}. Dashed lines = calendar events.`}>
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="e" tick={{ fontSize: 10 }} label={{ value: "kWh", angle: -90, position: "insideLeft", fontSize: 10 }} />
              <YAxis yAxisId="w" orientation="right" tick={{ fontSize: 10 }} label={{ value: "kL", angle: 90, position: "insideRight", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {events.map((e) => <ReferenceLine key={e.date} yAxisId="e" x={e.date} stroke="var(--warning)" strokeDasharray="4 4" />)}
              <Line yAxisId="e" dataKey="elec" name="Electricity (kWh)" stroke="var(--chart-1)" dot={false} strokeWidth={2} />
              <Line yAxisId="w" dataKey="water" name="Water (kL)" stroke="var(--chart-2)" dot={false} strokeWidth={2} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Waste flows" sub="Daily kg: generated vs composted, recycled, landfill">
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} label={{ value: "kg", angle: -90, position: "insideLeft", fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Area dataKey="composted" stackId="1" name="Composted" fill="var(--success)" stroke="var(--success)" />
              <Area dataKey="recycled" stackId="1" name="Recycled" fill="var(--chart-2)" stroke="var(--chart-2)" />
              <Area dataKey="landfill" stackId="1" name="Landfill" fill="var(--chart-5)" stroke="var(--chart-5)" />
              <Line dataKey="waste" name="Generated" stroke="var(--foreground)" />
            </AreaChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Solar vs grid electricity by building" sub="kWh over selected period">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={byB}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip {...tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="grid" stackId="a" name="Grid kWh" fill="var(--chart-5)" />
              <Bar dataKey="solar" stackId="a" name="Solar kWh" fill="var(--solar)" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Building ranking" sub="Electricity per occupant-day (lower is better). Click to drill down.">
          <div className="space-y-1">
            {[...byB].sort((a, b) => a.perOcc - b.perOcc).map((b, i) => (
              <Link key={b.id} to="/buildings/$id" params={{ id: b.id }} className="flex items-center gap-3 rounded px-2 py-1.5 text-sm hover:bg-muted">
                <span className="num w-5 text-muted-foreground">{i + 1}</span>
                <span className="flex-1">{bName(b.id)}</span>
                <span className="num">{fmt(b.perOcc, 2)} kWh/occ</span>
                <Tag tone="good">{b.div == null ? "—" : `${fmt(b.div, 0)}% div.`}</Tag>
              </Link>
            ))}
          </div>
        </Panel>
      </div>
      <p className="mt-6 text-xs text-muted-foreground">Water-pumping energy = litres / 1,000 × {PUMP_KWH_PER_KL} kWh — shown as an estimate only. All data is synthetic/historical, not live.</p>
    </>
  );
}
