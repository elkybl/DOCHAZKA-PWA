"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/AppNav";

type Dashboard = {
  summary: {
    active_users: number;
    open_shifts: number;
    pending_sites: number;
    unpaid_events: number;
    risk_count: number;
    same_time_transitions: number;
  };
  risks: Array<{
    code: string;
    title: string;
    user_name: string;
    site_name: string | null;
    day: string;
    detail: string;
    severity: "low" | "medium" | "high";
  }>;
};

function getUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? JSON.parse(raw) : null;
}

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function fmt(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: 0 });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Nepodařilo se načíst administraci.";
}

const links = [
  { href: "/admin/attendance", title: "Docházka", desc: "Denní přehled, detail směn a opravy záznamů." },
  { href: "/admin/payments", title: "Výplaty", desc: "Neuhrazené položky, částečné platby a označení úhrad." },
  { href: "/admin/sites", title: "Stavby", desc: "Správa akcí, adres, polohy a radiusu." },
  { href: "/admin/users", title: "Uživatelé", desc: "Pracovníci, role, PINy, sazby a exporty." },
  { href: "/admin/site-requests", title: "Dočasné stavby", desc: "Schvalování nových akcí z terénu." },
  { href: "/trips", title: "Jízdy", desc: "Evidence a kontrola dopravy." },
];

export default function AdminHome() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = useMemo(() => getToken(), []);

  async function load() {
    if (!token) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/dashboard", { headers: { authorization: `Bearer ${token}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nepodařilo se načíst dashboard.");
      setDashboard(data);
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = getToken();
    const u = getUser();
    if (!t || !u || u.role !== "admin") {
      router.push("/login");
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const summary = dashboard?.summary;

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 pb-24 pt-5 text-slate-950 md:pb-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <Image src="/ekybl-logo.png" alt="Elektro práce Lukáš Kybl" width={210} height={56} className="hidden h-auto w-44 sm:block" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Administrace</p>
                <h1 className="mt-1 text-2xl font-semibold tracking-tight">Přehled provozu</h1>
                <p className="mt-1 text-sm text-slate-600">Rychlá kontrola směn, výplat, dočasných staveb a rizikových záznamů.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="rounded-lg border border-slate-300 bg-white px-4 py-3 text-sm font-semibold shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Načítám…" : "Obnovit"}
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Metric label="Aktivní pracovníci" value={summary?.active_users ?? 0} href="/admin/users" />
          <Metric label="Otevřené směny" value={summary?.open_shifts ?? 0} href="/admin/attendance" tone={(summary?.open_shifts ?? 0) > 0 ? "blue" : "neutral"} />
          <Metric label="Dočasné stavby" value={summary?.pending_sites ?? 0} href="/admin/site-requests" tone={(summary?.pending_sites ?? 0) > 0 ? "amber" : "neutral"} />
          <Metric label="Nezaplacené eventy" value={summary?.unpaid_events ?? 0} href="/admin/payments" tone={(summary?.unpaid_events ?? 0) > 0 ? "amber" : "neutral"} />
          <Metric label="Rizika ke kontrole" value={summary?.risk_count ?? 0} href="/admin/attendance" tone={(summary?.risk_count ?? 0) > 0 ? "red" : "neutral"} />
        </section>

        {err ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div> : null}

        <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
          <div className="grid gap-3 sm:grid-cols-2">
            {links.map((item) => (
              <Link
                key={item.href}
                className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40"
                href={item.href}
              >
                <div className="text-base font-semibold">{item.title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-600">{item.desc}</div>
              </Link>
            ))}
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Rizikové záznamy</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Kontroly, které mohou ovlivnit docházku, výplaty nebo export.</p>
              </div>
              {summary?.same_time_transitions ? (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                  {summary.same_time_transitions} stejný čas
                </span>
              ) : null}
            </div>

            <div className="mt-4 space-y-3">
              {dashboard?.risks?.length ? (
                dashboard.risks.map((risk, index) => (
                  <div key={`${risk.code}-${risk.day}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold">{risk.title}</div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${riskClass(risk.severity)}`}>
                        {risk.severity === "high" ? "Vysoké" : risk.severity === "medium" ? "Střední" : "Nízké"}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-600">
                      {risk.user_name} · {risk.site_name || "Bez stavby"} · {risk.day}
                    </div>
                    <div className="mt-2 text-xs leading-5 text-slate-700">{risk.detail}</div>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                  Žádná hlavní rizika v posledních záznamech.
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
      <BottomNav variant="admin" />
    </main>
  );
}

function Metric({
  label,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href: string;
  tone?: "neutral" | "blue" | "amber" | "red";
}) {
  const cls =
    tone === "blue"
      ? "border-blue-200 bg-blue-50 text-blue-900"
      : tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : tone === "red"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-slate-200 bg-white text-slate-900";

  return (
    <Link href={href} className={`rounded-lg border p-4 shadow-sm transition hover:-translate-y-0.5 ${cls}`}>
      <div className="text-xs font-medium opacity-75">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{fmt(value)}</div>
    </Link>
  );
}

function riskClass(severity: "low" | "medium" | "high") {
  if (severity === "high") return "bg-red-100 text-red-800";
  if (severity === "medium") return "bg-amber-100 text-amber-800";
  return "bg-slate-200 text-slate-700";
}
