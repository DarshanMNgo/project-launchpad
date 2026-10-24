import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { BUILDINGS, DATA, fmt } from "@/lib/pcrg";
import { PageHeader, Select, Tag } from "@/components/kit";

export const Route = createFileRoute("/buildings/")({
  head: () => ({
    meta: [
      { title: "Buildings — PCRG" },
      { name: "description", content: "Directory of all campus buildings with capacity, solar and composter status." },
      { property: "og:title", content: "Buildings — PCRG" },
      { property: "og:description", content: "Directory of all campus buildings with capacity, solar and composter status." },
    ],
  }),
  component: Buildings,
});

function Buildings() {
  const [type, setType] = useState("all");
  const types = ["all", ...new Set(BUILDINGS.map((b) => b.building_type))];
  const health = DATA.health as { building_id: string; missing_hours: number; gap_count: number }[];
  return (
    <>
      <PageHeader title="Buildings" crumb="Buildings" desc="Loaded from buildings.xlsx. Add a row and a sensor feed to scale beyond 8 buildings — no new pages needed."
        right={<Select label="Type" value={type} onChange={setType} options={types.map((t) => ({ value: t, label: t === "all" ? "All types" : t }))} />} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BUILDINGS.filter((b) => type === "all" || b.building_type === type).map((b) => {
          const h = health.find((x) => x.building_id === b.building_id);
          return (
            <Link key={b.building_id} to="/buildings/$id" params={{ id: b.building_id }} className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-md">
              <div className="flex items-center justify-between">
                <span className="num text-xs text-muted-foreground">{b.building_id}</span>
                <Tag>{b.building_type}</Tag>
              </div>
              <h3 className="mt-2 font-semibold leading-tight">{b.building_name}</h3>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">Capacity</dt><dd className="num">{fmt(b.design_capacity)}</dd>
                <dt className="text-muted-foreground">Area</dt><dd className="num">{fmt(b.area_sqm)} m²</dd>
                <dt className="text-muted-foreground">Floors</dt><dd className="num">{b.floors}</dd>
                <dt className="text-muted-foreground">Built</dt><dd className="num">{b.year_built}</dd>
              </dl>
              <div className="mt-3 flex flex-wrap gap-1">
                {b.has_solar ? <Tag tone="warn">Solar {b.solar_capacity_kw} kW</Tag> : <Tag>No solar</Tag>}
                {b.has_composter ? <Tag tone="good">Composter</Tag> : <Tag>No composter</Tag>}
                {h && h.missing_hours > 0 && <Tag tone="bad">{h.missing_hours} h missing</Tag>}
              </div>
            </Link>
          );
        })}
      </div>
    </>
  );
}
