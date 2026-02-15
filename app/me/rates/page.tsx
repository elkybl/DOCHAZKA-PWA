"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Site = { id: string; name: string };
type Row = { site_id: string; hourly_rate: number | null; km_rate: number | null };

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

export default function Page() {
  const router = useRouter();
  const token = useMemo(() => getToken(), []);

  const [sites, setSites] = useState<Site[]>([]);
  const [rows, setRows] = useState<Row[]>([]);

  const [defHourly, setDefHourly] = useState("");
  const [defKm, setDefKm] = useState("");

  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr(null);
    setInfo(null);
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const sRes = await fetch("/api/sites");
      const sData = await sRes.json().catch(() => ({}));
      setSites(sData.sites || []);

      // ⚠️ předpoklad: existuje endpoint na načtení sazeb
      const rRes = await fetch("/api/me/rates", { headers: { authorization: `Bearer ${token}` } });
      const rData = await rRes.json().catch(() => ({}));
      if (!rRes.ok) throw new Error(rData?.error || "Nešlo načíst sazby.");

      setDefHourly(String(rData.default_hourly_rate ?? ""));
      setDefKm(String(rData.default_km_rate ?? ""));
      setRows(rData.rows || []);
    } catch (e: any) {
      setErr(e.message || "Chyba");
    }
  }

  function patch(site_id: string, key: "hourly_rate" | "km_rate", val: string) {
    const n = val === "" ? null : Number(val);
    setRows((prev) => {
      const idx = prev.findIndex((x) => x.site_id === site_id);
      if (idx === -1) return [...prev, { site_id, hourly_rate: null, km_rate: null, [key]: n } as any];
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: n } as any;
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
        rows,
      };

      const res = await fetch("/api/me/rates", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo uložit sazby.");

      setInfo("Uloženo.");
      await load();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="space-y-4">
      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold">Moje sazby</h1>
            <p className="mt-1 text-xs text-neutral-500">
              Nastav si default sazby a případně sazby pro konkrétní stavby (přebijí default).
            </p>

            <div className="mt-3 flex flex-wrap gap-2">
              <Link className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm" href="/me">
                ← Zpět na Moje výdělek
              </Link>
              <Link className="rounded-xl border bg-white px-3 py-2 text-sm shadow-sm" href="/me/edit">
                Upravit záznamy
              </Link>
            </div>
          </div>

          <button
            onClick={save}
            disabled={busy}
            className="rounded-xl bg-black px-4 py-3 text-sm text-white disabled:opacity-50"
          >
            {busy ? "Ukládám…" : "Uložit"}
          </button>
        </div>

        {err && <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>}
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-700">Default sazby</h2>

        <label className="mt-3 block text-sm text-neutral-700">Hodinovka (Kč/h)</label>
        <input
          className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
          inputMode="decimal"
          value={defHourly}
          onChange={(e) => setDefHourly(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
          placeholder="např. 250"
        />

        <label className="mt-3 block text-sm text-neutral-700">Sazba za km (Kč/km)</label>
        <input
          className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
          inputMode="decimal"
          value={defKm}
          onChange={(e) => setDefKm(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
          placeholder="např. 7"
        />
      </div>

      <div className="rounded-2xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-neutral-700">Sazby podle stavby</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Když tu něco vyplníš, použije se to místo default sazeb pro danou stavbu.
        </p>

        <div className="mt-3 space-y-3">
          {sites.map((s) => {
            const r = rows.find((x) => x.site_id === s.id);
            return (
              <div key={s.id} className="rounded-2xl border bg-neutral-50 p-4">
                <div className="text-sm font-semibold">{s.name}</div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm text-neutral-700">Hodinovka (Kč/h)</label>
                    <input
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      inputMode="decimal"
                      value={r?.hourly_rate == null ? "" : String(r.hourly_rate)}
                      onChange={(e) => patch(s.id, "hourly_rate", e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
                      placeholder="nechat prázdné = default"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-neutral-700">Sazba za km (Kč/km)</label>
                    <input
                      className="mt-1 w-full rounded-xl border bg-white px-3 py-2"
                      inputMode="decimal"
                      value={r?.km_rate == null ? "" : String(r.km_rate)}
                      onChange={(e) => patch(s.id, "km_rate", e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
                      placeholder="nechat prázdné = default"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}
