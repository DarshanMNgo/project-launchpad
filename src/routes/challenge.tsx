import { createFileRoute } from "@tanstack/react-router";
import { DATA, bName, challengePoints, fmt } from "@/lib/pcrg";
import { PageHeader, Panel, Table, Tag } from "@/components/kit";

export const Route = createFileRoute("/challenge")({
  head: () => ({
    meta: [
      { title: "Campus Resource Challenge — PCRG" },
      { name: "description", content: "Building leaderboard scored on improvement versus each building's own baseline." },
      { property: "og:title", content: "Campus Resource Challenge — PCRG" },
      { property: "og:description", content: "Building leaderboard scored on improvement versus each building's own baseline." },
    ],
  }),
  component: Challenge,
});

type M = { baseline: number | null; current: number | null; change_pct: number | null };
type Row = { building_id: string; elec: M; water: M; landfill: M; contam: M };

const Delta = ({ v }: { v: number | null }) => v == null ? <span>—</span> :
  <span className={`num ${v < 0 ? "text-success" : "text-destructive"}`}>{v > 0 ? "+" : ""}{fmt(v, 1)}%</span>;

function Challenge() {
  const c = DATA.challenge;
  const rows = (c.rows as Row[]).map((r) => {
    const ch = [r.elec.change_pct, r.water.change_pct, r.landfill.change_pct, r.contam.change_pct];
    const flag = ch.some((x) => x != null && Math.abs(x) > 40);
    return { ...r, pts: challengePoints(ch), flag };
  }).sort((a, b) => (b.pts ?? 0) - (a.pts ?? 0));
  return (
    <>
      <PageHeader title="Campus Resource Challenge" crumb="Challenge" desc={`Baseline ${c.baseline_period[0]} → ${c.baseline_period[1]} vs current ${c.current_period[0]} → ${c.current_period[1]}. Metrics per occupant-day, so smaller buildings are not rewarded for size.`} />
      <Panel title="Leaderboard" sub="Prototype points only — not real money.">
        <Table head={["#", "Building", "Points", "Electricity/occ", "Water/occ", "Landfill/occ", "Contamination", "Badges"]}>
          {rows.map((r, i) => (
            <tr key={r.building_id}>
              <td className="num">{i + 1}</td><td>{bName(r.building_id)}</td><td className="num text-lg font-semibold">{r.pts ?? "—"}</td>
              <td><Delta v={r.elec.change_pct} /></td><td><Delta v={r.water.change_pct} /></td><td><Delta v={r.landfill.change_pct} /></td><td><Delta v={r.contam.change_pct} /></td>
              <td className="space-x-1">
                {(r.elec.change_pct ?? 0) < -5 && <Tag tone="good">Energy saver</Tag>}
                {(r.water.change_pct ?? 0) < -5 && <Tag tone="info">Water wise</Tag>}
                {(r.landfill.change_pct ?? 0) < -5 && <Tag tone="good">Zero-waste push</Tag>}
                {r.flag && <Tag tone="warn">Check data: abrupt change</Tag>}
              </td>
            </tr>
          ))}
        </Table>
      </Panel>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Scoring formula (v1)">
          <p className="text-sm text-muted-foreground">For each metric, % change per occupant-day vs the building's own baseline, clamped to ±30%. Points = 50 + mean(reduction) × 50/30, giving 0–100 where 50 = no change. Changes &gt;40% are flagged for data-quality review before points are awarded. The comparison spans semester-break and regular-term periods, so seasonal occupancy and weather confound results — this is not a causal impact claim.</p>
        </Panel>
        <Panel title="Suggested weekly challenges">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Switch-off sweep: idle lab & classroom loads off after 19:00.</li>
            <li>Leak hunt: night-time water reading check on Sunday.</li>
            <li>Clean-bin week: target contamination under 15%.</li>
            <li>Organics to compost: route all food waste to composter buildings.</li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
