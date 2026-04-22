"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppNav";

type PaymentState = "paid" | "unpaid" | "partial";

type Seg = {
  kind: "WORK";
  site_id: string | null;
  site_name: string | null;
  in_time_rounded: string;
  out_time_rounded: string;
  hours_rounded: number;
  site_hours: number;
  prog_hours: number;
  site_pay: number;
  prog_pay: number;
  hourly_rate: number;
  programming_rate: number;
  rate_source: "site" | "default";
  pay: number;
  paid: boolean;
  note_work: string | null;
  programming_note: string | null;
};

type Off = {
  kind: "OFFSITE";
  site_id: string | null;
  site_name: string | null;
  reason: string;
  hours: number;
  hourly_rate: number;
  rate_source: "site" | "default";
  pay: number;
  paid: boolean;
};

type DayRow = {
  day: string;
  paid: boolean;
  payment_state?: PaymentState;
  paid_total?: number;
  unpaid_total?: number;
  unknown_total?: number;
  first_in: string | null;
  last_out: string | null;
  hours: number;
  hours_pay: number;
  km: number;
  km_pay: number;
  km_source: "manual" | "trips" | "none";
  material: number;
  material_notes: string[];
  total: number;
  segments: Seg[];
  offsites: Off[];
};

type SiteAgg = {
  site_id: string;
  name: string;
  hours: number;
  amount: number;
  paid: number;
  unpaid: number;
};

type ProfileResponse = {
  user?: {
    google_sheet_url?: string | null;
  } | null;
};

const TZ = "Europe/Prague";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function fmt(n: unknown, max = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: max });
}

function timeHM(iso: string | null) {
  if (!iso) return "--:--";
  return new Date(iso).toLocaleTimeString("cs-CZ", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function paymentLabel(state?: PaymentState, paid?: boolean) {
  if (state === "partial") return "Částečně";
  if (state === "paid") return "Zaplaceno";
  if (state === "unpaid") return "Nezaplaceno";
  return paid ? "Zaplaceno" : "Nezaplaceno";
}

function paymentClass(state?: PaymentState, paid?: boolean) {
  if (state === "partial") return "bg-blue-50 text-blue-800 border-blue-100";
  if (state === "paid" || paid) return "bg-emerald-50 text-emerald-800 border-emerald-100";
  return "bg-amber-50 text-amber-800 border-amber-100";
}

export default function Page() {
  const router = useRouter();
  const [rows, setRows] = useState<DayRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sheetUrl, setSheetUrl] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [mode, setMode] = useState<"days" | "sites">("days");
  const [siteFilter, setSiteFilter] = useState("ALL");

  const token = useMemo(() => getToken(), []);

  useEffect(() => {
    if (!token) return;
    fetch("/api/me/profile", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json().catch(() => ({} as ProfileResponse)) as Promise<ProfileResponse>)
      .then((d) => setSheetUrl(d.user?.google_sheet_url || null))
      .catch(() => setSheetUrl(null));
  }, [token]);

  async function load(rangeDays: number) {
    setErr(null);
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/me/summary?days=${rangeDays}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { rows?: DayRow[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Chyba načtení.");
      setRows(data.rows || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Chyba načtení.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const siteOptions = useMemo(() => {
    const sites = new Map<string, string>();
    for (const row of rows) {
      for (const seg of row.segments || []) if (seg.site_id) sites.set(seg.site_id, seg.site_name || seg.site_id);
      for (const off of row.offsites || []) if (off.site_id) sites.set(off.site_id, off.site_name || off.site_id);
    }
    return [...sites.entries()].sort((a, b) => a[1].localeCompare(b[1], "cs"));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (siteFilter === "ALL") return rows;
    return rows
      .map((row) => {
        const segments = (row.segments || []).filter((seg) => seg.site_id === siteFilter);
        const offsites = (row.offsites || []).filter((off) => off.site_id === siteFilter);
        if (!segments.length && !offsites.length) return null;
        const hours = segments.reduce((sum, x) => sum + x.hours_rounded, 0) + offsites.reduce((sum, x) => sum + x.hours, 0);
        const hoursPay = segments.reduce((sum, x) => sum + x.pay, 0) + offsites.reduce((sum, x) => sum + x.pay, 0);
        return { ...row, segments, offsites, hours, hours_pay: hoursPay };
      })
      .filter((row): row is DayRow => !!row);
  }, [rows, siteFilter]);

  const totals = useMemo(() => {
    return filteredRows.reduce(
      (sum, row) => ({
        total: sum.total + (Number(row.total) || 0),
        paid: sum.paid + (Number(row.paid_total) || 0),
        unpaid: sum.unpaid + (Number(row.unpaid_total) || 0),
        unknown: sum.unknown + (Number(row.unknown_total) || 0),
        hours: sum.hours + (Number(row.hours) || 0),
      }),
      { total: 0, paid: 0, unpaid: 0, unknown: 0, hours: 0 }
    );
  }, [filteredRows]);

  const sitesAgg = useMemo(() => {
    const map = new Map<string, SiteAgg>();
    for (const row of filteredRows) {
      for (const item of [...(row.segments || []), ...(row.offsites || [])]) {
        if (!item.site_id) continue;
        const current = map.get(item.site_id) || {
          site_id: item.site_id,
          name: item.site_name || item.site_id,
          hours: 0,
          amount: 0,
          paid: 0,
          unpaid: 0,
        };
        const hours = "hours_rounded" in item ? item.hours_rounded : item.hours;
        current.hours += Number(hours) || 0;
        current.amount += Number(item.pay) || 0;
        if (item.paid) current.paid += Number(item.pay) || 0;
        else current.unpaid += Number(item.pay) || 0;
        map.set(item.site_id, current);
      }
    }
    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [filteredRows]);

  return (
    <AppShell
      area="auto"
      title="Moje výdělky"
      subtitle="Přehled práce, plateb, dopravy a materiálu."
      actions={
        <>
          {sheetUrl ? (
            <a className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold shadow-sm" href={sheetUrl} target="_blank" rel="noreferrer">
              Výkaz
            </a>
          ) : null}
          <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50" onClick={() => load(days)} disabled={loading}>
            {loading ? "Načítám" : "Obnovit"}
          </button>
        </>
      }
    >
      <section className="grid gap-3 md:grid-cols-4">
        <MoneyStat label="Celkem" value={totals.total} />
        <MoneyStat label="Zaplaceno" value={totals.paid} tone="paid" />
        <MoneyStat label="Nezaplaceno" value={totals.unpaid} tone="unpaid" />
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Odpracováno</div>
          <div className="mt-2 text-2xl font-semibold text-slate-950">{fmt(totals.hours)} h</div>
          {totals.unknown > 0 ? <div className="mt-2 text-xs text-amber-700">Nerozřazeno {fmt(totals.unknown)} Kč</div> : null}
        </div>
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[180px_220px_1fr]">
          <label className="block text-xs font-medium text-slate-600">
            Období
            <select className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={14}>14 dní</option>
              <option value={30}>30 dní</option>
              <option value={60}>60 dní</option>
              <option value={90}>90 dní</option>
              <option value={180}>180 dní</option>
            </select>
          </label>

          <div>
            <div className="text-xs font-medium text-slate-600">Zobrazení</div>
            <div className="mt-2 grid grid-cols-2 rounded-lg border bg-slate-50 p-1">
              <button className={`rounded-md px-3 py-2 text-xs font-semibold ${mode === "days" ? "bg-slate-950 text-white" : "text-slate-600"}`} onClick={() => setMode("days")}>
                Dny
              </button>
              <button className={`rounded-md px-3 py-2 text-xs font-semibold ${mode === "sites" ? "bg-slate-950 text-white" : "text-slate-600"}`} onClick={() => setMode("sites")}>
                Stavby
              </button>
            </div>
          </div>

          <label className="block text-xs font-medium text-slate-600">
            Stavba
            <select className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={siteFilter} onChange={(e) => setSiteFilter(e.target.value)}>
              <option value="ALL">Všechny stavby</option>
              {siteOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {err ? <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div> : null}

      {mode === "sites" ? (
        <section className="mt-4 grid gap-3 lg:grid-cols-2">
          {sitesAgg.map((site) => (
            <div key={site.site_id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-semibold">{site.name}</div>
                  <div className="mt-1 text-xs text-slate-500">{fmt(site.hours)} h</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{fmt(site.amount)} Kč</div>
                  <div className="mt-1 text-xs text-amber-700">Nezaplaceno {fmt(site.unpaid)} Kč</div>
                </div>
              </div>
            </div>
          ))}
          {!sitesAgg.length ? <EmptyState /> : null}
        </section>
      ) : (
        <section className="mt-4 space-y-3">
          {filteredRows.map((row) => (
            <DayCard key={row.day} row={row} />
          ))}
          {!filteredRows.length ? <EmptyState /> : null}
        </section>
      )}
    </AppShell>
  );
}

function MoneyStat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "paid" | "unpaid" }) {
  const cls =
    tone === "paid"
      ? "border-emerald-200 bg-emerald-50 text-emerald-950"
      : tone === "unpaid"
      ? "border-amber-200 bg-amber-50 text-amber-950"
      : "border-blue-200 bg-blue-50 text-blue-950";
  return (
    <div className={`rounded-lg border p-4 shadow-sm ${cls}`}>
      <div className="text-xs font-medium opacity-75">{label}</div>
      <div className="mt-2 text-2xl font-semibold">{fmt(value)} Kč</div>
    </div>
  );
}

function DayCard({ row }: { row: DayRow }) {
  const items = [...(row.segments || []), ...(row.offsites || [])];
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-base font-semibold">{row.day}</div>
          <div className="mt-1 text-xs text-slate-500">
            {timeHM(row.first_in)} - {timeHM(row.last_out)} · {fmt(row.hours)} h
          </div>
        </div>
        <div className="text-right">
          <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${paymentClass(row.payment_state, row.paid)}`}>
            {paymentLabel(row.payment_state, row.paid)}
          </span>
          <div className="mt-2 text-xl font-semibold">{fmt(row.total)} Kč</div>
          <a className="mt-2 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold hover:bg-slate-50" href={`/me/edit?day=${row.day}`}>
            Upravit den
          </a>
        </div>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <MiniStat label="Práce" value={`${fmt(row.hours_pay)} Kč`} sub={`${fmt(row.hours)} h`} />
        <MiniStat label="Doprava" value={`${fmt(row.km_pay)} Kč`} sub={`${fmt(row.km, 1)} km`} />
        <MiniStat label="Materiál" value={`${fmt(row.material)} Kč`} sub={row.material_notes?.[0] || "Bez materiálu"} />
        <MiniStat label="Nezaplaceno" value={`${fmt(row.unpaid_total || 0)} Kč`} sub={row.unknown_total ? `Nerozřazeno ${fmt(row.unknown_total)} Kč` : " "} />
      </div>

      {items.length ? (
        <div className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-100">
          {items.map((item, index) => (
            <div key={index} className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold">
                    {item.kind === "WORK" ? item.site_name || "Bez stavby" : "Mimo stavbu"}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.kind === "WORK" ? `${timeHM(item.in_time_rounded)} - ${timeHM(item.out_time_rounded)}` : `${fmt(item.hours)} h`}
                  </div>
                </div>
                <div className="text-right text-sm font-semibold">{fmt(item.pay)} Kč</div>
              </div>
              {"note_work" in item && item.note_work ? <div className="mt-2 text-sm text-slate-700">{item.note_work}</div> : null}
              {"reason" in item && item.reason ? <div className="mt-2 text-sm text-slate-700">{item.reason}</div> : null}
              {"prog_hours" in item && item.prog_hours > 0 ? (
                <div className="mt-2 text-xs text-slate-500">Programování {fmt(item.prog_hours)} h · {fmt(item.prog_pay)} Kč</div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function EmptyState() {
  return <div className="rounded-lg border border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Žádné záznamy pro vybrané filtry.</div>;
}
