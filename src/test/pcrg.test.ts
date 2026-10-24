import { describe, expect, it } from "vitest";
import { co2, compostOutput, cost, diversionRate, pumpingKwh, routeFor } from "@/lib/pcrg";
import { reconcile } from "@/lib/sync";

describe("PCRG rules", () => {
  it("electricity cost is ₹8 per kWh", () => expect(cost(100)).toBe(800));
  it("emissions are 0.70 kg CO2 per kWh", () => expect(co2(100)).toBeCloseTo(70));
  it("water pumping is 0.85 kWh per kL", () => expect(pumpingKwh(2000)).toBeCloseTo(1.7));
  it("compost output is input / 4", () => expect(compostOutput(40)).toBe(10));
  it("diversion = (composted + recycled) / total", () => expect(diversionRate(20, 30, 100)).toBe(50));
  it("diversion with no waste is insufficient data", () => expect(diversionRate(0, 0, 0)).toBeNull());
  it("organics compost on site only where a composter exists", () => {
    expect(routeFor("food_organic", "B05")).toBe("On-site composter");
    expect(routeFor("food_organic", "B01")).not.toBe("On-site composter");
  });
  it("sync dedupes retries and never overwrites newer readings", () => {
    const r = { id: "x", building_id: "B01", captured_at: "2026-10-18T01:00", electricity_kwh: 5 };
    const { store, log } = reconcile({}, [r, r]);
    expect(log.map((l) => l.result)).toEqual(["inserted", "duplicate"]);
    const old = reconcile(store, [{ ...r, captured_at: "2026-10-18T00:00", electricity_kwh: 9 }]);
    expect(old.store.x.electricity_kwh).toBe(5);
  });
});
