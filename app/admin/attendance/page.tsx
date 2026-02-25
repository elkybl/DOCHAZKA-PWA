"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtTimeCZFromIso } from "@/lib/time";

type Seg = {
  kind: "WORK";
  site_id: string | null;
  site_name: string | null;
  in_time: string;
  out_time: string;
  minutes: number;
  hours: number;
  hourly_rate: number;
  rate_source: "site" | "default";
  pay: number;
  note_work: string | null;
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
};

type Row = {
  user_id: string;
  user_name: string;
  day: string;

  first_in: string | null;
  last_out: string | null;

  sites: string[];
  work_notes: string[];
  material_notes: string[];

  segments: Seg[];
  offsites: Off[];

  hours: number;
  hourly_avg: number;
  hours_pay: number;

  km: number;
  km_avg: number;
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

function timeHM(iso: string | null) {
  if (!iso) return "—";
  return fmtTimeCZFromIso(iso);
}

function mapLink(siteName: string) {
  const q = encodeURIComponent(siteName);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

export default function Page() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [from, setFrom] = useState(() =>
    new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
  );
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
      const res = await fetch(
        `/api/admin/payouts?from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`,
        { headers: { authorization: `Bearer ${token}` } }
      );

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

  async function deleteDay(user_id: string, day: string, user_name: string) {
    setErr(null);
    setInfo(null);
    if (!token) return;

    const ok = confirm(
      `FAKT smazat celý den docházky?\n\n${user_name} – ${day}\n\nSmaže to IN/OUT/OFFSITE záznamy.`
    );
    if (!ok) return;

    try {
      const res = await fetch("/api/admin/attendance/delete-day", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ user_id, day }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo smazat.");

      setInfo(`Smazáno: ${user_name} – ${day}`);
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byDay = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) m.set(r.day, [...(m.get(r.day) || []), r]);
    const days = Array.from(m.keys()).sort((a, b) => (a < b ? 1 : -1));
    return { map: m, days };
  }, [rows]);

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold">Admin docházka (detail)</h1>
          <div className="mt-1 text-xs text-neutral-500">
            Rozpis po dnech: intervaly IN→OUT, mimo stavbu, sazby a částky. Stavby mažeš ve{" "}
            <Link className="underline" href="/admin/sites">
              Správa staveb
            </Link>
            .
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm" href="/admin/payments">
            Vyplácení
          </Link>
          <Link className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm" href="/admin/sites">
            Stavby
          </Link>
          <Link className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm" href="/admin">
            Admin
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-sm text-neutral-700">Od</label>
            <input
              className="mt-1 rounded-xl border px-3 py-2"
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm text-neutral-700">Do</label>
            <input
              className="mt-1 rounded-xl border px-3 py-2"
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>

          <button
            onClick={load}
            disabled={loading}
            className="rounded-xl bg-black px-4 py-3 text-sm text-white disabled:opacity-50"
          >
            {loading ? "Načítám…" : "Načíst"}
          </button>
        </div>

        {err && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
      </div>

      {byDay.days.map((day) => {
        const list = byDay.map.get(day) || [];
        const totalDay = list.reduce((s, r) => s + (Number(r.total) || 0), 0);
        const unpaidDay = list.filter((r) => !r.paid).reduce((s, r) => s + (Number(r.total) || 0), 0);

        return (
          <section key={day} className="space-y-3">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-base font-semibold">{day}</h2>
                <div className="text-xs text-neutral-500">
                  Celkem: <b>{fmt(totalDay)} Kč</b> • Nezaplaceno: <b>{fmt(unpaidDay)} Kč</b>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {list.map((r) => (
                <div key={`${r.user_id}_${r.day}`} className="rounded-2xl border bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-semibold">{r.user_name}</div>
                      <div className="mt-1 text-xs text-neutral-600">
                        Časy: <b>{timeHM(r.first_in)}</b> → <b>{timeHM(r.last_out)}</b>{" "}
                        <span className="text-neutral-400">•</span> Intervalů:{" "}
                        <b>{r.segments?.length || 0}</b>
                      </div>
                      <div className="mt-1 text-xs text-neutral-600">
                        Stavby: {r.sites?.length ? r.sites.join(", ") : "—"}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      <div
                        className={`rounded-full px-3 py-1 text-xs ${
                          r.paid ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                        }`}
                      >
                        {r.paid ? "Zaplaceno" : "Nezaplaceno"}
                      </div>

                      {!r.paid && (
                        <button
                          onClick={() => pay(r.user_id, r.day)}
                          className="rounded-xl bg-black px-4 py-2 text-sm text-white"
                        >
                          Označit zaplaceno
                        </button>
                      )}

                      <button
                        onClick={() => deleteDay(r.user_id, r.day, r.user_name)}
                        className="rounded-xl border bg-white px-4 py-2 text-sm shadow-sm"
                      >
                        Smazat den
                      </button>
                    </div>
                  </div>

                  {/* Souhrny */}
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
                      <div className="text-xs text-neutral-600">
                        Celkem vyplatit: <b>{fmt(r.total)} Kč</b>
                      </div>
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
                              <div className="text-sm font-semibold">
                                {s.site_name || "—"}
                                {s.site_name ? (
                                  <a
                                    className="ml-2 text-xs text-neutral-500 underline"
                                    href={mapLink(s.site_name)}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    mapa
                                  </a>
                                ) : null}
                              </div>

                              <div className="text-sm">
                                <b>{timeHM(s.in_time)}</b> → <b>{timeHM(s.out_time)}</b>{" "}
                                <span className="text-neutral-400">•</span> <b>{fmt(s.hours)}</b> h
                              </div>
                            </div>

                            <div className="mt-1 text-xs text-neutral-600">
                              Sazba: <b>{fmt(s.hourly_rate)} Kč/h</b>{" "}
                              <span className="text-neutral-400">•</span>{" "}
                              {s.rate_source === "site" ? "podle stavby" : "default"}
                              <span className="text-neutral-400"> • </span>
                              Částka: <b>{fmt(s.pay)} Kč</b>
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
                      <div className="mt-2 text-xs text-neutral-500">
                        Žádné uzavřené intervaly (možná chybí odchod).
                      </div>
                    )}
                  </div>

                  {/* OFFSITE */}
                  <div className="mt-3 rounded-2xl border bg-white p-4">
                    <div className="text-xs font-semibold text-neutral-700">Mimo stavbu</div>

                    {r.offsites?.length ? (
                      <div className="mt-3 space-y-2">
                        {r.offsites.map((o, i) => (
                          <div key={i} className="rounded-xl border bg-neutral-50 p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="text-sm font-semibold">
                                {o.reason}
                                {o.site_name ? (
                                  <span className="ml-2 text-xs text-neutral-500">({o.site_name})</span>
                                ) : null}
                              </div>
                              <div className="text-sm">
                                <b>{fmt(o.hours)}</b> h
                              </div>
                            </div>

                            <div className="mt-1 text-xs text-neutral-600">
                              Sazba: <b>{fmt(o.hourly_rate)} Kč/h</b>{" "}
                              <span className="text-neutral-400">•</span>{" "}
                              {o.rate_source === "site" ? "podle stavby" : "default"}
                              <span className="text-neutral-400"> • </span>
                              Částka: <b>{fmt(o.pay)} Kč</b>
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
            </div>
          </section>
        );
      })}

      {rows.length === 0 && (
        <div className="rounded-2xl border bg-white p-5 text-sm text-neutral-600 shadow-sm">
          Žádná data v tomto období.
        </div>
      )}
    </main>
  );
}
