"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppNav";

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
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function fmt(n: any) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

export default function Page() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [from, setFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));

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

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Došlo k chybě");
      setRows(data.rows || []);
    } catch (e: any) {
      setErr(e.message || "Došlo k chybě");
    } finally {
      setLoading(false);
    }
  }

  async function payGroup(r: Row) {
    setErr(null);
    setInfo(null);
    if (!token) return;

    const key = `${r.user_id}_${r.site_id || "none"}_${r.from_day}_${r.to_day}`;
    setBusyKey(key);
    try {
      const res = await fetch("/api/admin/pay", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: r.user_id,
          site_id: r.site_id,
          from_day: r.from_day,
          to_day: r.to_day,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nepodařilo se označit období jako zaplacené.");

      setInfo(`Označeno jako zaplacené: ${r.user_name} / ${r.site_name || "Bez přiřazené akce"}`);
      await load();
    } catch (e: any) {
      setErr(e.message || "Došlo k chybě");
    } finally {
      setBusyKey(null);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const unpaid = rows.filter((r) => !r.paid);
  const paid = rows.filter((r) => r.paid);

  const sumUnpaid = unpaid.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const sumPaid = paid.reduce((s, r) => s + (Number(r.total) || 0), 0);

  return (
    <AppShell area="mixed" title="Výplaty" subtitle="Souhrny podle pracovníka, stavby a období.">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Výplaty</h1>
          <div className="mt-1 text-xs text-neutral-500">
            Souhrn po pracovníkovi a akci za zvolené období. Jedním kliknutím označíte celé období jako zaplacené.
          </div>
        </div>

        <Link className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm" href="/admin">Administrace</Link>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm text-neutral-700">Od</label>
            <input className="mt-1 rounded-xl border px-3 py-2" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-neutral-700">Do</label>
            <input className="mt-1 rounded-xl border px-3 py-2" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl bg-black px-4 py-3 text-sm text-white disabled:opacity-50"
          >
            {loading ? "Načítání…" : "Načíst přehled"}
          </button>

          <div className="ml-auto text-sm">
            <div className="text-neutral-600">K úhradě:</div>
            <div className="font-semibold">{fmt(sumUnpaid)} Kč</div>
          </div>
          <div className="text-sm">
            <div className="text-neutral-600">Již uhrazeno:</div>
            <div className="font-semibold">{fmt(sumPaid)} Kč</div>
          </div>
        </div>

        {err && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
      </div>

      <div className="space-y-3">
        {rows.map((r) => {
          const key = `${r.user_id}_${r.site_id || "none"}_${r.from_day}_${r.to_day}`;
          return (
            <div key={key} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">
                    {r.user_name} • {r.site_name || "Bez přiřazené akce"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Období: <b>{r.from_day}</b> → <b>{r.to_day}</b> • Dnů: <b>{r.days_count}</b>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`rounded-full px-3 py-1 text-xs ${r.paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                    {r.paid ? "Zaplaceno" : "Nezaplaceno"}
                  </div>

                  {!r.paid && (
                    <button
                      onClick={() => payGroup(r)}
                      disabled={busyKey === key}
                      className="rounded-xl bg-black px-4 py-2 text-sm text-white disabled:opacity-50"
                    >
                      {busyKey === key ? "Označuji…" : "Označit jako zaplacené"}
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-600">Práce</div>
                  <div className="mt-1 font-semibold">{fmt(r.hours)} h</div>
                  <div className="text-xs text-neutral-600">Částka: {fmt(r.hours_pay)} Kč</div>
                </div>

                <div className="rounded-xl border bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-600">Programování</div>
                  <div className="mt-1 font-semibold">{fmt(r.programming_hours)} h</div>
                  <div className="text-xs text-neutral-600">Částka: {fmt(r.programming_pay)} Kč</div>
                </div>

                <div className="rounded-xl border bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-600">Doprava a materiál</div>
                  <div className="mt-1">Km: {fmt(r.km)} km • {fmt(r.km_pay)} Kč</div>
                  <div className="text-xs text-neutral-600">Materiál: {fmt(r.material)} Kč</div>
                </div>

                <div className="rounded-xl border bg-neutral-50 p-3">
                  <div className="text-xs text-neutral-600">Celkem k úhradě</div>
                  <div className="mt-1 text-base font-semibold">{fmt(r.total)} Kč</div>
                </div>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-600 shadow-sm">
            Ve zvoleném období nebyly nalezeny žádné podklady.
          </div>
        )}
      </div>
    </AppShell>
  );
}
