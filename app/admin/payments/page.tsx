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

function summarizeRow(row: Row) {
  const dayList = row.days || [];
  if (!dayList.length) {
    const total = Number(row.total) || 0;
    return {
      unpaidAmount: row.paid ? 0 : total,
      paidAmount: row.paid ? total : 0,
      status: row.paid ? "paid" : "unpaid",
    } as const;
  }

  const unpaidAmount = dayList.reduce((sum, day) => sum + (day.paid ? 0 : Number(day.total) || 0), 0);
  const paidAmount = dayList.reduce((sum, day) => sum + (day.paid ? Number(day.total) || 0 : 0), 0);
  const status = unpaidAmount > 0 && paidAmount > 0 ? "partial" : unpaidAmount > 0 ? "unpaid" : "paid";
  return { unpaidAmount, paidAmount, status } as const;
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
  const [status, setStatus] = useState<"unpaid" | "all" | "paid">("unpaid");
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

  async function payGroup(row: Row) {
    setErr(null);
    setInfo(null);
    if (!token) return;

    const key = keyOf(row);
    setBusyKey(key);
    try {
      const res = await fetch("/api/admin/pay", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: row.user_id,
          site_id: row.site_id,
          from_day: row.from_day,
          to_day: row.to_day,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Nepodařilo se označit jako zaplacené.");
      setInfo(`${row.user_name} / ${row.site_name || "Bez stavby"} označeno jako zaplacené.`);
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
      .filter((row) => {
        const summary = summarizeRow(row);
        if (status === "all") return true;
        if (status === "paid") return summary.unpaidAmount === 0;
        return summary.unpaidAmount > 0;
      })
      .filter((row) => {
        if (!q) return true;
        return `${row.user_name} ${row.site_name || ""}`.toLowerCase().includes(q);
      });
  }, [rows, status, query]);

  return (
    <AppShell
      area="mixed"
      title="Výplaty"
      subtitle="Souhrny podle pracovníka, stavby a období. U smíšeného období se nahoře ukazuje jen skutečně neuhrazená částka."
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
        <button onClick={load} className="mt-3 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white">Načíst období</button>
        {err ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
        {info ? <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div> : null}
      </section>

      <section className="mt-4 space-y-3">
        {filtered.map((row) => {
          const key = keyOf(row);
          const summary = summarizeRow(row);
          return (
            <article key={key} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{row.user_name}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {row.site_name || "Bez stavby"} • {row.from_day} - {row.to_day} • {row.days_count} d.
                  </div>
                </div>
                <div className="text-right">
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${summary.status === "paid" ? "bg-emerald-50 text-emerald-800" : summary.status === "partial" ? "bg-blue-50 text-blue-800" : "bg-amber-50 text-amber-800"}`}>
                    {summary.status === "paid" ? "Zaplaceno" : summary.status === "partial" ? "Částečně uhrazeno" : "K úhradě"}
                  </span>
                  <div className="mt-2 text-xl font-semibold">{fmt(summary.unpaidAmount > 0 ? summary.unpaidAmount : summary.paidAmount)} Kč</div>
                  {summary.status === "partial" ? <div className="mt-1 text-xs text-slate-500">Uhrazeno {fmt(summary.paidAmount)} Kč</div> : null}
                </div>
              </div>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <Mini label="Práce" value={`${fmt(row.hours_pay)} Kč`} sub={`${fmt(row.hours)} h`} />
                <Mini label="Programování" value={`${fmt(row.programming_pay)} Kč`} sub={`${fmt(row.programming_hours)} h`} />
                <Mini label="Doprava" value={`${fmt(row.km_pay)} Kč`} sub={`${fmt(row.km, 1)} km`} />
                <Mini label="Materiál" value={`${fmt(row.material)} Kč`} sub=" " />
              </div>

              {row.days?.length ? (
                <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
                  <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3 py-2">
                    <div className="text-xs font-semibold uppercase text-slate-500">Denní rozpis</div>
                    <div className="text-xs text-slate-500">Kontrola před označením jako zaplaceno</div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {row.days.map((day) => (
                      <div key={`${key}_${day.day}`} className="grid gap-2 px-3 py-3 text-sm lg:grid-cols-[110px_1fr_120px] lg:items-center">
                        <div>
                          <div className="font-semibold text-slate-950">{day.day}</div>
                          <div className={`mt-1 text-xs font-medium ${day.paid ? "text-emerald-700" : "text-amber-700"}`}>
                            {day.paid ? "Zaplaceno" : "K úhradě"}
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-4">
                          <Mini label="Práce" value={`${fmt(day.hours_pay)} Kč`} sub={`${fmt(day.hours)} h`} />
                          <Mini label="Programování" value={`${fmt(day.programming_pay)} Kč`} sub={`${fmt(day.programming_hours)} h`} />
                          <Mini label="Doprava" value={`${fmt(day.km_pay)} Kč`} sub={`${fmt(day.km, 1)} km`} />
                          <Mini label="Materiál" value={`${fmt(day.material)} Kč`} sub=" " />
                        </div>
                        <div className="text-right font-semibold text-slate-950">{fmt(day.total)} Kč</div>
                        <div className="rounded-lg bg-white p-3 text-sm text-slate-700 lg:col-span-3">
                          {day.note || "Bez popisu práce"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {summary.unpaidAmount > 0 ? (
                <div className="mt-4 flex justify-end">
                  <button onClick={() => payGroup(row)} disabled={busyKey === key} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {busyKey === key ? "Ukládám" : "Označit jako zaplacené"}
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
        {!filtered.length ? <div className="rounded-lg border bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Žádné položky.</div> : null}
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
