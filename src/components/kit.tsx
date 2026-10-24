import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, crumb, desc, right }: { title: string; crumb?: string; desc?: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">PCRG {crumb ? `/ ${crumb}` : ""}</div>
        <h1 className="mt-1 text-3xl font-semibold">{title}</h1>
        {desc && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Panel({ title, sub, children, className, right }: { title?: string; sub?: string; children: ReactNode; className?: string; right?: ReactNode }) {
  return (
    <section className={cn("rounded-lg border bg-card p-5", className)}>
      {(title || right) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Kpi({ label, value, unit, note, tone = "default" }: { label: string; value: string; unit?: string; note?: string; tone?: "default" | "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("num mt-2 text-2xl font-semibold", tone === "good" && "text-success", tone === "warn" && "text-warning-foreground", tone === "bad" && "text-destructive")}>
        {value} {unit && <span className="text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
      {note && <div className="mt-1 text-[11px] text-muted-foreground">{note}</div>}
    </div>
  );
}

const tagTones = {
  neutral: "bg-muted text-muted-foreground",
  good: "bg-secondary text-secondary-foreground",
  warn: "bg-warning/20 text-warning-foreground",
  bad: "bg-destructive/10 text-destructive",
  info: "bg-water/15 text-water",
};
export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: keyof typeof tagTones }) {
  return <span className={cn("inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium", tagTones[tone])}>{children}</span>;
}

export const sevTone = (s: string) => (s === "critical" || s === "high" ? "bad" : s === "medium" ? "warn" : "neutral") as keyof typeof tagTones;

export function Select({ value, onChange, options, label }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm text-foreground">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function DateInput({ value, onChange, label, min, max }: { value: string; onChange: (v: string) => void; label: string; min?: string; max?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <input type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} className="h-9 rounded-md border bg-card px-2 text-sm text-foreground" />
    </label>
  );
}

export function Table({ head, children }: { head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => <th key={i} className="px-2 py-2 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody className="[&_td]:px-2 [&_td]:py-2 [&_tr]:border-b [&_tr:last-child]:border-0">{children}</tbody>
      </table>
    </div>
  );
}

export function Btn({ children, onClick, variant = "primary", disabled }: { children: ReactNode; onClick?: () => void; variant?: "primary" | "ghost"; disabled?: boolean }) {
  return (
    <button disabled={disabled} onClick={onClick}
      className={cn("inline-flex h-8 items-center gap-1 rounded-md px-3 text-xs font-medium transition-colors disabled:opacity-50",
        variant === "primary" ? "bg-primary text-primary-foreground hover:bg-primary/90" : "border bg-card hover:bg-muted")}>
      {children}
    </button>
  );
}

export const tooltipStyle = { contentStyle: { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 } };
