"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtDateTimeCZFromIso } from "@/lib/time";

type Site = { id: string; name: string; is_pending?: boolean };
type TripRow = {
  id: string;
  start_time: string;
  end_time: string | null;
  site_id: string | null;
  site_name: string;
  purpose: string | null;
  note: string | null;
  distance_km: number | null;
  distance_km_user: number | null;
  km_final: number;
  km_source: "manual" | "osrm" | "haversine" | null;
};

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function getPosition(): Promise<{ lat: number; lng: number; accuracy_m?: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("GPS není dostupné"));
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy_m: Math.round(pos.coords.accuracy),
        }),
      (err) => reject(new Error(err.message || "Nepovedlo se načíst polohu")),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function TripsPage() {
  const router = useRouter();

  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>("");

  const [purpose, setPurpose] = useState("");
  const [note, setNote] = useState("");

  const [openTrip, setOpenTrip] = useState<{ id: string; start_time: string } | null>(null);

  const [rows, setRows] = useState<TripRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  // edit modal
  const [editId, setEditId] = useState<string | null>(null);
  const [editPurpose, setEditPurpose] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editKm, setEditKm] = useState("");

  async function loadSites() {
    const res = await fetch("/api/sites");
    const data = await res.json().catch(() => ({}));
    setSites(data.sites || []);
  }

  async function loadStatus() {
    const t = getToken();
    if (!t) return router.push("/login");

    const res = await fetch("/api/trips/status", { headers: { authorization: `Bearer ${t}` } });
    const data = await res.json().catch(() => ({}));
    setOpenTrip(data.open ? { id: data.open.id, start_time: data.open.start_time } : null);

    if (data.open?.site_id) setSelectedSite(String(data.open.site_id));
    if (data.open?.purpose) setPurpose(String(data.open.purpose));
  }

  async function loadDay() {
    const t = getToken();
    if (!t) return router.push("/login");

    const res = await fetch("/api/trips/day", { headers: { authorization: `Bearer ${t}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(data?.error || "Chyba");
      return;
    }
    setRows(data.rows || []);
  }

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.push("/login");
      return;
    }
    loadSites().catch(() => {});
    loadStatus().catch(() => {});
    loadDay().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalKm = useMemo(() => {
    const sum = rows.reduce((acc, r) => acc + (Number(r.km_final) || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [rows]);

  async function startTrip() {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return router.push("/login");

    setLoading(true);
    try {
      const pos = await getPosition();

      const res = await fetch("/api/trips/start", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          lat: pos.lat,
          lng: pos.lng,
          site_id: selectedSite || undefined,
          purpose: purpose.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo spustit jízdu.");

      setInfo("Jízda spuštěna.");
      await loadStatus();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function stopTrip() {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return router.push("/login");

    setLoading(true);
    try {
      const pos = await getPosition();

      const res = await fetch("/api/trips/stop", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          lat: pos.lat,
          lng: pos.lng,
          site_id: selectedSite || undefined,
          purpose: purpose.trim() || undefined,
          note: note.trim() || undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo ukončit jízdu.");

      const msg = data?.fallback_used
        ? "Jízda ukončena. (OSRM nedostupné → použita GPS vzdálenost)"
        : "Jízda ukončena. Km spočítány.";

      setInfo(msg);

      setPurpose("");
      setNote("");

      await loadStatus();
      await loadDay();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  function openEdit(r: TripRow) {
    setEditId(r.id);
    setEditPurpose(r.purpose || "");
    setEditNote(r.note || "");
    setEditKm(r.distance_km_user != null ? String(r.distance_km_user) : "");
  }

  async function saveEdit() {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return router.push("/login");
    if (!editId) return;

    let kmUser: number | null | undefined = undefined;
    const raw = editKm.trim();
    if (raw === "") kmUser = null;
    else {
      const n = Number(raw);
      if (Number.isNaN(n) || n < 0) return setErr("Km jsou neplatná.");
      kmUser = Math.round(n * 100) / 100;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/trips/edit", {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          id: editId,
          purpose: editPurpose.trim() || undefined,
          note: editNote.trim() || undefined,
          site_id: selectedSite || undefined,
          distance_km_user: kmUser,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo uložit úpravu.");

      setInfo("Uloženo.");
      setEditId(null);
      await loadDay();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setLoading(false);
    }
  }

  async function deleteTrip(id: string) {
    setErr(null);
    setInfo(null);

    const t = getToken();
    if (!t) return router.push("/login");

    const ok = window.confirm("Smazat jízdu? (Nejde vrátit zpět)");
    if (!ok) return;

    setBusyId(id);
    try {
      const res = await fetch(`/api/trips/${id}`, {
        method: "DELETE",
        headers: { authorization: `Bearer ${t}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo smazat.");

      setInfo("Smazáno.");
      await loadStatus();
      await loadDay();
    } catch (e: any) {
      setErr(e.message || "Chyba");
    } finally {
      setBusyId(null);
    }
  }

  async function exportMonthCsv() {
    setErr(null);
    setInfo(null);

    const d = new Date();
    const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    window.open(`/api/trips/export?month=${month}`, "_blank");
  }

  return (
    <main className="space-y-4 px-3">
      <div className="sticky top-0 z-20 -mx-3 bg-neutral-50/90 px-3 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => router.back()}
            className="rounded-2xl border bg-white px-3 py-2 text-sm shadow-sm"
            aria-label="Zpět"
          >
            ←
          </button>
          <div className="text-base font-semibold">Kniha jízd</div>
          <Link href="/attendance" className="rounded-2xl border bg-white px-3 py-2 text-sm shadow-sm">
            Docházka
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm text-neutral-600">Stav</div>
            <div
              className={cx(
                "mt-2 inline-flex rounded-2xl px-4 py-2 text-sm font-medium",
                openTrip ? "bg-emerald-50 text-emerald-800" : "bg-neutral-100 text-neutral-800"
              )}
            >
              {openTrip ? "Jízda běží" : "Žádná jízda neběží"}
            </div>
            {openTrip?.start_time && (
              <div className="mt-2 text-xs text-neutral-600">
                Start: {fmtDateTimeCZFromIso(openTrip.start_time)}
              </div>
            )}
          </div>

          <button onClick={exportMonthCsv} className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm">
            Export CSV (tento měsíc)
          </button>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="block text-sm text-neutral-700">Stavba / akce (volitelné)</label>
            <select
              className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              value={selectedSite}
              onChange={(e) => setSelectedSite(e.target.value)}
            >
              <option value="">— bez stavby —</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.is_pending ? " (dočasná)" : ""}
                </option>
              ))}
            </select>
            <div className="mt-2 text-xs text-neutral-500">Doporučení: dej aspoň účel (“Kolín – zásah”, “Sklad”, “Nákup”).</div>
          </div>

          <div className="flex items-end">
            {openTrip ? (
              <button
                onClick={stopTrip}
                disabled={loading}
                className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                {loading ? "Ukládám…" : "Stop jízdy"}
              </button>
            ) : (
              <button
                onClick={startTrip}
                disabled={loading}
                className="w-full rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                {loading ? "Ukládám…" : "Start jízdy"}
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm text-neutral-700">Účel / popis (volitelné)</label>
            <input
              className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value.slice(0, 200))}
              placeholder="Např. Kolín – zásah Novák"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral-700">Poznámka (volitelné)</label>
            <input
              className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              placeholder="Např. objížďka / vyzvednutí materiálu…"
            />
          </div>
        </div>

        {err && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{err}</div>}
        {info && <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div>}
      </div>

      <div className="rounded-3xl border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-base font-semibold">Dnešní jízdy</div>
            <div className="mt-1 text-xs text-neutral-600">Součet dnes: {totalKm} km</div>
          </div>
          <button className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm" onClick={loadDay}>
            Obnovit
          </button>
        </div>

        <div className="mt-4 space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-3xl border bg-neutral-50 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">
                    {r.start_time.slice(11, 16)} → {r.end_time ? r.end_time.slice(11, 16) : "—"}
                    <span className="mx-2 text-neutral-400">•</span>
                    {r.site_name || "—"}
                  </div>
                  <div className="mt-1 text-xs text-neutral-700">
                    Účel: {r.purpose || "—"} {r.note ? ` • Pozn.: ${r.note}` : ""}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-lg font-semibold">{r.km_final.toFixed(2)} km</div>
                  <div className="mt-1 text-[11px] text-neutral-600">
                    Zdroj: {r.km_source || "—"}
                    {r.distance_km_user != null ? " (upraveno)" : ""}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm" onClick={() => openEdit(r)}>
                  Upravit (km / text)
                </button>

                <button
                  className="rounded-2xl border bg-white px-4 py-2 text-sm shadow-sm"
                  onClick={() => deleteTrip(r.id)}
                  disabled={busyId === r.id}
                >
                  {busyId === r.id ? "Mažu…" : "Smazat"}
                </button>
              </div>
            </div>
          ))}

          {rows.length === 0 && (
            <div className="rounded-3xl border bg-white p-6 text-sm text-neutral-600">Zatím žádné dnešní jízdy.</div>
          )}
        </div>
      </div>

      {editId && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-3 sm:items-center">
          <div className="w-full max-w-xl rounded-3xl border bg-white p-6 shadow-xl">
            <div className="text-base font-semibold">Upravit jízdu</div>
            <div className="mt-1 text-xs text-neutral-600">
              Km můžeš přepsat (objížďka / více zastávek). Když pole Km smažeš, vrátí se na vypočtené.
            </div>

            <label className="mt-4 block text-sm text-neutral-700">Účel</label>
            <input
              className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              value={editPurpose}
              onChange={(e) => setEditPurpose(e.target.value.slice(0, 200))}
            />

            <label className="mt-4 block text-sm text-neutral-700">Poznámka</label>
            <input
              className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              value={editNote}
              onChange={(e) => setEditNote(e.target.value.slice(0, 500))}
            />

            <label className="mt-4 block text-sm text-neutral-700">Km (ručně)</label>
            <input
              className="mt-2 w-full rounded-2xl border bg-white px-4 py-3 text-sm"
              inputMode="decimal"
              value={editKm}
              onChange={(e) => setEditKm(e.target.value.replace(/[^\d.]/g, "").slice(0, 10))}
              placeholder="nechat prázdné = použít vypočtené"
            />

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button
                onClick={saveEdit}
                disabled={loading}
                className="rounded-2xl bg-black px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                {loading ? "Ukládám…" : "Uložit"}
              </button>
              <button onClick={() => setEditId(null)} className="rounded-2xl border bg-white px-4 py-3 text-sm shadow-sm">
                Zavřít
              </button>
            </div>

            {err && <div className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{err}</div>}
          </div>
        </div>
      )}
    </main>
  );
}
