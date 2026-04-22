"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppNav";

type Site = { id: string; name: string };
type RateRow = { site_id: string; hourly_rate: number | null; km_rate: number | null; programming_rate?: number | null };

type RatesResponse = {
  default_hourly_rate?: number | null;
  default_km_rate?: number | null;
  programming_rate?: number | null;
  is_programmer?: boolean;
  rows?: RateRow[];
  error?: string;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function fmt(n: unknown) {
  const x = Number(n);
  if (!Number.isFinite(x)) return "0";
  return x.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

function cleanNum(value: string) {
  return value.replace(/[^\d.,]/g, "").replace(",", ".").slice(0, 10);
}

export default function RatesPage() {
  const router = useRouter();
  const token = useMemo(() => getToken(), []);
  const [sites, setSites] = useState<Site[]>([]);
  const [rows, setRows] = useState<RateRow[]>([]);
  const [defHourly, setDefHourly] = useState("");
  const [defKm, setDefKm] = useState("");
  const [defProg, setDefProg] = useState("");
  const [isProg, setIsProg] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");

  async function load() {
    setErr(null);
    setInfo(null);
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const sRes = await fetch("/api/sites");
      const sData = (await sRes.json().catch(() => ({}))) as { sites?: Site[] };
      setSites(sData.sites || []);

      const rRes = await fetch("/api/me/rates", { headers: { authorization: `Bearer ${token}` } });
      const rData = (await rRes.json().catch(() => ({}))) as RatesResponse;
      if (!rRes.ok) throw new Error(rData.error || "Nešlo načíst sazby.");

      setDefHourly(String(rData.default_hourly_rate ?? ""));
      setDefKm(String(rData.default_km_rate ?? ""));
      setDefProg(String(rData.programming_rate ?? ""));
      setIsProg(!!rData.is_programmer);
      setRows(rData.rows || []);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Chyba načtení.");
    }
  }

  function patch(site_id: string, key: "hourly_rate" | "km_rate" | "programming_rate", value: string) {
    const nextValue = value === "" ? null : Number(value);
    setRows((prev) => {
      const idx = prev.findIndex((row) => row.site_id === site_id);
      if (idx === -1) return [...prev, { site_id, hourly_rate: null, km_rate: null, [key]: nextValue }];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: nextValue };
      return copy;
    });
  }

  async function save() {
    setErr(null);
    setInfo(null);
    if (!token) return;
    setBusy(true);
    try {
      const payload = {
        default_hourly_rate: defHourly === "" ? null : Number(defHourly),
        default_km_rate: defKm === "" ? null : Number(defKm),
        programming_rate: !isProg ? null : defProg === "" ? null : Number(defProg),
        rows,
      };

      const res = await fetch("/api/me/rates", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Nešlo uložit sazby.");

      setInfo("Uloženo.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Chyba uložení.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filteredSites = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sites;
    return sites.filter((site) => site.name.toLowerCase().includes(q));
  }, [sites, query]);

  return (
    <AppShell
      area="auto"
      title="Moje sazby"
      subtitle="Hodinovky a doprava pro výpočty výdělků."
      actions={
        <button onClick={save} disabled={busy} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm disabled:opacity-50">
          {busy ? "Ukládám" : "Uložit"}
        </button>
      }
    >
      <section className="grid gap-3 md:grid-cols-3">
        <RateStat label="Hodinovka" value={`${fmt(defHourly)} Kč/h`} />
        <RateStat label="Doprava" value={`${fmt(defKm)} Kč/km`} />
        <RateStat label="Programování" value={isProg ? `${fmt(defProg)} Kč/h` : "Nevyužito"} />
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Hodinovka Kč/h">
            <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" inputMode="decimal" value={defHourly} onChange={(e) => setDefHourly(cleanNum(e.target.value))} />
          </Field>
          <Field label="Doprava Kč/km">
            <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" inputMode="decimal" value={defKm} onChange={(e) => setDefKm(cleanNum(e.target.value))} />
          </Field>
          {isProg ? (
            <Field label="Programování Kč/h">
              <input className="mt-2 w-full rounded-lg border px-3 py-2 text-sm" inputMode="decimal" value={defProg} onChange={(e) => setDefProg(cleanNum(e.target.value))} />
            </Field>
          ) : null}
        </div>
        {err ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
        {info ? <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div> : null}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Sazby podle stavby</h2>
          <input className="w-full rounded-lg border px-3 py-2 text-sm sm:w-72" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat stavbu" />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {filteredSites.map((site) => {
            const row = rows.find((item) => item.site_id === site.id);
            return (
              <article key={site.id} className="rounded-lg border bg-slate-50 p-4">
                <div className="font-semibold">{site.name}</div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <Field label="Hodinovka Kč/h">
                    <input className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" inputMode="decimal" value={row?.hourly_rate == null ? "" : String(row.hourly_rate)} onChange={(e) => patch(site.id, "hourly_rate", cleanNum(e.target.value))} placeholder="Default" />
                  </Field>
                  <Field label="Doprava Kč/km">
                    <input className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" inputMode="decimal" value={row?.km_rate == null ? "" : String(row.km_rate)} onChange={(e) => patch(site.id, "km_rate", cleanNum(e.target.value))} placeholder="Default" />
                  </Field>
                  {isProg ? (
                    <Field label="Programování Kč/h">
                      <input className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" inputMode="decimal" value={row?.programming_rate == null ? "" : String(row.programming_rate)} onChange={(e) => patch(site.id, "programming_rate", cleanNum(e.target.value))} placeholder="Default" />
                    </Field>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </AppShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600">{label}{children}</label>;
}

function RateStat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="text-xs text-slate-500">{label}</div><div className="mt-2 text-2xl font-semibold">{value}</div></div>;
}
