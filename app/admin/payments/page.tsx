"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtTimeCZFromIso } from "@/lib/time";

type Row = {
  user_id: string;
  user_name: string;
  day: string;

  first_in: string | null;
  last_out: string | null;

  hours: number;
  hourly_avg: number;
  hours_pay: number;

  km: number;
  km_avg: number;
  km_pay: number;

  material: number;
  total: number;

  paid: boolean;

  sites: string[];
  segments: any[];
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

function hm(iso: string | null) {
  return fmtTimeCZFromIso(iso ?? null);
}

export default function Page() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [from, setFrom] = useState(() => new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10));
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
      if (!res.ok) throw new Error(data?.error || "Chyba");

      setRows(data.rows || []);
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function pay(user_id: string, day: string) {
    setErr(null);
    setInfo(null);
    if (!token) return;

    try {
      const res = await fetch("/api/admin/pay", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id, day }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo označit jako zaplaceno.");

      setInfo("Označeno jako zaplaceno.");
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    }
  }

  function exportCsv() {
    if (!token) return;
    (async () => {
      setErr(null);
      setInfo(null);
      try {
        const res = await fetch(`/api/admin/export?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Export selhal.");
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `payouts_${from}_to_${to}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        setErr(e.message || "Chyba exportu");
      }
    })();
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
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Vyplácení</h1>
          <div className="mt-1 text-xs text-neutral-500">
            Souhrn po dnech a lidech. Detail najdeš v{" "}
            <Link className="underline" href="/admin/attendance">
              Admin docházce
            </Link>
            .
          </div>
        </div>

        <Link className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm" href="/admin">
          Admin menu
        </Link>
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
            {loading ? "Načítám…" : "Načíst"}
          </button>

          <button onClick={exportCsv} className="rounded-xl border bg-white px-4 py-3 text-sm shadow-sm">
            Export CSV
          </button>

          <div className="ml-auto text-sm">
            <div className="text-neutral-600">Nezaplaceno:</div>
            <div className="font-semibold">{fmt(sumUnpaid)} Kč</div>
          </div>
          <div className="text-sm">
            <div className="text-neutral-600">Zaplaceno:</div>
            <div className="font-semibold">{fmt(sumPaid)} Kč</div>
          </div>
        </div>

        {err && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={`${r.user_id}_${r.day}`} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  {r.user_name} • {r.day}
                </div>
                <div className="mt-1 text-xs text-neutral-600">
                  Časy: <b>{hm(r.first_in)}</b> → <b>{hm(r.last_out)}</b> • Intervalů: <b>{r.segments?.length || 0}</b>
                </div>
                <div className="mt-1 text-xs text-neutral-600">
                  Stavby: {r.sites?.length ? r.sites.join(", ") : "—"}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`rounded-full px-3 py-1 text-xs ${r.paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  {r.paid ? "Zaplaceno" : "Nezaplaceno"}
                </div>

                {!r.paid && (
                  <button onClick={() => pay(r.user_id, r.day)} className="rounded-xl bg-black px-4 py-2 text-sm text-white">
                    Označit zaplaceno
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
              <div className="rounded-xl border bg-neutral-50 p-3">
                <div className="text-xs text-neutral-600">Hodiny</div>
                <div className="mt-1 font-semibold">
                  {fmt(r.hours)} h • ~{fmt(r.hourly_avg)} Kč/h
                </div>
                <div className="text-xs text-neutral-600">Částka: {fmt(r.hours_pay)} Kč</div>
              </div>

              <div className="rounded-xl border bg-neutral-50 p-3">
                <div className="text-xs text-neutral-600">Doprava</div>
                <div className="mt-1 font-semibold">
                  {fmt(r.km)} km • ~{fmt(r.km_avg)} Kč/km
                </div>
                <div className="text-xs text-neutral-600">Částka: {fmt(r.km_pay)} Kč</div>
              </div>

              <div className="rounded-xl border bg-neutral-50 p-3">
                <div className="text-xs text-neutral-600">Materiál</div>
                <div className="mt-1 font-semibold">{fmt(r.material)} Kč</div>
                <div className="text-xs text-neutral-600">Celkem: <b>{fmt(r.total)} Kč</b></div>
              </div>
            </div>

            <div className="mt-3 text-xs text-neutral-500">
              Detail rozpisu (intervaly + sazby) je v{" "}
              <Link className="underline" href="/admin/attendance">
                Admin docházce
              </Link>
              .
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-600 shadow-sm">
            Žádná data v tomto období.
          </div>
        )}
      </div>
    </main>
  );
}
