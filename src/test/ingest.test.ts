import { describe, expect, it } from "vitest";
import { ALIAS, UNITS, analyzeHourly, analyzeLogs, matchKind, missingColumns } from "@/lib/ingest";

describe("Dataset upload validation (mirrors scripts/build_data.py)", () => {
  it("recognises files by name and by columns", () => {
    expect(matchKind("hourly_streams.xlsx", []).kind).toBe("hourly");
    expect(matchKind("whatever.xlsx", ["timestamp", "received_at", "building_id", "electricity_kwh", "water_litres", "solar_generation_kwh", "footfall"]).kind).toBe("hourly");
    expect(matchKind("random.xlsx", ["a", "b"]).kind).toBeNull();
  });

  it("flags missing required columns", () => {
    expect(missingColumns("hourly", ["timestamp", "building_id", "electricity_kwh", "water_litres", "solar_generation_kwh", "footfall"])).toEqual(["received_at"]);
    expect(missingColumns("logs", ["log_id", "logged_at", "logger_role", "building", "stream", "value", "unit", "note"])).toEqual([]);
  });

  it("dedupes hourly rows on timestamp + building (first kept)", () => {
    const rows = [
      { timestamp: "2026-10-01 05:00", building_id: "B01", electricity_kwh: 10, water_litres: 100, solar_generation_kwh: 0, footfall: 5, received_at: "2026-10-01 05:05" },
      { timestamp: "2026-10-01 05:00", building_id: "B01", electricity_kwh: 99, water_litres: 100, solar_generation_kwh: 0, footfall: 5, received_at: "2026-10-01 05:05" },
    ];
    const rep = analyzeHourly(rows);
    expect(rep.duplicates).toBe(1);
    expect(rep.kept).toBe(1);
    expect(rep.per_building[0].rows).toBe(1);
    expect(rep.per_building[0].duplicates).toBe(1);
  });

  it("rejects out-of-range readings instead of zero-filling", () => {
    const rep = analyzeHourly([{ timestamp: "2026-10-01 05:00", building_id: "B01", electricity_kwh: 600, water_litres: 100, solar_generation_kwh: 0, footfall: 5, received_at: "2026-10-01 05:05" }]);
    expect(rep.oor_count).toBe(1);
    expect(rep.oor[0]).toMatchObject({ field: "electricity_kwh", value: 600 });
    expect(rep.null_values).toBe(1);
  });

  it("finds missing-hour gaps between captures", () => {
    const rep = analyzeHourly([
      { timestamp: "2026-10-01 05:00", building_id: "B01", electricity_kwh: 10, water_litres: 100, solar_generation_kwh: 0, footfall: 5, received_at: "2026-10-01 05:05" },
      { timestamp: "2026-10-01 09:00", building_id: "B01", electricity_kwh: 10, water_litres: 100, solar_generation_kwh: 0, footfall: 5, received_at: "2026-10-01 09:05" },
    ]);
    expect(rep.per_building[0].missing_hours).toBe(3);
    expect(rep.per_building[0].gaps[0]).toMatchObject({ hours: 3 });
  });

  it("resolves manual-log aliases the same way as the pipeline", () => {
    expect(ALIAS["boys hostle"]).toBe("B05");
    expect(ALIAS["central lib"]).toBe("B03");
    const rep = analyzeLogs([
      { log_id: "L1", building: "Boys Hostle", value: 3, unit: "bags" },
      { log_id: "L2", building: "Robotics Lab", value: 5, unit: "kWh" },
    ]);
    expect(rep.samples.find((l) => l.log_id === "L1")).toMatchObject({ building_id: "B05", value: 24, unit: "kg", estimated: true });
    expect(rep.samples.find((l) => l.log_id === "L2")).toMatchObject({ building_id: null, status: "needs_review" });
    expect(rep.unresolved).toBe(1);
    expect(rep.estimated).toBe(1);
    expect(UNITS.kL.f).toBe(1000);
  });
});
