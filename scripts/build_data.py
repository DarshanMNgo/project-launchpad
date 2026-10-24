"""PCRG data pipeline: reads P2P_DATASET xlsx files, cleans them, trains the waste
classifier, builds baseline forecasts, anomalies and scores, and writes
src/data/pcrg.json for the web app.  Run: python scripts/build_data.py <dataset_dir>"""
import json, sys, time, re
from pathlib import Path
import numpy as np, pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, precision_recall_fscore_support, confusion_matrix

D = Path(sys.argv[1] if len(sys.argv) > 1 else "/tmp/p2p/P2P_DATASET")
OUT = Path(__file__).resolve().parent.parent / "src/data/pcrg.json"
R = lambda x, n=2: None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), n)

b = pd.read_excel(D / "buildings.xlsx")
cal = pd.read_excel(D / "calendar.xlsx"); cal["date"] = pd.to_datetime(cal["date"]).dt.strftime("%Y-%m-%d")
daily = pd.read_excel(D / "daily_summary.xlsx"); daily["date"] = pd.to_datetime(daily["date"]).dt.strftime("%Y-%m-%d")
hr = pd.read_excel(D / "hourly_streams.xlsx")
ml = pd.read_excel(D / "manual_logs.xlsx")
wtr = pd.read_excel(D / "waste_events_train.xlsx")
wte = pd.read_excel(D / "waste_events_test.xlsx")
BIDS = list(b.building_id)

# ---------- hourly cleaning ----------
hr["ts"] = pd.to_datetime(hr["timestamp"]); hr["rx"] = pd.to_datetime(hr["received_at"])
raw_n = len(hr)
dup_mask = hr.duplicated(subset=["timestamp", "building_id"], keep="first")
dups = hr[dup_mask]
hr = hr[~dup_mask].sort_values(["building_id", "ts"]).copy()
hr["delay_min"] = (hr.rx - hr.ts).dt.total_seconds() / 60
rng = {"electricity_kwh": (0, 500), "water_litres": (0, 50000), "solar_generation_kwh": (0, 200), "footfall": (0, 5000)}
oor = []
for c, (lo, hi) in rng.items():
    bad = hr[c].notna() & ((hr[c] < lo) | (hr[c] > hi))
    for _, r in hr[bad].iterrows():
        oor.append({"building_id": r.building_id, "timestamp": r.timestamp, "field": c, "value": R(r[c])})
    hr.loc[bad, c] = np.nan
health = []
tmax = hr.ts.max()
for bid in BIDS:
    h = hr[hr.building_id == bid]
    full = pd.date_range(hr.ts.min(), tmax, freq="h")
    missing = full.difference(h.ts)
    # group missing hours into gaps
    gaps = []
    if len(missing):
        s = pd.Series(missing); grp = (s.diff() != pd.Timedelta("1h")).cumsum()
        for _, g in s.groupby(grp):
            gaps.append({"start": g.iloc[0].strftime("%Y-%m-%d %H:%M"), "hours": int(len(g))})
    health.append({
        "building_id": bid, "rows": int(len(h)), "expected": int(len(full)),
        "missing_hours": int(len(missing)), "gaps": sorted(gaps, key=lambda g: -g["hours"])[:8], "gap_count": len(gaps),
        "duplicates_removed": int((dups.building_id == bid).sum()),
        "delayed_over_2h": int((h.delay_min > 120).sum()), "max_delay_h": R(h.delay_min.max() / 60, 1),
        "median_delay_min": R(h.delay_min.median(), 0),
        "last_capture": h.ts.max().strftime("%Y-%m-%d %H:%M"),
        "null_values": int(h[list(rng)].isna().sum().sum()),
    })

# ---------- manual logs ----------
alias = {}
for _, r in b.iterrows():
    alias[r.building_id.lower()] = r.building_id; alias[r.building_name.lower()] = r.building_id
alias.update({"bh": "B05", "boys hostle": "B05", "gh": "B06", "girls hostle": "B06", "fc": "B07", "canteen": "B07",
              "admin": "B08", "library": "B03", "central lib": "B03", "eng labs": "B04", "labs": "B04",
              "innovation centre": "B04", "acad block a": "B01", "block a": "B01", "acad block b": "B02", "block b": "B02"})
conv = {"kWh": (1, "kWh", False), "units": (1, "kWh", False), "L": (1, "L", False), "kL": (1000, "L", False), "kg": (1, "kg", False), "bags": (8, "kg", True)}
logs = []
for _, r in ml.iterrows():
    key = str(r.building).strip().lower()
    bid = alias.get(key)
    f, u, est = conv.get(r.unit, (1, r.unit, False)) if pd.notna(r.unit) else (1, None, False)
    logs.append({"log_id": r.log_id, "logged_at": str(r.logged_at), "role": r.logger_role, "raw_building": r.building,
                 "building_id": bid, "stream": r.stream, "raw_value": R(r.value), "raw_unit": None if pd.isna(r.unit) else r.unit,
                 "value": R(r.value * f) if pd.notna(r.value) else None, "unit": u, "estimated": est,
                 "note": None if pd.isna(r.note) else str(r.note), "status": "resolved" if bid else "needs_review"})

# ---------- waste classifier ----------
F = ["weight_g", "moisture_pct", "metal_signal", "transparency", "acoustic_hardness"]
CL = ["food_organic", "paper_cardboard", "plastic", "glass", "metal", "ewaste"]
X = wtr[F].fillna(wtr[F].median()); y = wtr.category
Xtr, Xva, ytr, yva = train_test_split(X, y, test_size=0.2, stratify=y, random_state=42)
rf = RandomForestClassifier(n_estimators=200, max_depth=14, class_weight="balanced", random_state=42, n_jobs=-1).fit(Xtr, ytr)
pv = rf.predict(Xva)
p, rc, f1, sup = precision_recall_fscore_support(yva, pv, labels=CL, zero_division=0)
cm = confusion_matrix(yva, pv, labels=CL).tolist()
rf_full = RandomForestClassifier(n_estimators=200, max_depth=14, class_weight="balanced", random_state=42, n_jobs=-1).fit(X, y)
Xt = wte[F].fillna(X.median())
t0 = time.perf_counter(); [rf_full.predict_proba(Xt.iloc[[i]]) for i in range(50)]; lat = (time.perf_counter() - t0) / 50 * 1000
proba = rf_full.predict_proba(Xt); cls = rf_full.classes_
preds = []
for i, r in wte.reset_index(drop=True).iterrows():
    k = int(np.argmax(proba[i])); conf = float(proba[i][k])
    preds.append({"event_id": r.event_id, "timestamp": str(r.timestamp), "building_id": r.building_id, "bin_id": r.bin_id,
                  **{f: R(r[f]) for f in F}, "predicted": cls[k], "confidence": R(conf, 3),
                  "status": "needs_review" if conf < 0.6 else "auto"})
model = {"name": "RandomForestClassifier (200 trees, depth 14, balanced)", "train_rows": len(Xtr), "val_rows": len(Xva),
         "accuracy": R(accuracy_score(yva, pv), 4), "macro_f1": R(f1_score(yva, pv, average="macro"), 4),
         "per_class": [{"class": c, "precision": R(p[i], 3), "recall": R(rc[i], 3), "f1": R(f1[i], 3), "support": int(sup[i])} for i, c in enumerate(CL)],
         "confusion": cm, "labels": CL, "latency_ms": R(lat, 2),
         "importance": [{"feature": f, "value": R(v, 3)} for f, v in zip(F, rf_full.feature_importances_)],
         "train_class_counts": y.value_counts().to_dict()}

# ---------- forecasting (same-hour/day-type median baseline, scaled by recent level) ----------
calm = cal.set_index("date")
hr["date"] = hr.ts.dt.strftime("%Y-%m-%d"); hr["hour"] = hr.ts.dt.hour
hr["day_type"] = hr.date.map(calm.day_type)

def baseline(hist, target_ts, metric, day_type):
    h = hist[(hist.hour == target_ts.hour) & (hist.ts < target_ts) & (hist.ts >= target_ts - pd.Timedelta(days=28))]
    same = h[h.day_type == day_type]
    s = (same if len(same) >= 3 else h)[metric].dropna()
    return (float(s.median()), float(s.quantile(0.1)), float(s.quantile(0.9))) if len(s) else (np.nan,) * 3

def forecast_from(hist, origin, metric, horizon=12):
    # level adjustment: ratio of last 6h actual vs baseline of those hours
    recent = hist[(hist.ts <= origin) & (hist.ts > origin - pd.Timedelta(hours=6))]
    ratios = []
    for _, r in recent.iterrows():
        bm = baseline(hist, r.ts, metric, r.day_type)[0]
        if bm and bm > 0 and pd.notna(r[metric]): ratios.append(r[metric] / bm)
    k = float(np.clip(np.median(ratios), 0.6, 1.6)) if ratios else 1.0
    out = []
    for step in range(1, horizon + 1):
        t = origin + pd.Timedelta(hours=step)
        dt = calm.day_type.get(t.strftime("%Y-%m-%d"), "regular")
        m, lo, hi = baseline(hist, t, metric, dt)
        out.append((t, m * k, lo * k, hi * k))
    return out, k

forecasts, fc_eval = {}, {}
val_start = tmax - pd.Timedelta(days=21)
for bid in BIDS:
    h = hr[hr.building_id == bid]
    forecasts[bid] = {}; fc_eval[bid] = {}
    for metric in ["electricity_kwh", "water_litres"]:
        # chronological evaluation: origins every 24h in last 21 days
        errs = {6: [], 9: [], 12: []}
        for origin in pd.date_range(val_start, tmax - pd.Timedelta(hours=12), freq="24h"):
            fc, _ = forecast_from(h, origin, metric)
            act = h.set_index("ts")[metric]
            for i, (t, m, _, _) in enumerate(fc):
                if t in act.index and pd.notna(act[t]) and pd.notna(m):
                    for H in errs:
                        if i < H: errs[H].append(act[t] - m)
        fc_eval[bid][metric] = {str(H): {"mae": R(np.mean(np.abs(e))), "rmse": R(np.sqrt(np.mean(np.square(e)))), "n": len(e)} for H, e in errs.items() if e}
        origin = h.ts.max()
        fc, k = forecast_from(h, origin, metric)
        obs = h[h.ts > origin - pd.Timedelta(hours=48)]
        forecasts[bid][metric] = {
            "origin": origin.strftime("%Y-%m-%d %H:%M"), "level_factor": R(k, 3),
            "observed": [{"t": r.ts.strftime("%m-%d %H:00"), "v": R(r[metric])} for _, r in obs.iterrows()],
            "forecast": [{"t": t.strftime("%m-%d %H:00"), "v": R(m), "lo": R(lo), "hi": R(hi)} for t, m, lo, hi in fc]}

# ---------- hourly profile per building (last 14 days) ----------
hourly_recent = {}
for bid in BIDS:
    h = hr[(hr.building_id == bid) & (hr.ts > tmax - pd.Timedelta(days=7))]
    hourly_recent[bid] = [{"t": r.ts.strftime("%m-%d %H:00"), "e": R(r.electricity_kwh), "w": R(r.water_litres), "s": R(r.solar_generation_kwh), "f": R(r.footfall, 0)} for _, r in h.iterrows()]

# ---------- anomalies ----------
alerts = []
dd = daily.merge(cal[["date", "day_type", "event", "avg_temp_c", "rainfall_mm"]], on="date", how="left").sort_values(["building_id", "date"])
note_by = {}
for l in logs:
    if l["building_id"] and l["note"]:
        note_by.setdefault((l["building_id"], l["logged_at"][:10]), []).append(l["note"])
def add(bid, metric, date, obs, base, kind, cause, action, role, extra_conf=0):
    ratio = obs / base if base else None
    sev = "critical" if ratio and ratio >= 2.5 else "high" if ratio and ratio >= 1.8 else "medium" if ratio and ratio >= 1.4 else "low"
    if ratio and ratio < 1: sev = "high" if ratio < 0.3 else "medium"
    ev = dd[(dd.building_id == bid) & (dd.date == date)]
    evt = ev.event.iloc[0] if len(ev) and pd.notna(ev.event.iloc[0]) else None
    notes = note_by.get((bid, date), [])
    conf = "high" if notes or extra_conf else ("medium" if evt is None else "low")
    alt = []
    if evt: alt.append(f"Calendar event '{evt}' may explain the change.")
    if any(re.search(r"calibrat|odd|fault|faulty|meter|wrong|glitch", n, re.I) for n in notes):
        alt.insert(0, "A manual note suggests a meter/sensor issue: the reading may be a data error rather than real consumption. Validate before acting.")
    alerts.append({"id": f"A{len(alerts)+1:04d}", "building_id": bid, "metric": metric, "date": date, "kind": kind,
                   "observed": R(obs), "baseline": R(base), "ratio": R(ratio), "severity": sev, "cause": cause,
                   "evidence": {"event": evt, "notes": notes, "day_type": ev.day_type.iloc[0] if len(ev) else None},
                   "alternatives": alt, "confidence": conf, "action": action, "role": role})
for bid in BIDS:
    s = dd[dd.building_id == bid].reset_index(drop=True)
    for metric, kind, cause, action, role in [
        ("electricity_kwh", "Electricity spike", "Electricity use well above this building's recent same-day-type median.", "Check HVAC/lab equipment schedules and switch off idle loads.", "Building Supervisor"),
        ("water_litres", "Possible water leak / overuse", "Water use well above the recent same-day-type median.", "Inspect the meter and plumbing; check tanks and overflow valves.", "Facility Manager"),
        ("landfill_kg", "Elevated landfill", "Landfill mass above recent median.", "Audit bins for segregation failures; retrain staff.", "Waste Operator")]:
        for i in range(14, len(s)):
            win = s.iloc[max(0, i - 28):i]; same = win[win.day_type == s.day_type[i]]
            base = (same if len(same) >= 3 else win)[metric].median()
            v = s[metric][i]
            if pd.notna(v) and base and base > 0 and v / base >= 1.5:
                ratio = v / base
                add(bid, metric, s.date[i], v, base, kind, f"{cause} Observed {ratio:.1f}× baseline.", action, role)
    if b.set_index("building_id").has_solar[bid]:
        for i in range(14, len(s)):
            win = s.iloc[max(0, i - 14):i]; base = win.solar_generation_kwh.median(); v = s.solar_generation_kwh[i]
            rain = s.rainfall_mm[i]
            if base > 0 and pd.notna(v) and v / base < 0.4 and (pd.isna(rain) or rain < 5):
                add(bid, "solar_generation_kwh", s.date[i], v, base, "Solar under-performance",
                    f"Solar output {v/base*100:.0f}% of 14-day median with little rainfall ({rain} mm).", "Inspect panels/inverter for soiling or faults.", "Facility Manager")
    cont = s[s.contamination_pct > 25]
    for _, r in cont.iterrows():
        alerts.append({"id": f"A{len(alerts)+1:04d}", "building_id": bid, "metric": "contamination_pct", "date": r.date, "kind": "High recycling contamination",
                       "observed": R(r.contamination_pct), "baseline": 25, "ratio": R(r.contamination_pct / 25), "severity": "medium",
                       "cause": f"Contamination {r.contamination_pct:.1f}% exceeds the 25% threshold.", "evidence": {"event": None if pd.isna(r.event) else r.event, "notes": note_by.get((bid, r.date), []), "day_type": r.day_type},
                       "alternatives": [], "confidence": "medium", "action": "Review bin labelling and segregation at source.", "role": "Waste Operator"})
for hh in health:
    for g in hh["gaps"]:
        if g["hours"] >= 3:
            alerts.append({"id": f"A{len(alerts)+1:04d}", "building_id": hh["building_id"], "metric": "telemetry", "date": g["start"][:10], "kind": "Sensor silence",
                           "observed": g["hours"], "baseline": 0, "ratio": None, "severity": "high" if g["hours"] >= 12 else "medium",
                           "cause": f"No hourly readings for {g['hours']} consecutive hours from {g['start']}.", "evidence": {"event": None, "notes": [], "day_type": None},
                           "alternatives": ["Gateway outage", "Meter power loss"], "confidence": "high", "action": "Check gateway connectivity and meter power.", "role": "Facility Manager"})

# ---------- challenge (first 4 weeks baseline vs last 4 weeks), per occupant ----------
dates = sorted(daily.date.unique()); base_d, cur_d = dates[:28], dates[-28:]
chal = []
for bid in BIDS:
    s = daily[daily.building_id == bid]
    def per(ds, c):
        x = s[s.date.isin(ds)]; occ = x.occupancy_avg.sum()
        return x[c].sum() / occ if occ else None
    row = {"building_id": bid}
    for c, k in [("electricity_kwh", "elec"), ("water_litres", "water"), ("landfill_kg", "landfill")]:
        b0, b1 = per(base_d, c), per(cur_d, c)
        row[k] = {"baseline": R(b0, 4), "current": R(b1, 4), "change_pct": R((b1 - b0) / b0 * 100, 1) if b0 else None}
    c0 = s[s.date.isin(base_d)].contamination_pct.mean(); c1 = s[s.date.isin(cur_d)].contamination_pct.mean()
    row["contam"] = {"baseline": R(c0, 1), "current": R(c1, 1), "change_pct": R((c1 - c0) / c0 * 100, 1) if c0 else None}
    chal.append(row)

data = {"generated_at": time.strftime("%Y-%m-%d %H:%M UTC", time.gmtime()), "dataset": "P2P_DATASET (synthetic, 2026-06-20 to 2026-10-17)",
        "buildings": json.loads(b.to_json(orient="records")), "calendar": json.loads(cal.to_json(orient="records")),
        "daily": json.loads(daily.to_json(orient="records")),
        "hourly_recent": hourly_recent, "health": health, "ingest": {"raw_rows": raw_n, "duplicates_removed": int(dup_mask.sum()), "out_of_range": oor[:50], "out_of_range_count": len(oor)},
        "logs": logs, "model": model, "predictions": preds, "forecasts": forecasts, "forecast_eval": fc_eval,
        "forecast_validation": {"start": val_start.strftime("%Y-%m-%d"), "end": tmax.strftime("%Y-%m-%d")},
        "alerts": alerts, "challenge": {"baseline_period": [base_d[0], base_d[-1]], "current_period": [cur_d[0], cur_d[-1]], "rows": chal}}
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps(data, separators=(",", ":"), default=str))
print("wrote", OUT, OUT.stat().st_size // 1024, "KB; alerts", len(alerts), "acc", model["accuracy"], "f1", model["macro_f1"])
