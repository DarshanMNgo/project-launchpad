import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FIRST_DATE, LAST_DATE, LAST30_DATE, BUILDINGS, COMPOST_RATIO, DATES, circularityScore, compostOutput, diversionRate, filterDaily, fmt, sumDaily } from "@/lib/pcrg";
import { DateInput, Kpi, PageHeader, Panel, Table, Tag, tooltipStyle } from "@/components/kit";

export const Route = createFileRoute("/circularity")({
  head: () => ({
    meta: [
      { title: "Circularity — PCRG" },
      { name: "description", content: "Composted, recycled and landfill mass, contamination and building circularity scores." },
      { property: "og:title", content: "Circularity — PCRG" },
      { property: "og:description", content: "Composted, recycled and landfill mass, contamination and building circularity scores." },
    ],
  }),
  component: Circ,
});

function Circ() {
  const [from, setFrom] = useState(FIRST_DATE);
  const [to, setTo] = useState(LAST_DATE);
  const rows = filterDaily({ from, to });
  const t = sumDaily(rows);
  const cat = { wet: 0, dry: 0, e: 0, haz: 0 };
  rows.forEach((r) => { cat.wet += r.wet_organic_kg ?? 0; cat.dry += r.dry_recyclable_kg ?? 0; cat.e += r.ewaste_kg ?? 0; cat.haz += r.hazardous_kg ?? 0; });
  const per = BUILDINGS.map((b) => {
    const s = sumDaily(rows.filter((r) => r.building_id === b.building_id));
    return { b, s, div: diversionRate(s.composted, s.recycled, s.waste), lpo: s.occupancy ? s.landfill / s.occupancy : 0 };
  });
  const sorted = [...per.map((p) => p.lpo)].sort((a, b) => a - b);
  const med = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const scored = per.map((p) => ({ ...p, score: circularityScore(p.div, p.s.contamination, p.lpo, med) })).sort((a, b) => b.score - a.score);

  return (
    <>
      <PageHeader title="Circularity" crumb="Circularity" right={<div className="flex gap-3"><DateInput label="From" value={from} onChange={setFrom} /><DateInput label="To" value={to} onChange={setTo} /></div>} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi label="Composted" value={fmt(t.composted)} unit="kg" tone="good" />
        <Kpi label="Recycled" value={fmt(t.recycled)} unit="kg" tone="good" />
        <Kpi label="Landfill" value={fmt(t.landfill)} unit="kg" tone="warn" />
        <Kpi label="Avg contamination" value={fmt(t.contamination, 1)} unit="%" />
        <Kpi label="Compost output" value={fmt(compostOutput(t.composted))} unit="kg" note={`Estimate: composted ÷ ${COMPOST_RATIO}`} />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Panel title="Waste by daily-summary category" sub="kg over period">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={[{ n: "Wet organic", v: cat.wet }, { n: "Dry recyclable", v: cat.dry }, { n: "E-waste", v: cat.e }, { n: "Hazardous", v: cat.haz }]}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="n" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} />
              <Tooltip {...tooltipStyle} /><Bar dataKey="v" name="kg" fill="var(--chart-1)" />
            </BarChart>
          </ResponsiveContainer>
          <p className="text-xs text-muted-foreground">E-waste and hazardous follow dedicated handling workflows and are not counted as ordinary recycling.</p>
        </Panel>
        <Panel title="Allocation by building" sub="Composted / recycled / landfill kg">
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={per.map((p) => ({ n: p.b.building_id, c: p.s.composted, r: p.s.recycled, l: p.s.landfill }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="n" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 10 }} />
              <Tooltip {...tooltipStyle} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="c" stackId="a" name="Composted" fill="var(--success)" /><Bar dataKey="r" stackId="a" name="Recycled" fill="var(--chart-2)" /><Bar dataKey="l" stackId="a" name="Landfill" fill="var(--chart-5)" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </div>
      <Panel className="mt-4" title="Building circularity score" sub="Prototype score, not an official standard. Score = 50·diversion + 30·(1 − contamination/50%) + 20·(1 − 0.5·landfill-per-occupant ÷ campus median)">
        <Table head={["Building", "Score", "Diversion", "Contamination", "Landfill / occ-day", "Suggested action"]}>
          {scored.map((p) => (
            <tr key={p.b.building_id}>
              <td><Link to="/buildings/$id" params={{ id: p.b.building_id }} className="text-primary">{p.b.building_name}</Link></td>
              <td className="num font-semibold">{p.score}</td><td className="num">{fmt(p.div, 1)}%</td>
              <td>{(p.s.contamination ?? 0) > 20 ? <Tag tone="warn">{fmt(p.s.contamination, 1)}%</Tag> : <span className="num">{fmt(p.s.contamination, 1)}%</span>}</td>
              <td className="num">{fmt(p.lpo, 3)} kg</td>
              <td className="text-xs">{(p.s.contamination ?? 0) > 20 ? "Review segregation, re-label bins" : !p.b.has_composter && p.s.composted === 0 ? "Route wet organics to a composter building" : "Reduce residual landfill"}</td>
            </tr>
          ))}
        </Table>
      </Panel>
    </>
  );
}
