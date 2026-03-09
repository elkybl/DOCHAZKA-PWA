"use client";

import { useEffect, useMemo, useState } from "react";

type Site = {
  id: string;
  name: string;
  lat: number | null;
  lng: number | null;
  radius_m: number | null;
};

type Me = {
  id: string;
  name: string;
  role: "admin" | "user";
  is_programmer?: boolean;
};

type Pos = { lat: number; lng: number; accuracy: number };

async function getToken(): Promise<string | null> {
  try {
    return localStorage.getItem("token");
  } catch {
    return null;
  }
}

function logout() {
  try {
    localStorage.removeItem("token");
  } catch {}
  window.location.href = "/login";
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

async function getPosition(): Promise<Pos> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolokace není dostupná."));
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      (err) => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
    );
  });
}

function pickNearestSite(pos: Pos, sites: Site[], fallbackRadiusM = 250) {
  let best: { site: Site; dist: number } | null = null;

  for (const s of sites) {
    if (s.lat == null || s.lng == null) continue;
    const dist = haversineMeters(pos, { lat: s.lat, lng: s.lng });
    const radius = s.radius_m ?? fallbackRadiusM;
    if (dist <= radius) {
      if (!best || dist < best.dist) best = { site: s, dist };
    }
  }
  return best;
}

function asArray<T = any>(v: any): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

export default function AttendancePage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [present, setPresent] = useState<boolean>(false);
  const [activeSiteName, setActiveSiteName] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  const [pos, setPos] = useState<Pos | null>(null);
  const [nearest, setNearest] = useState<{ site: Site; dist: number } | null>(null);

  // manual override (optional)
  const [manualPickOpen, setManualPickOpen] = useState(false);
  const [manualSiteId, setManualSiteId] = useState<string | null>(null);

  // temporary site request
  const [tempOpen, setTempOpen] = useState(false);
  const [tempName, setTempName] = useState("");

  // manual day (nouzovka mimo lokaci)
  const [manualOpen, setManualOpen] = useState(false);
  const [manualDay, setManualDay] = useState(""); // YYYY-MM-DD
  const [manualFrom, setManualFrom] = useState("08:00");
  const [manualTo, setManualTo] = useState("16:00");
  const [manualReason, setManualReason] = useState("Zapomenutý příchod/odchod");

  // optional details at OUT
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [note, setNote] = useState("");
  const [km, setKm] = useState("");
  const [matDesc, setMatDesc] = useState("");
  const [matAmount, setMatAmount] = useState("");

  // programmer optional
  const [progHours, setProgHours] = useState("");
  const [progNote, setProgNote] = useState("");

  const nearestLabel = useMemo(() => {
    if (!nearest) return null;
    const d = Math.round(nearest.dist);
    return `${nearest.site.name} – ${d} m`;
  }, [nearest]);

  async function load() {
    setErr(null);
    setInfo(null);

    const t = await getToken();
    if (!t) {
      setErr("Chybí přihlášení.");
      return;
    }

    // v15: /api/me/profile
    const meRes = await fetch("/api/me/profile", { headers: { authorization: `Bearer ${t}` } });
    if (meRes.status === 401) return logout();
    const meJson = await meRes.json().catch(() => ({}));
    if (!meRes.ok) throw new Error(meJson?.error || "Nešlo načíst uživatele.");

    const meObj = meJson?.user || null;
    if (!meObj || !meObj.name) throw new Error("Nešlo načíst uživatele.");
    setMe(meObj as Me);
    setIsAdmin(((meObj as any).role || "user") === "admin");

    // /api/sites
    const sitesRes = await fetch("/api/sites", { headers: { authorization: `Bearer ${t}` } });
    if (sitesRes.status === 401) return logout();
    const sitesJson = await sitesRes.json().catch(() => ({}));
    if (!sitesRes.ok) throw new Error(sitesJson?.error || "Nešlo načíst stavby.");

    const sitesArr =
      sitesJson?.sites ??
      sitesJson?.data?.sites ??
      sitesJson?.data ??
      sitesJson;

    setSites(asArray<Site>(sitesArr));

    // v15: /api/attendance/status -> { status: "IN"|"OUT", open: {site_id,...} | null }
    const statusRes = await fetch("/api/attendance/status", { headers: { authorization: `Bearer ${t}` } });
    if (statusRes.status === 401) return logout();
    const statusJson = await statusRes.json().catch(() => ({}));
    if (!statusRes.ok) throw new Error(statusJson?.error || "Nešlo načíst stav.");

    const isOpen = statusJson?.status === "IN" && !!statusJson?.open;
    setPresent(!!isOpen);
    if (!isOpen) {
      setActiveSiteName(null);
    } else {
      const openSiteId = statusJson?.open?.site_id ?? null;
      const found = openSiteId ? (asArray<Site>(sitesArr).find((s) => s.id === openSiteId) || null) : null;
      setActiveSiteName(found?.name || null);
    }
  }

  async function refreshGeo(sitesList: Site[]) {
    try {
      const p = await getPosition();
      setPos(p);
      const best = pickNearestSite(p, sitesList);
      setNearest(best);
    } catch {
      setPos(null);
      setNearest(null);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e: any) {
        setErr(e?.message || "Chyba");
      }
    })();
  }, []);

  useEffect(() => {
    // default manual day = today
    if (!manualDay) {
      const d = new Date();
      const iso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
      setManualDay(iso);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (sites.length) refreshGeo(sites);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sites.length]);

  async function doIn() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const t = await getToken();
      if (!t) throw new Error("Chybí přihlášení.");

      // refresh position for best accuracy
      const p = await getPosition().catch(() => null);
      if (p) setPos(p);

      let siteId: string | null = manualSiteId;

      // if not manually picked, try nearest within radius
      if (!siteId && p && sites.length) {
        const best = pickNearestSite(p, sites);
        setNearest(best);
        if (best) siteId = best.site.id;
      }

      // if still no site, ask for temporary site request
      if (!siteId) {
        setTempOpen(true);
        setInfo("Nenašla se stavba v dosahu. Zadej dočasný název a odešleme žádost adminovi.");
        return;
      }

      const res = await fetch("/api/attendance/in", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          site_id: siteId,
          lat: p?.lat,
          lng: p?.lng,
          accuracy_m: p?.accuracy,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo uložit příchod.");

      setPresent(true);
      const s = sites.find((x) => x.id === siteId);
      setActiveSiteName(s?.name || null);
      setInfo(`Příchod uložen${s?.name ? ` – ${s.name}` : ""}.`);
      setManualSiteId(null);
      setDetailsOpen(false);
    } catch (e: any) {
      setErr(e?.message || "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function submitTempSiteAndIn() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const t = await getToken();
      if (!t) throw new Error("Chybí přihlášení.");

      const p = pos || (await getPosition().catch(() => null));
      if (!p) throw new Error("Nepodařilo se získat polohu.");

      const name = tempName.trim();
      if (!name) throw new Error("Zadej název dočasné stavby.");

      // v15: create pending site (admin schvaluje)
      const reqRes = await fetch("/api/sites/pending", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          name,
          lat: p.lat,
          lng: p.lng,
          radius_m: 200,
        }),
      });

      const reqJson = await reqRes.json().catch(() => ({}));
      if (!reqRes.ok) throw new Error(reqJson?.error || "Nešlo odeslat žádost o stavbu.");

      const newSiteId = reqJson?.site?.id;
      if (!newSiteId) throw new Error("Chybí ID nové dočasné stavby.");

      // create IN on pending site
      const inRes = await fetch("/api/attendance/in", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          site_id: newSiteId,
          lat: p.lat,
          lng: p.lng,
          accuracy_m: p.accuracy,
        }),
      });

      const inJson = await inRes.json().catch(() => ({}));
      if (!inRes.ok) throw new Error(inJson?.error || "Nešlo uložit příchod.");

      setPresent(true);
      setActiveSiteName(`Dočasná: ${name}`);
      setTempOpen(false);
      setTempName("");
      setInfo("Příchod uložen jako dočasná stavba. Admin ji potvrdí.");
    } catch (e: any) {
      setErr(e?.message || "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function doOut() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const t = await getToken();
      if (!t) throw new Error("Chybí přihlášení.");

      const kmVal = km.trim() ? Number(km) : undefined;
      if (km.trim() && (Number.isNaN(kmVal) || (kmVal ?? 0) < 0)) throw new Error("Kilometry jsou neplatné.");

      const matAmt = matAmount.trim() ? Number(matAmount) : undefined;
      if (matAmount.trim() && (Number.isNaN(matAmt) || (matAmt ?? 0) < 0)) throw new Error("Materiál částka je neplatná.");

      const p = await getPosition().catch(() => null);

      const res = await fetch("/api/attendance/out", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          note_work: note.trim() || undefined,
          km: kmVal,
          material_desc: matDesc.trim() || undefined,
          material_amount: matAmt,
          programming_hours: me?.is_programmer && progHours.trim() ? Number(progHours) : undefined,
          programming_note: me?.is_programmer ? (progNote.trim() || undefined) : undefined,
          lat: p?.lat,
          lng: p?.lng,
          accuracy_m: p?.accuracy,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo uložit odchod.");

      setPresent(false);
      setActiveSiteName(null);
      setInfo("Odchod uložen.");
      setNote("");
      setKm("");
      setMatDesc("");
      setMatAmount("");
      setProgHours("");
      setProgNote("");
      setDetailsOpen(false);
    } catch (e: any) {
      setErr(e?.message || "Chyba");
    } finally {
      setBusy(false);
    }
  }

  async function submitManualDay() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const t = await getToken();
      if (!t) throw new Error("Chybí přihlášení.");

      const day = manualDay.trim();
      if (!day) throw new Error("Vyber datum.");

      // basic time validation HH:MM
      const tf = manualFrom.trim();
      const tt = manualTo.trim();
      if (!/^\d{2}:\d{2}$/.test(tf) || !/^\d{2}:\d{2}$/.test(tt)) throw new Error("Čas musí být ve formátu HH:MM.");

      const reason = manualReason.trim() || "Mimo lokaci";

      // Use current GPS if available (optional)
      const p = await getPosition().catch(() => null);
      if (p) setPos(p);

      const siteId = manualSiteId || (nearest?.site?.id ?? null);

      const res = await fetch("/api/attendance/offsite", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          site_id: siteId,
          day_local: day,
          time_from: tf,
          time_to: tt,
          offsite_reason: `MIMO LOKACI – ${reason}`,
          // offsite_hours will be computed on server from time_from/time_to
          offsite_hours: 1,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nešlo uložit nouzový záznam.");

      setManualOpen(false);
      setInfo("Nouzový záznam uložen (MIMO LOKACI). Admin to uvidí v docházce.");
    } catch (e: any) {
      setErr(e?.message || "Chyba");
    } finally {
      setBusy(false);
    }
  }

  const statusChip = present
    ? `Na směně${activeSiteName ? ` – ${activeSiteName}` : ""}`
    : "Mimo směnu";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="w-full">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">Docházka</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                <span>
                  Přihlášen: <span className="font-medium text-slate-900">{me?.name || "—"}</span>
                </span>
                {isAdmin && (
                  <a
                    href="/admin"
                    className="rounded-lg border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                  >
                    Admin
                  </a>
                )}
                <button
                  type="button"
                  className="rounded-lg border bg-white px-2 py-1 text-xs hover:bg-slate-50"
                  onClick={logout}
                >
                  Odhlásit
                </button>
              </div>
            </div>

            <div className="mt-1 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-800">
              {statusChip}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border bg-white p-4">
            <div className="text-sm text-slate-600">Auto výběr stavby podle polohy</div>
            <div className="mt-1 text-base font-medium text-slate-900">
              {nearestLabel || "Žádná stavba v dosahu"}
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setManualPickOpen(true)}
                className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                Změnit
              </button>

              {!nearest && (
                <button
                  type="button"
                  onClick={() => setTempOpen(true)}
                  className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                >
                  Nenalezl jsem stavbu
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="w-full md:max-w-sm">
          <div className="rounded-2xl border bg-white p-4">
            <div className="grid gap-3">
              <button
                type="button"
                disabled={busy || present}
                onClick={doIn}
                className="w-full rounded-2xl bg-emerald-600 px-4 py-4 text-lg font-semibold text-white disabled:opacity-50"
              >
                PŘÍCHOD
              </button>

              <button
                type="button"
                disabled={busy || !present}
                onClick={doOut}
                className="w-full rounded-2xl bg-slate-900 px-4 py-4 text-lg font-semibold text-white disabled:opacity-50"
              >
                ODCHOD
              </button>

              <div className="flex gap-2">
                <a
                  href="/me/edit"
                  className="flex-1 rounded-xl border bg-white px-3 py-2 text-center text-sm hover:bg-slate-50"
                >
                  Doplnit práci
                </a>
                <a
                  href="/me"
                  className="flex-1 rounded-xl border bg-white px-3 py-2 text-center text-sm hover:bg-slate-50"
                >
                  Moje výdělky
                </a>
              </div>

              <button
                type="button"
                className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => setManualOpen(true)}
              >
                Nouzovka: přidat záznam mimo lokaci
              </button>

              <button
                type="button"
                className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => setDetailsOpen((v) => !v)}
              >
                {detailsOpen ? "Skrýt doplnění" : "Doplnit teď (volitelné)"}
              </button>

              {detailsOpen && (
                <div className="mt-1 grid gap-2">
                  <textarea
                    className="w-full rounded-xl border p-2 text-sm"
                    placeholder="Co se dělalo (volitelné)"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="w-full rounded-xl border p-2 text-sm"
                      placeholder="KM (volitelné)"
                      value={km}
                      onChange={(e) => setKm(e.target.value)}
                    />
                    <input
                      className="w-full rounded-xl border p-2 text-sm"
                      placeholder="Materiál Kč (volitelné)"
                      value={matAmount}
                      onChange={(e) => setMatAmount(e.target.value)}
                    />
                  </div>
                  <input
                    className="w-full rounded-xl border p-2 text-sm"
                    placeholder="Materiál popis (volitelné)"
                    value={matDesc}
                    onChange={(e) => setMatDesc(e.target.value)}
                  />

                  {me?.is_programmer && (
                    <div className="mt-1 grid gap-2 rounded-xl border bg-slate-50 p-2">
                      <div className="text-xs font-semibold text-slate-700">Programování</div>
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          className="w-full rounded-xl border p-2 text-sm"
                          placeholder="Hodiny"
                          value={progHours}
                          onChange={(e) => setProgHours(e.target.value)}
                        />
                        <input
                          className="w-full rounded-xl border p-2 text-sm"
                          placeholder="Poznámka"
                          value={progNote}
                          onChange={(e) => setProgNote(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {err && <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">{err}</div>}
              {info && <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div>}
            </div>
          </div>
        </div>
      </div>

      {/* Manual picker modal */}
      {manualPickOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 md:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow">
            <div className="text-lg font-semibold">Vybrat stavbu</div>
            <div className="mt-2 max-h-96 overflow-auto rounded-xl border">
              {sites.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="flex w-full items-center justify-between border-b px-3 py-3 text-left hover:bg-slate-50"
                  onClick={() => {
                    setManualSiteId(s.id);
                    setManualPickOpen(false);
                    setInfo(`Vybráno: ${s.name}`);
                  }}
                >
                  <span>{s.name}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => setManualPickOpen(false)}
              >
                Zavřít
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Temporary site modal */}
      {tempOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 md:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow">
            <div className="text-lg font-semibold">Dočasná stavba</div>
            <div className="mt-1 text-sm text-slate-600">
              Napiš název (např. „Novák – Beroun“). Odešle se žádost adminovi a příchod se uloží jako dočasný.
            </div>
            <input
              className="mt-3 w-full rounded-xl border p-2 text-sm"
              placeholder="Název dočasné stavby"
              value={tempName}
              onChange={(e) => setTempName(e.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => setTempOpen(false)}
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={submitTempSiteAndIn}
              >
                Odeslat a příchod
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual (offsite) day modal */}
      {manualOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 md:items-center">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 shadow">
            <div className="text-lg font-semibold">Nouzovka: záznam mimo lokaci</div>
            <div className="mt-1 text-sm text-slate-600">
              Použij, když jsi zapomněl příchod/odchod. Uloží se jako <b>MIMO LOKACI</b> a admin to uvidí v docházce.
            </div>

            <div className="mt-3 grid gap-2">
              <label className="text-xs text-slate-600">Datum</label>
              <input
                type="date"
                className="w-full rounded-xl border p-2 text-sm"
                value={manualDay}
                onChange={(e) => setManualDay(e.target.value)}
              />

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-600">Od</label>
                  <input
                    type="time"
                    className="mt-1 w-full rounded-xl border p-2 text-sm"
                    value={manualFrom}
                    onChange={(e) => setManualFrom(e.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-600">Do</label>
                  <input
                    type="time"
                    className="mt-1 w-full rounded-xl border p-2 text-sm"
                    value={manualTo}
                    onChange={(e) => setManualTo(e.target.value)}
                  />
                </div>
              </div>

              <label className="text-xs text-slate-600">Poznámka pro admina</label>
              <input
                className="w-full rounded-xl border p-2 text-sm"
                placeholder="Např. zapomněl jsem se odkliknout"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
              />

              <label className="text-xs text-slate-600">Akce (volitelně)</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => setManualPickOpen(true)}
                >
                  Vybrat akci
                </button>
                <button
                  type="button"
                  className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => setManualSiteId(null)}
                >
                  Bez akce
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-xl border bg-white px-3 py-2 text-sm hover:bg-slate-50"
                onClick={() => setManualOpen(false)}
              >
                Zrušit
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                onClick={submitManualDay}
              >
                Uložit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}