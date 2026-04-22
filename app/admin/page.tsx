"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppNav";

type Risk = {
  code: string;
  title: string;
  user_id: string;
  user_name: string;
  site_id: string | null;
  site_name: string | null;
  day: string;
  detail: string;
  severity: "low" | "medium" | "high";
};

type Dashboard = {
  summary: {
    active_users: number;
    open_shifts: number;
    pending_sites: number;
    unpaid_events: number;
    risk_count: number;
    same_time_transitions: number;
  };
  risks: Risk[];
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

function riskUrl(risk: Risk) {
  const qs = new URLSearchParams({ day: risk.day, user_id: risk.user_id });
  if (risk.site_id) qs.set("site_id", risk.site_id);
  return `/admin/attendance?${qs.toString()}`;
}

const adminLinks = [
  { href: "/admin/calendar", title: "Kalendář", desc: "Plán práce, absencí, potvrzení a schvalování." },
  { href: "/admin/attendance", title: "Docházka", desc: "Dny, směny, opravy, mazání a změna stavby." },
  { href: "/admin/payments", title: "Výplaty", desc: "Neuhrazené částky a označení plateb." },
  { href: "/admin/sites", title: "Stavby", desc: "Akce, GPS, radius a aktivní stav." },
  { href: "/admin/users", title: "Lidé", desc: "Pracovníci, role, PINy a sazby." },
  { href: "/admin/site-requests", title: "Žádosti o stavbu", desc: "Nové stavby založené z terénu." },
];

const workerLinks = [
  { href: "/attendance", title: "Moje směna", desc: "Příchod, odchod a doplnění práce." },
  { href: "/me", title: "Moje výdělky", desc: "Osobní přehled zaplaceno / nezaplaceno." },
  { href: "/me/edit", title: "Moje úpravy", desc: "Doplnění práce, kilometrů a materiálu." },
  { href: "/me/rates", title: "Moje sazby", desc: "Hodinovky a sazby podle stavby." },
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
      if (!res.ok) throw new Error(data?.error || "Nepodařilo se načíst administraci.");
      setDashboard(data);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Nepodařilo se načíst administraci.");
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
    <AppShell
      area="mixed"
      title="Administrace"
      subtitle="Provoz, směny, výplaty a správa dat."
      actions={
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm disabled:opacity-50"
        >
          {loading ? "Načítám" : "Obnovit"}
        </button>
      }
    >
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Metric label="Pracovníci" value={summary?.active_users ?? 0} href="/admin/users" />
        <Metric label="Otevřené směny" value={summary?.open_shifts ?? 0} href="/admin/attendance" tone={(summary?.open_shifts ?? 0) > 0 ? "blue" : "neutral"} />
        <Metric label="Žádosti" value={summary?.pending_sites ?? 0} href="/admin/site-requests" tone={(summary?.pending_sites ?? 0) > 0 ? "amber" : "neutral"} />
        <Metric label="Nezaplaceno" value={summary?.unpaid_events ?? 0} href="/admin/payments" tone={(summary?.unpaid_events ?? 0) > 0 ? "amber" : "neutral"} />
        <Metric label="Rizika" value={summary?.risk_count ?? 0} href="/admin/attendance" tone={(summary?.risk_count ?? 0) > 0 ? "red" : "neutral"} />
      </section>

      {err ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div> : null}

      <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_430px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Moje práce</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {workerLinks.map((item) => (
                <MenuCard key={item.href} {...item} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Správa</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {adminLinks.map((item) => (
                <MenuCard key={item.href} {...item} />
              ))}
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Rizika</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Klik otevře konkrétní den v docházce.</p>
            </div>
            {summary?.same_time_transitions ? (
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                {summary.same_time_transitions} čas
              </span>
            ) : null}
          </div>

          <div className="mt-4 space-y-3">
            {dashboard?.risks?.length ? (
              dashboard.risks.map((risk, index) => (
                <Link
                  key={`${risk.code}-${risk.day}-${index}`}
                  href={riskUrl(risk)}
                  className="block rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:border-blue-200 hover:bg-blue-50"
                >
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
                </Link>
              ))
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Bez rizikových záznamů.
              </div>
            )}
          </div>
        </aside>
      </section>
    </AppShell>
  );
}

function MenuCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40" href={href}>
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-600">{desc}</div>
    </Link>
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
