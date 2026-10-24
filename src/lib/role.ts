import { useEffect, useState } from "react";

export const ROLES = ["Facility Manager", "Building Supervisor", "Waste Operator", "Viewer / Judge"] as const;
export type Role = (typeof ROLES)[number];

export function useLocal<T>(key: string, init: T) {
  const [v, setV] = useState<T>(init);
  useEffect(() => {
    const s = localStorage.getItem(key);
    if (s) try { setV(JSON.parse(s)); } catch { /* ignore */ }
    const on = (e: Event) => { const d = (e as CustomEvent).detail; if (d?.key === key) setV(d.value); };
    window.addEventListener("pcrg-local", on);
    return () => window.removeEventListener("pcrg-local", on);
  }, [key]);
  const set = (nv: T) => {
    setV(nv); localStorage.setItem(key, JSON.stringify(nv));
    window.dispatchEvent(new CustomEvent("pcrg-local", { detail: { key, value: nv } }));
  };
  return [v, set] as const;
}

export const useRole = () => useLocal<Role>("pcrg-role", "Facility Manager");
