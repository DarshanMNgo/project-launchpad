// In-browser dataset validation for the Dataset Upload page. It mirrors the
// cleaning rules of scripts/build_data.py — duplicate hourly keys, out-of-range
// readings, delivery delays, missing-hour gaps, building-alias resolution and
// unit normalisation — so an upload shows the same checks the offline pipeline
// applies before it regenerates src/data/pcrg.json.
import { KG_PER_BAG } from "@/lib/pcrg";

export type Row = Record<string, string | number | boolean | null | undefined>;

export type Kind = "buildings" | "calendar" | "daily" | "hourly" | "logs" | "waste_train" | "waste_test";

export const FILES: { file: string; kind: Kind; columns: string[] }[] = [
  { file: "buildings.xlsx", kind: "buildings", columns: ["building_id", "building_name", "building_type", "floors", "area_sqm", "design_capacity", "has_solar", "solar_capacity_kw", "year_built", "has_composter"] },
  { file: "calendar.xlsx", kind: "calendar", columns: ["date", "day_type", "event", "avg_temp_c", "rainfall_mm"] },
  { file: "daily_summary.xlsx", kind: "daily", columns: ["date", "building_id", "occupancy_avg", "electricity_kwh", "water_litres", "solar_generation_kwh", "wet_organic_kg", "dry_recyclable_kg", "ewaste_kg", "hazardous_kg", "composted_kg", "recycled_kg", "contamination_pct", "landfill_kg"] },
  { file: "hourly_streams.xlsx", kind: "hourly", columns: ["timestamp", "received_at", "building_id", "electricity_kwh", "water_litres", "solar_generation_kwh", "footfall"] },
  { file: "manual_logs.xlsx", kind: "logs", columns: ["log_id", "logged_at", "logger_role", "building", "stream", "value", "unit", "note"] },
  { file: "waste_events_train.xlsx", kind: "waste_train", columns: ["event_id", "timestamp", "building_id", "bin_id", "weight_g", "moisture_pct", "metal_signal", "transparency", "acoustic_hardness", "category"] },
  { file: "waste_events_test.xlsx", kind: "waste_test", columns: ["event_id", "timestamp", "building_id", "bin_id", "weight_g", "moisture_pct", "metal_signal", "transparency", "acoustic_hardness"] },
];

export const LABEL: Record<Kind, string> = {
  buildings: "Buildings", calendar: "Calendar", daily: "Daily summary", hourly: "Hourly telemetry",
  logs: "Manual logs", waste_train: "Waste events (train)", waste_test: "Waste events (test)",
};

// Plausibility windows, identical to scripts/build_data.py.
export const RANGE = { electricity_kwh: [0, 500], water_litres: [0, 50000], solar_generation_kwh: [0, 200], footfall: [0, 5000] } as const;

// Manual-log alias table, identical to scripts/build_data.py.
export const ALIAS: Record<string, string> = {
  bh: "B05", "boys hostle": "B05", gh: "B06", "girls hostle": "B06", fc: "B07", canteen: "B07",
  admin: "B08", library: "B03", "central lib": "B03", "eng labs": "B04", labs: "B04",
  "innovation centre": "B04", "acad block a": "B01", "block a": "B01", "acad block b": "B02", "block b": "B02",
};

// Unit normalisation; "bags" are estimated at KG_PER_BAG kg each.
export const UNITS: Record<string, { f: number; unit: string; est: boolean }> = {
  kWh: { f: 1, unit: "kWh", est: false }, units: { f: 1, unit: "kWh", est: false },
  L: { f: 1, unit: "L", est: false }, kL: { f: 1000, unit: "L", est: false },
  kg: { f: 1, unit: "kg", est: false }, bags: { f: KG_PER_BAG, unit: "kg", est: true },
};

const parseTs = (s: unknown) => {
  const t = String(s ?? "").trim().replace(" ", "T");
  const v = new Date(t.length === 16 ? `${t}:00` : t).getTime();
  return Number.isFinite(v) ? v : NaN;
};
const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : NaN);

export function matchKind(fileName: string, headers: string[]): { kind: Kind | null; matchedBy: "name" | "columns" } {
  const base = fileName.toLowerCase().replace(/\s+/g, "_");
  const byName = FILES.find((f) => base === f.file || base.endsWith(f.file) || base.includes(f.file.replace(".xlsx", "")));
  if (byName) return { kind: byName.kind, matchedBy: "name" };
  const hs = new Set(headers);
  const byCols = FILES.find((f) => f.columns.every((c) => hs.has(c)));
  if (byCols) return { kind: byCols.kind, matchedBy: "columns" };
  return { kind: null, matchedBy: "columns" };
}

export function missingColumns(kind: Kind | null, headers: string[]) {
  if (!kind) return [];
  const f = FILES.find((x) => x.kind === kind)!;
  const hs = new Set(headers);
  return f.columns.filter((c) => !hs.has(c));
}

export type HourlyBuilding = {
  building_id: string; rows: number; missing_hours: number; gap_count: number;
  gaps: { start: string; hours: number }[]; delayed_over_2h: number; max_delay_h: number | null;
  median_delay_min: number | null; last_capture: string | null;
};
export type OorItem = { building_id: string; timestamp: string; field: string; value: number };
export type HourlyReport = {
  rows: number; kept: number; duplicates: number; oor_count: number; oor: OorItem[];
  null_values: number; per_building: HourlyBuilding[];
};

export function analyzeHourly(rows: Row[]): HourlyReport {
  const seen = new Set<string>();
  const dups = new Set<string>();
  const kept: Row[] = [];
  for (const r of rows) {
    const key = `${r.building_id}|${r.timestamp}`;
    if (seen.has(key)) dups.add(key);
    else { seen.add(key); kept.push(r); }
  }
  const oor: OorItem[] = [];
  let nulls = 0;
  for (const r of kept) {
    let missing = false;
    for (const [field, [lo, hi]] of Object.entries(RANGE)) {
      const v = r[field];
      if (v == null || v === "") { missing = true; continue; }
      const n = Number(v);
      if (!Number.isFinite(n) || n < lo || n > hi) { oor.push({ building_id: String(r.building_id), timestamp: String(r.timestamp), field, value: n }); missing = true; }
    }
    if (missing) nulls++;
  }
  const per: HourlyBuilding[] = [];
  const bids = [...new Set(kept.map((r) => String(r.building_id)))].sort();
  for (const bid of bids) {
    const h = kept.filter((r) => String(r.building_id) === bid);
    const tss = h.map((r) => parseTs(r.timestamp)).filter((t) => !Number.isNaN(t)).sort((a, b) => a - b);
    const t0 = tss[0], t1 = tss[tss.length - 1];
    const present = new Set(tss);
    const gaps: { start: string; hours: number }[] = [];
    let missing = 0;
    if (tss.length) {
      let run = 0, runStart = 0;
      for (let t = t0; t <= t1; t += 3.6e6) {
        if (present.has(t)) {
          if (run) gaps.push({ start: new Date(runStart).toISOString().slice(0, 16).replace("T", " "), hours: run });
          run = 0;
        } else { if (!run) runStart = t; run++; missing++; }
      }
      if (run) gaps.push({ start: new Date(runStart).toISOString().slice(0, 16).replace("T", " "), hours: run });
    }
    const delays = h.map((r) => (parseTs(r.received_at) - parseTs(r.timestamp)) / 60000).filter((d) => Number.isFinite(d));
    per.push({
      building_id: bid, rows: h.length, missing_hours: missing, gap_count: gaps.length,
      gaps: gaps.sort((a, b) => b.hours - a.hours).slice(0, 8),
      delayed_over_2h: delays.filter((d) => d > 120).length,
      max_delay_h: delays.length ? Math.round((Math.max(...delays) / 60) * 10) / 10 : null,
      median_delay_min: delays.length ? Math.round(median(delays)) : null,
      last_capture: tss.length ? new Date(t1).toISOString().slice(0, 16).replace("T", " ") : null,
    });
  }
  return { rows: rows.length, kept: kept.length, duplicates: dups.size, oor_count: oor.length, oor: oor.slice(0, 20), null_values: nulls, per_building: per };
}

export type NormLog = {
  log_id: string; building: string; building_id: string | null; stream: string;
  raw_value: number | null; raw_unit: string | null; value: number | null; unit: string | null;
  estimated: boolean; status: "resolved" | "needs_review";
};
export type LogsReport = { rows: number; resolved: number; unresolved: number; estimated: number; samples: NormLog[] };

export function analyzeLogs(rows: Row[]): LogsReport {
  const logs: NormLog[] = rows.map((r) => {
    const bid = ALIAS[String(r.building ?? "").trim().toLowerCase()] ?? null;
    const u = UNITS[String(r.unit ?? "").trim()];
    const v = r.value == null || r.value === "" ? null : Number(r.value);
    return {
      log_id: String(r.log_id ?? ""), building: String(r.building ?? ""), building_id: bid, stream: String(r.stream ?? ""),
      raw_value: v != null && Number.isFinite(v) ? v : null, raw_unit: r.unit == null ? null : String(r.unit),
      value: v != null && Number.isFinite(v) && u ? v * u.f : null, unit: u?.unit ?? null,
      estimated: !!u?.est, status: bid ? "resolved" : "needs_review",
    };
  });
  return {
    rows: rows.length, resolved: logs.filter((l) => l.status === "resolved").length,
    unresolved: logs.filter((l) => l.status === "needs_review").length,
    estimated: logs.filter((l) => l.estimated).length,
    samples: [...logs.filter((l) => l.status === "needs_review"), ...logs.filter((l) => l.estimated)].slice(0, 12),
  };
}

export type GenericReport = { rows: number; date_field: string | null; from: string | null; to: string | null; buildings: string[]; blank_cells: number };

/** Shared checks for the tabular files: row count, date span, building coverage, blank cells. */
export function analyzeGeneric(rows: Row[], dateField: string | null, buildingField: string | null): GenericReport {
  const dates = dateField ? rows.map((r) => String(r[dateField] ?? "")).filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort() : [];
  const bids = buildingField ? [...new Set(rows.map((r) => String(r[buildingField] ?? "")))].filter(Boolean).sort() : [];
  const blank = rows.reduce((n, r) => n + Object.values(r).filter((v) => v == null || v === "").length, 0);
  return { rows: rows.length, date_field: dateField, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null, buildings: bids, blank_cells: blank };
}
