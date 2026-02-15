"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Seg = {
  kind: "WORK";
  site_name: string | null;
  in_time: string;
  out_time: string;
  hours: number;
  hourly_rate: number;
  rate_source: "site" | "default";
  pay: number;
  note_work: string | null;
};

type Off = {
  kind: "OFFSITE";
  site_name: string | null;
  reason: string;
  hours: number;
  hourly_rate: number;
  rate_source: "site" | "default";
  pay: number;
};

type DayRow = {
  day: string;
  paid: boolean;

  first_in: string | null;
  last_out: string | null;

  hours: number;
  hours_pay: number;
  hourly_avg: number;

  km: number;
  km_pay: number;
  km_avg: number;

  material: number;
  material_notes: string[];

  total: number;

  segments: Seg[];
  offsites: Off[];
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
  if (!iso) return "—";
  return iso.slice(11, 16);
}

export default function Page() {
  const router = useRouter();
  const [rows, setRows] = useState<DayRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const token = useMemo(() => getToken(), []);

  async function load() {
    setErr(null);
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/me/summary?days=14", {
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

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sum = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
  const sumUnpaid = rows.filter((r) => !r.paid).reduce((s, r) => s + (Number(r.total) || 0), 0);

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Moje výdělek</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Přehled za posledních 14 dní. Detailní rozpis: práce (IN→OUT), mimo stavbu, km, materiál.
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm" href="/attendance">
                ← Zpět na Docházku
              </Link>
              <Link className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm" href="/me/rates">
                Moje sazby
              </Link>
              <Link className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm" href="/me/edit">
                Upravit záznamy
              </Link>
            </div>
          </div>

          <button
            onClick={load}
            className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "Načítám…" : "Obnovit"}
          </button>
        </div>

        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl border bg-neutral-50 p-3">
            <div className="text-xs text-neutral-600">Celkem</div>
            <div className="mt-1 text-base font-semibold">{fmt(sum)} Kč</div>
          </div>
          <div className="rounded-xl border bg-neutral-50 p-3">
            <div className="text-xs text-neutral-600">Nezaplaceno</div>
            <div className="mt-1 text-base font-semibold">{fmt(sumUnpaid)} Kč</div>
          </div>
        </div>

        {err && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
      </div>

      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.day} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">{r.day}</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Časy: <b>{hm(r.first_in)}</b> → <b>{hm(r.last_out)}</b>
                </div>
              </div>

              <div className="text-right">
                <div
                  className={`inline-block rounded-full px-3 py-1 text-xs ${
                    r.paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                  }`}
                >
                  {r.paid ? "Zaplaceno" : "Nezaplaceno"}
                </div>
                <div className="mt-2 text-base font-semibold">{fmt(r.total)} Kč</div>
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
              </div>
            </div>

            {/* Rozpis práce */}
            <div className="mt-4 rounded-2xl border bg-white p-4">
              <div className="text-xs font-semibold text-neutral-700">Rozpis práce (IN → OUT)</div>

              {r.segments?.length ? (
                <div className="mt-3 space-y-2">
                  {r.segments.map((s, i) => (
                    <div key={i} className="rounded-xl border bg-neutral-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold">{s.site_name || "—"}</div>
                        <div className="text-sm">
                          <b>{hm(s.in_time)}</b> → <b>{hm(s.out_time)}</b> • <b>{fmt(s.hours)}</b> h
                        </div>
                      </div>

                      <div className="mt-1 text-xs text-neutral-600">
                        Sazba: <b>{fmt(s.hourly_rate)} Kč/h</b> •{" "}
                        {s.rate_source === "site" ? "podle stavby" : "default"} • Částka: <b>{fmt(s.pay)} Kč</b>
                      </div>

                      {s.note_work ? (
                        <div className="mt-2 text-sm text-neutral-700">
                          <span className="text-xs font-semibold text-neutral-600">Co se dělalo: </span>
                          {s.note_work}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-neutral-500">Žádné uzavřené intervaly (možná chybí odchod).</div>
              )}
            </div>

            {/* Mimo stavbu */}
            <div className="mt-3 rounded-2xl border bg-white p-4">
              <div className="text-xs font-semibold text-neutral-700">Mimo stavbu</div>

              {r.offsites?.length ? (
                <div className="mt-3 space-y-2">
                  {r.offsites.map((o, i) => (
                    <div key={i} className="rounded-xl border bg-neutral-50 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-sm font-semibold">
                          {o.reason}
                          {o.site_name ? <span className="ml-2 text-xs text-neutral-500">({o.site_name})</span> : null}
                        </div>
                        <div className="text-sm">
                          <b>{fmt(o.hours)}</b> h
                        </div>
                      </div>

                      <div className="mt-1 text-xs text-neutral-600">
                        Sazba: <b>{fmt(o.hourly_rate)} Kč/h</b> •{" "}
                        {o.rate_source === "site" ? "podle stavby" : "default"} • Částka: <b>{fmt(o.pay)} Kč</b>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-2 text-xs text-neutral-500">Žádné položky mimo stavbu.</div>
              )}
            </div>

            {/* Materiál detail */}
            <div className="mt-3 rounded-2xl border bg-white p-4">
              <div className="text-xs font-semibold text-neutral-700">Materiál ze svého</div>
              {r.material_notes?.length ? (
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
                  {r.material_notes.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              ) : (
                <div className="mt-2 text-xs text-neutral-500">Žádný materiál.</div>
              )}
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-600 shadow-sm">
            Zatím žádné záznamy.
          </div>
        )}
      </div>
    </main>
  );
}
