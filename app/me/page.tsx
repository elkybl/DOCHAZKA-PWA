"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SubCard, MenuLink, Pill, Button } from "@/app/components/ui";

type Seg = {
  kind: "WORK";
  site_id: string | null;
  site_name: string | null;

  in_time_raw: string;
  out_time_raw: string;

  in_time_rounded: string;
  out_time_rounded: string;

  minutes_rounded: number;
  hours_rounded: number;
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

type DayRow = {
  day: string;
  paid: boolean;

  first_in: string | null; // already rounded
  last_out: string | null; // already rounded

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

const TZ = "Europe/Prague";

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function fmt(n: any, max = 2) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: max });
}

function timeHM(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("cs-CZ", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

type SiteAgg = {
  site_id: string;
  name: string;
  hours: number;
  hours_pay: number;
  km: number;
  km_pay: number;
  material: number;
  total: number;
  paid_all: boolean;
};

export default function Page() {
  const router = useRouter();
  const [rows, setRows] = useState<DayRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [days, setDays] = useState<number>(30);
  const [mode, setMode] = useState<"days" | "sites">("days");
  const [siteFilter, setSiteFilter] = useState<string>("ALL");

  const token = useMemo(() => getToken(), []);

  async function load(d: number) {
    setErr(null);
    if (!token) {
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/me/summary?days=${d}`, {
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
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const totals = useMemo(() => {
    const sum = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    const unpaid = rows.filter((r) => !r.paid).reduce((s, r) => s + (Number(r.total) || 0), 0);
    return { sum, unpaid };
  }, [rows]);

  const siteOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) {
      for (const s of r.segments || []) {
        if (s.site_id) m.set(s.site_id, s.site_name || s.site_id);
      }
      for (const o of r.offsites || []) {
        if (o.site_id) m.set(o.site_id, o.site_name || o.site_id);
      }
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filteredRows = useMemo(() => {
    if (siteFilter === "ALL") return rows;

    return rows
      .map((r) => {
        const segs = (r.segments || []).filter((s) => s.site_id === siteFilter);
        const offs = (r.offsites || []).filter((o) => o.site_id === siteFilter);

        // km + material jsou na den – pokud filtruješ stavbu, km/material necháme jen pokud existuje aspoň něco v tom dni pro tu stavbu
        const has = segs.length > 0 || offs.length > 0;
        if (!has) return null;

        const hours_pay = segs.reduce((a, x) => a + x.pay, 0) + offs.reduce((a, x) => a + x.pay, 0);
        const hours = segs.reduce((a, x) => a + x.hours_rounded, 0) + offs.reduce((a, x) => a + x.hours, 0);

        return {
          ...r,
          segments: segs,
          offsites: offs,
          hours: Number(hours.toFixed(2)),
          hours_pay: Number(hours_pay.toFixed(2)),
        } as DayRow;
      })
      .filter(Boolean) as DayRow[];
  }, [rows, siteFilter]);

  const sitesAgg = useMemo(() => {
    const map = new Map<string, SiteAgg>();

    for (const r of filteredRows) {
      // work segments
      for (const s of r.segments || []) {
        if (!s.site_id) continue;
        const key = s.site_id;
        const cur = map.get(key) || {
          site_id: key,
          name: s.site_name || key,
          hours: 0,
          hours_pay: 0,
          km: 0,
          km_pay: 0,
          material: 0,
          total: 0,
          paid_all: true,
        };
        cur.hours += s.hours_rounded;
        cur.hours_pay += s.pay;
        cur.paid_all = cur.paid_all && r.paid;
        map.set(key, cur);
      }

      // offsites
      for (const o of r.offsites || []) {
        if (!o.site_id) continue;
        const key = o.site_id;
        const cur = map.get(key) || {
          site_id: key,
          name: o.site_name || key,
          hours: 0,
          hours_pay: 0,
          km: 0,
          km_pay: 0,
          material: 0,
          total: 0,
          paid_all: true,
        };
        cur.hours += o.hours;
        cur.hours_pay += o.pay;
        cur.paid_all = cur.paid_all && r.paid;
        map.set(key, cur);
      }

      // km/material: if filtered by specific site, keep as day-level bucket.
      // In "sites" mode, it's better to keep km/material on day and let admin invoice endpoint do strict mapping.
      // Here we just show user's view; we attach km/material to ALL site aggs in that day only when filtering "ALL" is active.
      if (siteFilter === "ALL") {
        // attach km/material to a synthetic "Bez stavby" bucket? We'll keep km/material separate in day view instead.
      }
    }

    // compute totals
    for (const v of map.values()) {
      v.hours = Number(v.hours.toFixed(2));
      v.hours_pay = Number(v.hours_pay.toFixed(2));
      v.total = Number((v.hours_pay + v.km_pay + v.material).toFixed(2));
    }

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredRows, siteFilter]);

  return (
    <main className="space-y-4 px-3">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Moje výdělky</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Časy i výpočet jsou zaokrouhlené na 30 minut (příchod i odchod). Reálná data v DB se nemění.
            </p>
          </div>

          <Button onClick={() => load(days)} disabled={loading}>
            {loading ? "Načítám…" : "Obnovit"}
          </Button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <SubCard>
            <div className="text-xs text-neutral-600">Celkem</div>
            <div className="mt-1 text-base font-semibold">{fmt(totals.sum)} Kč</div>
          </SubCard>
          <SubCard>
            <div className="text-xs text-neutral-600">Nezaplaceno</div>
            <div className="mt-1 text-base font-semibold">{fmt(totals.unpaid)} Kč</div>
          </SubCard>
        </div>

        <div className="mt-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <SubCard>
              <div className="text-sm font-semibold">Menu</div>
              <div className="mt-3 grid gap-2">
                <MenuLink href="/attendance">Docházka</MenuLink>
                <MenuLink href="/trips">Kniha jízd</MenuLink>
                <MenuLink href="/me/rates">Moje sazby</MenuLink>
                <MenuLink href="/me/edit">Upravit záznamy</MenuLink>
              </div>
            </SubCard>

            <SubCard>
              <div className="text-sm font-semibold">Filtry</div>

              <label className="mt-3 block text-xs text-neutral-600">Období</label>
              <select
                className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              >
                <option value={14}>14 dní</option>
                <option value={30}>30 dní</option>
                <option value={60}>60 dní</option>
                <option value={90}>90 dní</option>
                <option value={180}>180 dní</option>
              </select>

              <label className="mt-3 block text-xs text-neutral-600">Zobrazení</label>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  className={`rounded-full border px-3 py-1 text-xs ${mode === "days" ? "bg-black text-white" : "bg-white"}`}
                  onClick={() => setMode("days")}
                >
                  Podle dní
                </button>
                <button
                  className={`rounded-full border px-3 py-1 text-xs ${mode === "sites" ? "bg-black text-white" : "bg-white"}`}
                  onClick={() => setMode("sites")}
                >
                  Podle staveb
                </button>
              </div>

              <label className="mt-3 block text-xs text-neutral-600">Stavba</label>
              <select
                className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
                value={siteFilter}
                onChange={(e) => setSiteFilter(e.target.value)}
              >
                <option value="ALL">Vše</option>
                {siteOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>

              <div className="mt-2 text-[11px] text-neutral-500">
                Doprava: pokud zadáš km u odchodu, použijí se km z odchodu. Jinak se bere automaticky kniha jízd (trips).
              </div>
            </SubCard>
          </div>
        </div>

        {err && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{err}</div>}
      </Card>

      {mode === "sites" ? (
        <div className="space-y-3">
          {sitesAgg.map((s) => (
            <Card key={s.site_id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-base font-semibold">{s.name}</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    {fmt(s.hours)} h • {fmt(s.hours_pay)} Kč
                  </div>
                </div>
                <Pill tone={s.paid_all ? "ok" : "warn"}>{s.paid_all ? "Zaplaceno" : "Nezaplaceno"}</Pill>
              </div>

              <div className="mt-3 rounded-2xl border bg-neutral-50 p-4 text-sm">
                <div className="text-xs text-neutral-600">Poznámka</div>
                <div className="mt-1 text-xs text-neutral-600">
                  Km a materiál jsou v uživatelském přehledu vedené po dnech. Pro fakturaci podle stavby použij admin JSON export.
                </div>
              </div>
            </Card>
          ))}

          {sitesAgg.length === 0 && (
            <Card>
              <div className="text-sm text-neutral-600">Žádné záznamy pro zvolené filtry.</div>
            </Card>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredRows.map((r) => (
            <Card key={r.day}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{r.day}</div>
                  <div className="mt-1 text-xs text-neutral-600">
                    Časy (zaokrouhlené): <b>{timeHM(r.first_in)}</b> → <b>{timeHM(r.last_out)}</b>
                  </div>
                </div>

                <div className="text-right">
                  <Pill tone={r.paid ? "ok" : "warn"}>{r.paid ? "Zaplaceno" : "Nezaplaceno"}</Pill>
                  <div className="mt-2 text-base font-semibold">{fmt(r.total)} Kč</div>
                </div>
              </div>

              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
                <SubCard>
                  <div className="text-xs text-neutral-600">Hodiny (zaok.)</div>
                  <div className="mt-1 font-semibold">{fmt(r.hours)} h</div>
                  <div className="text-xs text-neutral-600">Částka: {fmt(r.hours_pay)} Kč</div>
                </SubCard>

                <SubCard>
                  <div className="text-xs text-neutral-600">Doprava</div>
                  <div className="mt-1 font-semibold">{fmt(r.km, 1)} km</div>
                  <div className="text-xs text-neutral-600">
                    Částka: {fmt(r.km_pay)} Kč • zdroj: {r.km_source}
                  </div>
                </SubCard>

                <SubCard>
                  <div className="text-xs text-neutral-600">Materiál</div>
                  <div className="mt-1 font-semibold">{fmt(r.material)} Kč</div>
                </SubCard>
              </div>

              {r.material_notes?.length ? (
                <div className="mt-3 rounded-2xl border bg-white p-4 text-sm">
                  <div className="text-sm font-semibold">Materiál</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-neutral-700">
                    {r.material_notes.map((x, i) => (
                      <li key={i}>{x}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {(r.segments?.length || r.offsites?.length) ? (
                <div className="mt-3 rounded-2xl border bg-white p-4">
                  <div className="text-sm font-semibold">Detail (zaokrouhlené časy)</div>

                  {r.segments?.length ? (
                    <div className="mt-3 space-y-2">
                      {r.segments.map((s, i) => (
                        <div key={i} className="rounded-2xl border bg-neutral-50 p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold">{s.site_name || "—"}</div>
                            <div className="text-xs text-neutral-600">
                              {timeHM(s.in_time_rounded)} → {timeHM(s.out_time_rounded)} • {fmt(s.hours_rounded)} h
                            </div>
                          </div>
                          {s.note_work ? <div className="mt-2 text-sm text-neutral-700">{s.note_work}</div> : null}
                          <div className="mt-2 text-xs text-neutral-600">
                            Sazba: {fmt(s.hourly_rate)} Kč/h ({s.rate_source}) • Částka: {fmt(s.pay)} Kč
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}

                  {r.offsites?.length ? (
                    <div className="mt-3 space-y-2">
                      {r.offsites.map((o, i) => (
                        <div key={i} className="rounded-2xl border bg-amber-50 p-4 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-semibold">Mimo stavbu</div>
                            <div className="text-xs text-neutral-700">{fmt(o.hours)} h</div>
                          </div>
                          <div className="mt-1 text-sm text-neutral-700">{o.reason}</div>
                          <div className="mt-2 text-xs text-neutral-700">
                            Sazba: {fmt(o.hourly_rate)} Kč/h ({o.rate_source}) • Částka: {fmt(o.pay)} Kč
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          ))}

          {filteredRows.length === 0 && (
            <Card>
              <div className="text-sm text-neutral-600">Žádné záznamy pro zvolené filtry.</div>
            </Card>
          )}
        </div>
      )}

      <div className="pb-10" />
    </main>
  );
}
