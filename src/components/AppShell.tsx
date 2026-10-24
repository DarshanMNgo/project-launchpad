import { Link } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Activity, Building2, Gauge, Leaf, LineChart, Menu, Recycle, ShieldAlert, Trophy, Database, FlaskConical, Upload } from "lucide-react";
import { useRole, ROLES } from "@/lib/role";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Overview", icon: Gauge },
  { to: "/buildings", label: "Buildings", icon: Building2 },
  { to: "/forecasts", label: "Resource Forecasts", icon: LineChart },
  { to: "/waste", label: "Waste Intelligence", icon: Recycle },
  { to: "/anomalies", label: "Anomalies & Actions", icon: ShieldAlert },
  { to: "/circularity", label: "Circularity", icon: Leaf },
  { to: "/challenge", label: "Building Challenge", icon: Trophy },
  { to: "/data-health", label: "Data Health", icon: Database },
  { to: "/methodology", label: "Model & Methodology", icon: FlaskConical },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useRole();
  return (
    <div className="flex min-h-screen">
      <aside className={cn("fixed inset-y-0 left-0 z-40 w-64 flex-col bg-sidebar text-sidebar-foreground md:flex", open ? "flex" : "hidden")}>
        <div className="flex items-center gap-2 border-b border-sidebar-border px-5 py-5">
          <Activity className="h-6 w-6 text-sidebar-primary" />
          <div>
            <div className="font-display text-lg font-semibold leading-none">PCRG</div>
            <div className="text-[10px] uppercase tracking-widest opacity-60">Circular-Resource Grid</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} onClick={() => setOpen(false)} activeOptions={{ exact: n.to === "/" }}
              className="flex items-center gap-3 rounded-md px-3 py-2 text-sm opacity-80 hover:bg-sidebar-accent hover:opacity-100"
              activeProps={{ className: "bg-sidebar-accent !opacity-100 text-sidebar-primary" }}>
              <n.icon className="h-4 w-4" /> {n.label}
            </Link>
          ))}
          {role === "Facility Manager" && (
            <div className="mt-2 border-t border-sidebar-border pt-2">
              <Link to="/ingest" onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm opacity-80 hover:bg-sidebar-accent hover:opacity-100"
                activeProps={{ className: "bg-sidebar-accent !opacity-100 text-sidebar-primary" }}>
                <Upload className="h-4 w-4" /> Dataset Upload
              </Link>
            </div>
          )}
        </nav>
        <div className="border-t border-sidebar-border p-4 text-xs">
          <label className="mb-1 block opacity-60">Demo role (not secure auth)</label>
          <select value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="w-full rounded bg-sidebar-accent px-2 py-1.5 text-sidebar-foreground">
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
          <p className="mt-3 opacity-50">Historical synthetic dataset · 20 Jun – 17 Oct 2026</p>
        </div>
      </aside>
      <div className="flex-1 md:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
          <button onClick={() => setOpen(!open)} aria-label="Menu"><Menu className="h-5 w-5" /></button>
          <span className="font-display font-semibold">PCRG</span>
        </header>
        <main className="mx-auto max-w-7xl p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
