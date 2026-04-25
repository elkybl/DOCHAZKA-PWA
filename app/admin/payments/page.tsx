"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppNav";

type DayDetail = {
  day: string;
  hours: number;
  hours_pay: number;
  programming_hours: number;
  programming_pay: number;
  km: number;
  km_pay: number;
  material: number;
  total: number;
  note: string;
  paid: boolean;
};

type Row = {
  user_id: string;
  user_name: string;
  site_id: string | null;
  site_name: string | null;
  from_day: string;
  to_day: string;
  days_count: number;
  hours: number;
  hours_pay: number;
  programming_hours: number;
  programming_pay: number;
  km: number;
  km_pay: number;
  material: number;
  total: number;
  paid: boolean;
  days?: DayDetail[];
};

type StatusFilter = "unpaid" | "all" | "paid";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function fmt(n: unknown, max = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: max });
}

function keyOf(r: Row) {
  return `${r.user_id}_${r.site_id || "none"}_${r.from_day}_${r.to_day}`;
}

function getVisibleDays(row: Row, filter: StatusFilter) {
  const dayList = row.days || [];
  if (filter === "all") return dayList;
  return dayList.filter((day) => (filter === "paid" ? day.paid : !day.paid));
}

function summarizeDays(days: DayDetail[]) {
  return days.reduce(
    (sum, day) => ({
      total: sum.total + (Number(day.total) || 0),
      hoursPay: sum.hoursPay + (Number(day.hours_pay) || 0),
      programmingPay: sum.programmingPay + (Number(day.programming_pay) || 0),
      kmPay: sum.kmPay + (Number(day.km_pay) || 0),
      material: sum.material + (Number(day.material) || 0),
      hours: sum.hours + (Number(day.hours) || 0),
      programmingHours: sum.programmingHours + (Number(day.programming_hours) || 0),
      km: sum.km + (Number(day.km) || 0),
    }),
    { total: 0, hoursPay: 0, programmingPay: 0, kmPay: 0, material: 0, hours: 0, programmingHours: 0, km: 0 }
  );
}

function summarizeRow(row: Row) {
  const dayList = row.days || [];
  if (!dayList.length) {
    const total = Number(row.total) || 0;
    return {
      unpaidAmount: row.paid ? 0 : total,
      paidAmount: row.paid ? total : 0,
    } as const;
  }

  const unpaidAmount = dayList.reduce((sum, day) => sum + (day.paid ? 0 : Number(day.total) || 0), 0);
  const paidAmount = dayList.reduce((sum, day) => sum + (day.paid ? Number(day.total) || 0 : 0), 0);
  return { unpaidAmount, paidAmount } as const;
}

export default function PaymentsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<StatusFilter>("unpaid");
  const [query, setQuery] = useState("");

  const token = useMemo(() => getToken(), []);

  async function load() {
    setErr(null);
    setInfo(null);
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/payouts?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`, {
        headers: { authorization: `Bearer ${token}` },
      });
      const data = (await res.json().catch(() => ({}))) as { rows?: Row[]; error?: string };
      if (!res.ok) throw new Error(data.error || "Došlo k chybě.");
      setRows(data.rows || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Došlo k chybě.");
    } finally {
      setLoading(false);
    }
  }

  async function updateWholeGroup(row: Row, method: "POST" | "DELETE") {
    const confirmed = confirm(method === "POST" ? `Označit všechny zobrazené dny ${row.user_name} jako uhrazené?` : `Vrátit všechny zobrazené dny ${row.user_name} mezi neuhrazené?`);
    if (!confirmed) return;
    setErr(null);
    setInfo(null);
    if (!token) return;

    const key = `${method}_${keyOf(row)}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/admin/pay", {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: row.user_id,
          site_id: row.site_id,
          from_day: row.from_day,
          to_day: row.to_day,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || (method === "POST" ? "Nepodařilo se označit jako zaplacené." : "Nepodařilo se vrátit úhradu."));
      setInfo(
        method === "POST"
          ? `${row.user_name} / ${row.site_name || "Bez stavby"} označeno jako zaplacené.`
          : `${row.user_name} / ${row.site_name || "Bez stavby"} vráceno mezi neuhrazené.`
      );
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Došlo k chybě.");
    } finally {
      setBusyKey(null);
    }
  }

  async function updateSingleDay(row: Row, day: DayDetail, method: "POST" | "DELETE") {
    const confirmed = confirm(method === "POST" ? `Označit den ${day.day} jako uhrazený?` : `Vrátit den ${day.day} mezi neuhrazené?`);
    if (!confirmed) return;
    setErr(null);
    setInfo(null);
    if (!token) return;

    const key = `${method}_${keyOf(row)}_${day.day}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/admin/pay", {
        method,
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: row.user_id,
          day: day.day,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || (method === "POST" ? "Nepodařilo se označit den jako zaplacený." : "Nepodařilo se vrátit den mezi neuhrazené."));
      setInfo(
        method === "POST"
          ? `${row.user_name} • ${day.day} označeno jako uhrazené.`
          : `${row.user_name} • ${day.day} vráceno mezi neuhrazené.`
      );
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Došlo k chybě.");
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totals = useMemo(() => {
    return rows.reduce(
      (sum, row) => {
        const summary = summarizeRow(row);
        return {
          unpaid: sum.unpaid + summary.unpaidAmount,
          paid: sum.paid + summary.paidAmount,
          hours: sum.hours + (Number(row.hours) || 0) + (Number(row.programming_hours) || 0),
          km: sum.km + (Number(row.km) || 0),
        };
      },
      { unpaid: 0, paid: 0, hours: 0, km: 0 }
    );
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .map((row) => ({ ...row, visibleDays: getVisibleDays(row, status) }))
      .filter((row) => {
        if (status === "all") return true;
        return row.visibleDays.length > 0;
      })
      .filter((row) => {
        if (!q) return true;
        return `${row.user_name} ${row.site_name || ""}`.toLowerCase().includes(q);
      });
  }, [rows, status, query]);

  const visibleDayCount = useMemo(
    () => filtered.reduce((sum, row) => sum + row.visibleDays.length, 0),
    [filtered]
  );

  return (
    <AppShell
      area="mixed"
      title="Výplaty"
      subtitle="K úhradě ukazuje jen skutečně neuhrazené dny. Uhrazeno ukazuje jen zaplacené dny. Každý den lze označit nebo vrátit samostatně."
      actions={
        <button onClick={load} disabled={loading} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
          {loading ? "Načítám" : "Obnovit"}
        </button>
      }
    >
      <section className="grid gap-3 md:grid-cols-4">
        <Money label="K úhradě" value={totals.unpaid} tone="unpaid" />
        <Money label="Uhrazeno" value={totals.paid} tone="paid" />
        <Metric label="Hodiny" value={`${fmt(totals.hours)} h`} />
        <Metric label="Doprava" value={`${fmt(totals.km, 1)} km`} />
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[160px_160px_220px_1fr]">
          <Field label="Od"><input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="Do"><input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          <div>
            <div className="text-xs font-medium text-slate-600">Stav</div>
            <div className="mt-2 grid grid-cols-3 rounded-lg border bg-slate-50 p-1">
              {(["unpaid", "all", "paid"] as const).map((item) => (
                <button key={item} className={`rounded-md px-2 py-2 text-xs font-semibold ${status === item ? "bg-slate-950 text-white" : "text-slate-600"}`} onClick={() => setStatus(item)}>
                  {item === "unpaid" ? "K úhradě" : item === "paid" ? "Uhrazeno" : "Vše"}
                </button>
              ))}
            </div>
          </div>
          <Field label="Hledat">
            <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pracovník nebo stavba" />
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
            Zobrazené skupiny: <span className="font-semibold text-slate-950">{filtered.length}</span>
          </span>
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
            Zobrazené dny: <span className="font-semibold text-slate-950">{visibleDayCount}</span>
          </span>
          <span className={`rounded-full px-3 py-2 ${status === "paid" ? "border border-emerald-200 bg-emerald-50 text-emerald-800" : status === "unpaid" ? "border border-amber-200 bg-amber-50 text-amber-800" : "border border-slate-200 bg-slate-50 text-slate-700"}`}>
            {status === "paid" ? "Režim: vracení uhrazených dnů" : status === "unpaid" ? "Režim: označování k úhradě" : "Režim: kontrola všech dnů"}
          </span>
        </div>
        <button onClick={load} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Načíst období</button>
        {err ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
        {info ? <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div> : null}
      </section>

      <section className="mt-4 space-y-3">
        {filtered.map((row) => {
          const key = keyOf(row);
          const visibleDays = row.visibleDays;
          const summary = summarizeDays(visibleDays);
          const groupAction = status === "paid" ? "DELETE" : status === "unpaid" ? "POST" : null;
          const groupBusy = groupAction ? busyKey === `${groupAction}_${key}` : false;
          return (
            <article key={key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{row.user_name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.site_name || "Bez stavby"} • {row.from_day} - {row.to_day} • zobrazeno {visibleDays.length} d.
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${status === "paid" ? "bg-emerald-50 text-emerald-800" : status === "unpaid" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>
                    {status === "paid" ? "Uhrazené dny" : status === "unpaid" ? "K úhradě" : "Všechny dny"}
                  </span>
                  <div className="mt-2 text-xl font-semibold">{fmt(summary.total)} Kč</div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Mini label="Práce" value={`${fmt(summary.hoursPay)} Kč`} sub={`${fmt(summary.hours)} h`} />
                <Mini label="Programování" value={`${fmt(summary.programmingPay)} Kč`} sub={`${fmt(summary.programmingHours)} h`} />
                <Mini label="Doprava" value={`${fmt(summary.kmPay)} Kč`} sub={`${fmt(summary.km, 1)} km`} />
                <Mini label="Materiál" value={`${fmt(summary.material)} Kč`} sub=" " />
              </div>

              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                  <div className="text-xs font-semibold uppercase text-slate-500">Denní rozpis</div>
                  <div className="text-xs text-slate-500">Každý den lze zkontrolovat a změnit samostatně</div>
                </div>
                <div className="divide-y divide-slate-100">
                  {visibleDays.map((day) => {
                    const dayBusyKey = `${day.paid ? "DELETE" : "POST"}_${key}_${day.day}`;
                    const dayBusy = busyKey === dayBusyKey;
                    return (
                      <div key={`${key}_${day.day}`} className="grid gap-3 px-3 py-3 text-sm lg:grid-cols-[110px_1fr_160px] lg:items-start">
                        <div>
                          <div className="font-semibold text-slate-950">{day.day}</div>
                          <div className={`mt-1 text-xs font-medium ${day.paid ? "text-emerald-700" : "text-amber-700"}`}>
                            {day.paid ? "Uhrazeno" : "K úhradě"}
                          </div>
                        </div>
                        <div>
                          <div className="grid gap-2 sm:grid-cols-4">
                            <Mini label="Práce" value={`${fmt(day.hours_pay)} Kč`} sub={`${fmt(day.hours)} h`} />
                            <Mini label="Programování" value={`${fmt(day.programming_pay)} Kč`} sub={`${fmt(day.programming_hours)} h`} />
                            <Mini label="Doprava" value={`${fmt(day.km_pay)} Kč`} sub={`${fmt(day.km, 1)} km`} />
                            <Mini label="Materiál" value={`${fmt(day.material)} Kč`} sub=" " />
                          </div>
                          <div className="mt-2 rounded-lg bg-white p-3 text-sm text-slate-700">
                            {day.note || "Bez popisu práce"}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <div className="text-right text-lg font-semibold text-slate-950">{fmt(day.total)} Kč</div>
                          <button
                            onClick={() => updateSingleDay(row, day, day.paid ? "DELETE" : "POST")}
                            disabled={dayBusy}
                            className={`rounded-lg px-3 py-2 text-sm font-semibold disabled:opacity-50 ${day.paid ? "border border-slate-300 bg-white text-slate-700" : "bg-blue-700 text-white"}`}
                          >
                            {dayBusy ? "Ukládám" : day.paid ? "Vrátit den mezi neuhrazené" : "Označit den jako uhrazený"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {groupAction ? (
                <div className="mt-4 flex justify-end">
                  <button
                    onClick={() => updateWholeGroup(row, groupAction)}
                    disabled={groupBusy}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${groupAction === "POST" ? "bg-slate-950 text-white" : "border border-slate-300 bg-white text-slate-700"}`}
                  >
                    {groupBusy
                      ? "Ukládám"
                      : groupAction === "POST"
                        ? "Označit všechny zobrazené dny jako uhrazené"
                        : "Vrátit všechny zobrazené dny mezi neuhrazené"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {!filtered.length ? (
          <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500 shadow-sm">
            {status === "paid"
              ? "V tomhle období tu teď nejsou žádné uhrazené dny."
              : status === "unpaid"
                ? "V tomhle období tu teď nejsou žádné dny k úhradě."
                : "Pro zvolené období a filtry tu teď nejsou žádné dny."}
          </div>
        ) : null}
      </section>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600">{label}{children}</label>;
}

function Money({ label, value, tone }: { label: string; value: number; tone: "paid" | "unpaid" }) {
  const cls = tone === "paid" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950";
  return <div className={`rounded-lg border p-4 shadow-sm ${cls}`}><div className="text-xs font-medium opacity-75">{label}</div><div className="mt-2 text-2xl font-semibold">{fmt(value)} Kč</div></div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
}

function Mini({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-lg border bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 font-semibold">{value}</div><div className="mt-1 text-xs text-slate-500">{sub}</div></div>;
}




