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
    pending_reviews: number;
    needs_attention_today: number;
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

function riskGroupLabel(code: string) {
  switch (code) {
    case "open_long":
      return "Dlouhá nebo otevřená směna";
    case "same_time_transition":
      return "Kolize časů";
    case "missing_in":
    case "consecutive_in":
      return "Nesedí příchod a odchod";
    case "zero_length":
      return "Podezřele krátký den";
    case "missing_note":
      return "Chybí popis práce";
    case "missing_site":
      return "Chybí stavba";
    default:
      return "Ostatní rizika";
  }
}

const adminLinks = [
  { href: "/admin/calendar", title: "Kalendář", desc: "Plán práce, absencí, potvrzení a schvalování." },
  { href: "/admin/attendance", title: "Docházka", desc: "Dny, úpravy, mazání, změna stavby a kontrola detailu dne." },
  { href: "/admin/payments", title: "Výplaty", desc: "Přesné částky k úhradě, uhrazené dny a vracení plateb." },
  { href: "/admin/sites", title: "Stavby", desc: "Akce, GPS, radius a aktivní stav." },
  { href: "/admin/users", title: "Lidé", desc: "Pracovníci, role, PINy a sazby." },
  { href: "/admin/site-requests", title: "Žádosti o stavbu", desc: "Nové stavby založené z terénu." },
];

export default function AdminHome() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<"all" | Risk["severity"]>("all");

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
  const filteredRisks = useMemo(() => {
    const list = dashboard?.risks || [];
    if (severityFilter === "all") return list;
    return list.filter((risk) => risk.severity === severityFilter);
  }, [dashboard?.risks, severityFilter]);

  const groupedRisks = useMemo(() => {
    const map = new Map<string, number>();
    for (const risk of dashboard?.risks || []) {
      const key = riskGroupLabel(risk.code);
      map.set(key, (map.get(key) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [dashboard?.risks]);

  return (
    <AppShell
      area="mixed"
      title="Administrace"
      subtitle="Provoz, kontrola dnů, výplaty a práce s rizikovými záznamy na jednom místě."
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
        <Metric label="Otevřené dny" value={summary?.open_shifts ?? 0} href="/admin/attendance" tone={(summary?.open_shifts ?? 0) > 0 ? "blue" : "neutral"} />
        <Metric label="Žádosti" value={summary?.pending_sites ?? 0} href="/admin/site-requests" tone={(summary?.pending_sites ?? 0) > 0 ? "amber" : "neutral"} />
        <Metric label="Neuhrazené záznamy" value={summary?.unpaid_events ?? 0} href="/admin/payments" tone={(summary?.unpaid_events ?? 0) > 0 ? "amber" : "neutral"} />
        <Metric label="Rizika" value={summary?.risk_count ?? 0} href="/admin/attendance" tone={(summary?.risk_count ?? 0) > 0 ? "red" : "neutral"} />
      </section>

      <section className="mt-4 grid gap-3 lg:grid-cols-3">
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 shadow-sm">
          <div className="text-xs font-medium text-blue-800">Dnes řešit</div>
          <div className="mt-2 text-3xl font-semibold text-blue-950">{fmt(summary?.needs_attention_today ?? 0)}</div>
          <div className="mt-2 text-sm text-blue-900">Součet otevřených dnů, čekajících kontrol a nových žádostí.</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="text-xs font-medium text-emerald-800">Čeká na kontrolu</div>
          <div className="mt-2 text-3xl font-semibold text-emerald-950">{fmt(summary?.pending_reviews ?? 0)}</div>
          <div className="mt-2 text-sm text-emerald-900">Dny vrácené k doplnění nebo ještě neschválené po kontrole.</div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Ranní priorita</div>
          <div className="mt-2 text-lg font-semibold text-slate-950">
            {(summary?.pending_reviews ?? 0) > 0 ? "Projít vrácené a čekající dny" : "Kontrola dnů je v klidu"}
          </div>
          <div className="mt-2 text-sm text-slate-600">Největší smysl má začít admin docházkou a pak teprve řešit výplaty.</div>
        </div>
      </section>

      {err ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div> : null}

      <section className="mt-4 grid gap-4 lg:grid-cols-[1fr_460px]">
        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold">Správa systému</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {adminLinks.map((item) => (
                <MenuCard key={item.href} {...item} />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Typy problémů</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Rychlý přehled, co se v posledních dnech opakuje nejčastěji.</p>
              </div>
              {summary?.same_time_transitions ? (
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">
                  {summary.same_time_transitions} kolizí časů
                </span>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {groupedRisks.length ? groupedRisks.map(([label, count]) => (
                <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">
                  {label}: {count}
                </span>
              )) : <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">Bez aktivních rizik</span>}
            </div>
          </div>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Rizikové dny</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Každé riziko otevře konkrétní den v admin docházce. Odtud jde den upravit nebo smazat.</p>
            </div>
            <Link href="/admin/attendance" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50">
              Otevřít docházku
            </Link>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2 rounded-lg border bg-slate-50 p-1 text-xs font-semibold">
            {(["all", "high", "medium", "low"] as const).map((item) => (
              <button key={item} onClick={() => setSeverityFilter(item)} className={`rounded-md px-2 py-2 ${severityFilter === item ? "bg-slate-950 text-white" : "text-slate-600"}`}>
                {item === "all" ? "Vše" : item === "high" ? "Vysoké" : item === "medium" ? "Střední" : "Nízké"}
              </button>
            ))}
          </div>

          <div className="mt-4 space-y-3">
            {filteredRisks.length ? (
              filteredRisks.map((risk, index) => (
                <div key={`${risk.code}-${risk.day}-${index}`} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm font-semibold">{risk.title}</div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${riskClass(risk.severity)}`}>
                      {risk.severity === "high" ? "Vysoké" : risk.severity === "medium" ? "Střední" : "Nízké"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-600">
                    {risk.user_name} · {risk.site_name || "Bez stavby"} · {risk.day}
                  </div>
                  <div className="mt-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-slate-700">{risk.detail}</div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={riskUrl(risk)} className="rounded-lg bg-blue-700 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-600">
                      Zobrazit den
                    </Link>
                    <Link href={riskUrl(risk)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50">
                      Upravit den
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Bez rizikových dnů pro zvolený filtr.
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
