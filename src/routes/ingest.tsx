import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useRole } from "@/lib/role";
import { bName, fmt } from "@/lib/pcrg";
import { LABEL, analyzeGeneric, analyzeHourly, analyzeLogs, matchKind, missingColumns, type HourlyReport, type Kind, type LogsReport, type GenericReport, type Row } from "@/lib/ingest";
import { Btn, Kpi, PageHeader, Panel, Table, Tag } from "@/components/kit";

export const Route = createFileRoute("/ingest")({
  head: () => ({
    meta: [
      { title: "Dataset Upload — PCRG" },
      { name: "description", content: "Facility-Manager-only upload: validate new P2P dataset files in-browser against the same rules as the offline pipeline." },
      { property: "og:title", content: "Dataset Upload — PCRG" },
      { property: "og:description", content: "Facility-Manager-only upload: validate new P2P dataset files in-browser against the same rules as the offline pipeline." },
    ],
  }),
  component: Ingest,
});

type Result = {
  name: string; ok: boolean; error?: string; kind: Kind | null; matchedBy: "name" | "columns";
  rows: number; missing: string[];
  hourly?: HourlyReport; logs?: LogsReport; generic?: GenericReport;
};

const HOUR_FIELDS = ["electricity_kwh", "water_litres", "solar_generation_kwh", "footfall"];

function Ingest() {
  const [role] = useRole();
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    const XLSX = await import("xlsx");
    const out: Result[] = [];
    for (const file of Array.from(files)) {
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null }) as Row[];
        const headers = Object.keys(rows[0] ?? {});
        const { kind, matchedBy } = matchKind(file.name, headers);
        const missing = missingColumns(kind, headers);
        const r: Result = { name: file.name, ok: true, kind, matchedBy, rows: rows.length, missing };
        if (kind === "hourly") r.hourly = analyzeHourly(rows);
        else if (kind === "logs") r.logs = analyzeLogs(rows);
        else if (kind === "buildings") r.generic = analyzeGeneric(rows, null, "building_id");
        else if (kind === "calendar") r.generic = analyzeGeneric(rows, "date", null);
        else if (kind === "daily") r.generic = analyzeGeneric(rows, "date", "building_id");
        else if (kind === "waste_train" || kind === "waste_test") r.generic = analyzeGeneric(rows, "timestamp", "building_id");
        out.push(r);
      } catch (e) {
        out.push({ name: file.name, ok: false, error: e instanceof Error ? e.message : String(e), kind: null, matchedBy: "columns", rows: 0, missing: [] });
      }
    }
    setResults(out);
    setBusy(false);
  };

  if (role !== "Facility Manager")
    return (
      <>
        <PageHeader title="Dataset Upload" crumb="Dataset Upload" desc="Restricted access." />
        <Panel title="Facility Manager only">
          <p className="text-sm text-muted-foreground">
            Uploading and validating new dataset files is reserved for the Facility Manager, who owns the data
            pipeline. Switch the demo role in the sidebar to continue.
          </p>
        </Panel>
      </>
    );

  const dupes = results.reduce((n, r) => n + (r.hourly?.duplicates ?? 0), 0);
  const oor = results.reduce((n, r) => n + (r.hourly?.oor_count ?? 0), 0);
  const unresolved = results.reduce((n, r) => n + (r.logs?.unresolved ?? 0), 0);

  return (
    <>
      <PageHeader title="Dataset Upload" crumb="Dataset Upload"
        desc="Drop the P2P dataset Excel files here; they are validated in this browser with the same rules as the offline pipeline."
        right={<Btn onClick={() => fileRef.current?.click()} disabled={busy}><Upload className="mr-2 inline h-4 w-4" />{busy ? "Validating…" : "Choose files"}</Btn>} />
      <input ref={fileRef} type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={(e) => void onFiles(e.target.files)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Files processed" value={fmt(results.length)} />
        <Kpi label="Duplicate hourly keys" value={fmt(dupes)} note="Key: timestamp + building; first kept" tone={dupes ? "warn" : "good"} />
        <Kpi label="Out-of-range readings" value={fmt(oor)} note="Rejected, never zero-filled" tone={oor ? "warn" : "good"} />
        <Kpi label="Unresolved log aliases" value={fmt(unresolved)} tone={unresolved ? "bad" : "good"} />
      </div>

      {!results.length && (
        <Panel className="mt-6" title="No files yet">
          <p className="text-sm text-muted-foreground">
            Expected files: buildings, calendar, daily_summary, hourly_streams, manual_logs, waste_events_train,
            waste_events_test (.xlsx). Files are also recognised by their columns if renamed.
          </p>
        </Panel>
      )}

      {results.map((r) => (
        <Panel className="mt-4" key={r.name} title={r.name} sub={r.kind ? `${LABEL[r.kind]} · matched by ${r.matchedByBy ?? r.matchedBy}` : "Unknown file"}
          right={r.ok ? (r.missing.length ? <Tag tone="bad">schema: missing {r.missing.join(", ")}</Tag> : <Tag tone="good">schema ok</Tag>) : <Tag tone="bad">read error</Tag>}>
          {r.error && <p className="text-sm text-red-500">{r.error}</p>}
          {!r.error && <p className="mb-3 text-sm text-muted-foreground">{fmt(r.rows)} rows</p>}
          {r.hourly && (
            <Table head={["Building", "Rows", "Missing h", "Largest gap", "Dupes", ">2h delay", "Max delay", "Last capture"]}>
              {r.hourly.per_building.map((b) => (
                <tr key={b.building_id}>
                  <td>{bName(b.building_id)}</td><td className="num">{b.rows}</td><td className="num">{b.missing_hours}</td>
                  <td className="num text-xs">{b.gaps[0] ? `${b.gaps[0].hours} h @ ${b.gaps[0].start}` : "—"}</td>
                  <td className="num">{r.hourly!.duplicates ? "see KPI" : 0}</td>
                  <td className="num">{b.delayed_over_2h}</td><td className="num text-xs">{b.max_delay_h ?? "—"} h</td>
                  <td className="num text-xs">{b.last_capture ?? "—"}</td>
                </tr>
              ))}
            </Table>
          )}
          {r.hourly && r.hourly.oor.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              Out-of-range examples: {r.hourly.oor.slice(0, 5).map((o) => `${o.building_id} ${o.timestamp} ${o.field}=${o.value}`).join(" · ")}
            </p>
          )}
          {r.logs && (
            <Table head={["Log", "Raw building", "Resolved", "Raw", "Normalised", "Status"]}>
              {r.logs.samples.map((l) => (
                <tr key={l.log_id}>
                  <td className="num">{l.log_id}</td><td>{l.building}</td><td className="num">{l.building_id ?? "—"}</td>
                  <td className="num text-xs">{fmt(l.raw_value, 1)} {l.raw_unit}</td>
                  <td className="num text-xs">{fmt(l.value, 1)} {l.unit} {l.estimated && <Tag tone="warn">est. 8 kg/bag</Tag>}</td>
                  <td>{l.status === "needs_review" ? <Tag tone="bad">needs review</Tag> : <Tag tone="good">resolved</Tag>}</td>
                </tr>
              ))}
            </Table>
          )}
          {r.generic && (
            <p className="text-sm text-muted-foreground">
              {r.generic.date_field ? <>Date span {r.generic.from ?? "—"} → {r.generic.to ?? "—"} · </> : null}
              Buildings covered: {r.generic.buildings.length ? r.generic.buildings.join(", ") : "—"} · Blank cells: {fmt(r.generic.blank_cells)}
            </p>
          )}
        </Panel>
      ))}

      <Panel className="mt-6" title="What happens after validation" sub="Prototype scope — nothing is persisted in this browser session">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>This page validates the uploaded files with the pipeline's own rules: duplicate keys, out-of-range readings, delivery delays, missing-hour gaps, alias and unit normalisation.</li>
          <li>Accepted files go through <span className="num">scripts/build_data.py &lt;dataset_dir&gt;</span> offline, which cleans the data, retrains the waste classifier, rebuilds forecasts, alerts and scores, and regenerates the app's data file.</li>
          <li>The refreshed metrics then appear across the dashboard exactly as this demo shows — no numbers are edited by hand.</li>
        </ol>
      </Panel>
    </>
  );
}
