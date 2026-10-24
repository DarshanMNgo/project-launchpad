import raw from "@/data/pcrg.json";

export type Building = {
  building_id: string; building_name: string; building_type: string; floors: number; area_sqm: number;
  design_capacity: number; has_solar: number; solar_capacity_kw: number; year_built: number; has_composter: number;
};
export type Daily = {
  date: string; building_id: string; occupancy_avg: number | null; electricity_kwh: number | null; water_litres: number | null;
  solar_generation_kwh: number | null; wet_organic_kg: number | null; dry_recyclable_kg: number | null; ewaste_kg: number | null;
  hazardous_kg: number | null; composted_kg: number | null; recycled_kg: number | null; contamination_pct: number | null; landfill_kg: number | null;
};
export type Alert = {
  id: string; building_id: string; metric: string; date: string; kind: string; observed: number; baseline: number;
  ratio: number | null; severity: "critical" | "high" | "medium" | "low"; cause: string;
  evidence: { event: string | null; notes: string[]; day_type: string | null }; alternatives: string[];
  confidence: string; action: string; role: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DATA = raw as any;
export const BUILDINGS: Building[] = DATA.buildings;
export const DAILY: Daily[] = DATA.daily;
export const CALENDAR: { date: string; day_type: string; event: string | null; avg_temp_c: number; rainfall_mm: number }[] = DATA.calendar;
export const ALERTS: Alert[] = DATA.alerts;
export const DATES: string[] = CALENDAR.map((c) => c.date);
export const FIRST_DATE = DATES[0] as string;
export const LAST_DATE = DATES[DATES.length - 1] as string;
export const LAST30_DATE = DATES[DATES.length - 30] as string;

// Assumptions from the PRD — visible in the UI.
export const TARIFF_INR_PER_KWH = 8;
export const CO2_KG_PER_KWH = 0.7;
export const PUMP_KWH_PER_KL = 0.85;
export const COMPOST_RATIO = 4;
export const KG_PER_BAG = 8;

export const cost = (kwh: number) => kwh * TARIFF_INR_PER_KWH;
export const co2 = (kwh: number) => kwh * CO2_KG_PER_KWH;
export const pumpingKwh = (litres: number) => (litres / 1000) * PUMP_KWH_PER_KL;
export const totalWaste = (d: Pick<Daily, "wet_organic_kg" | "dry_recyclable_kg" | "ewaste_kg" | "hazardous_kg">) =>
  (d.wet_organic_kg ?? 0) + (d.dry_recyclable_kg ?? 0) + (d.ewaste_kg ?? 0) + (d.hazardous_kg ?? 0);
export const diversionRate = (composted: number, recycled: number, total: number) =>
  total > 0 ? ((composted + recycled) / total) * 100 : null;
export const compostOutput = (composted: number) => composted / COMPOST_RATIO;

export const bName = (id: string | null | undefined) => BUILDINGS.find((b) => b.building_id === id)?.building_name ?? id ?? "Unresolved";

export type Totals = {
  elec: number; water: number; solar: number; waste: number; composted: number; recycled: number; landfill: number;
  occupancy: number; contamination: number | null; days: number; missing: number;
};
export function sumDaily(rows: Daily[]): Totals {
  const t: Totals = { elec: 0, water: 0, solar: 0, waste: 0, composted: 0, recycled: 0, landfill: 0, occupancy: 0, contamination: null, days: 0, missing: 0 };
  let cSum = 0, cN = 0;
  const ds = new Set<string>();
  for (const r of rows) {
    ds.add(r.date);
    if (r.electricity_kwh == null || r.water_litres == null) t.missing++;
    t.elec += r.electricity_kwh ?? 0; t.water += r.water_litres ?? 0; t.solar += r.solar_generation_kwh ?? 0;
    t.waste += totalWaste(r); t.composted += r.composted_kg ?? 0; t.recycled += r.recycled_kg ?? 0;
    t.landfill += r.landfill_kg ?? 0; t.occupancy += r.occupancy_avg ?? 0;
    if (r.contamination_pct != null) { cSum += r.contamination_pct; cN++; }
  }
  t.contamination = cN ? cSum / cN : null; t.days = ds.size;
  return t;
}

export function filterDaily(opts: { from?: string; to?: string; building?: string; type?: string }) {
  return DAILY.filter((r) => {
    if (opts.from && r.date < opts.from) return false;
    if (opts.to && r.date > opts.to) return false;
    if (opts.building && opts.building !== "all" && r.building_id !== opts.building) return false;
    if (opts.type && opts.type !== "all" && BUILDINGS.find((b) => b.building_id === r.building_id)?.building_type !== opts.type) return false;
    return true;
  });
}

/** Circularity score 0–100 = 50·diversion + 30·(1 − contamination/50%) + 20·(1 − 0.5·landfillPerOcc/campusMedian), each term clamped 0–1. */
export function circularityScore(diversion: number | null, contamination: number | null, landfillPerOcc: number, medianLandfillPerOcc: number) {
  const d = Math.max(0, Math.min(100, diversion ?? 0)) / 100;
  const c = 1 - Math.max(0, Math.min(50, contamination ?? 50)) / 50;
  // 1 at zero landfill, 0.5 at campus median, 0 at 2x median
  const i = medianLandfillPerOcc > 0 ? 1 - 0.5 * (landfillPerOcc / medianLandfillPerOcc) : 0.5;
  return Math.round((0.5 * d + 0.3 * c + 0.2 * Math.max(0, Math.min(1, i))) * 100);
}

/** Challenge points: average % reduction per occupant across 4 metrics, clamped ±30, scaled to 0–100 (50 = no change). */
export function challengePoints(changes: (number | null)[]) {
  const v = changes.filter((x): x is number => x != null).map((x) => Math.max(-30, Math.min(30, -x)));
  if (!v.length) return null;
  return Math.round(50 + (v.reduce((a, b) => a + b, 0) / v.length) * (50 / 30));
}

export const fmt = (n: number | null | undefined, d = 0) =>
  n == null || Number.isNaN(n) ? "insufficient data" : n.toLocaleString("en-IN", { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtShort = (n: number) =>
  n >= 1e7 ? `${(n / 1e7).toFixed(2)} Cr` : n >= 1e5 ? `${(n / 1e5).toFixed(2)} L` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : n.toFixed(0);

/** Segregation route per predicted class; organics go to on-site composting only where the building has a composter. */
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

