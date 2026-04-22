"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { BottomNav } from "@/components/AppNav";
import { calendarTypeLabels, type CalendarItemType } from "@/lib/calendar";

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
type CalendarItem = {
  id: string;
  type: CalendarItemType;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string | null;
};
type JsonRecord = Record<string, unknown> & {
  error?: string;
  sites?: unknown;
  data?: JsonRecord;
  present?: unknown;
  is_present?: unknown;
  status?: unknown;
  open?: JsonRecord;
  site_id?: unknown;
  active_site_id?: unknown;
  site_name?: unknown;
  active_site_name?: unknown;
  current_site_name?: unknown;
  items?: unknown;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" ? (value as JsonRecord) : null;
}

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
    localStorage.removeItem("user");
  } catch {}
  window.location.href = "/login";
}

async function fetchJSON(url: string, token: string) {
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const text = await res.text();
  let json: JsonRecord | null = null;
  try {
    json = asRecord(text ? JSON.parse(text) : null);
  } catch {
    json = null;
  }
  return { res, json };
}

function extractUser(obj: unknown): Me | null {
  const root = asRecord(obj);
  const data = asRecord(root?.data);
  const u =
    asRecord(root?.user) ||
    asRecord(root?.me) ||
    asRecord(root?.profile) ||
    asRecord(data?.user) ||
    asRecord(data?.me) ||
    asRecord(data?.profile) ||
    root;
  if (!u) return null;

  const name = u.name ?? u.full_name ?? u.username ?? u.email ?? u.phone ?? null;
  const roleVal = u.role ?? u.user_role ?? u.userRole ?? null;
  const role: "admin" | "user" = roleVal === "admin" || roleVal === "ADMIN" || u.is_admin === true ? "admin" : "user";

  if (!name) return null;
  return {
    id: String(u.id ?? u.user_id ?? u.uid ?? ""),
    name: String(name),
    role,
    is_programmer: !!(u.is_programmer ?? u.programmer ?? false),
  };
}

function getErrorMessage(error: unknown, fallback = "Došlo k chybě.") {
  return error instanceof Error ? error.message : fallback;
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
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
    if (dist <= radius && (!best || dist < best.dist)) best = { site: s, dist };
  }
  return best;
}

function hoursFromTimes(from: string, to: string) {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const mins = th * 60 + tm - (fh * 60 + fm);
  return Math.max(0, mins / 60);
}

function ActionButton({
  children,
  disabled,
  onClick,
  tone = "primary",
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  tone?: "primary" | "danger" | "ghost";
}) {
  const cls =
    tone === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : tone === "danger"
      ? "bg-blue-800 text-white hover:bg-blue-900"
      : "border border-slate-300 bg-white text-slate-900 hover:bg-slate-50";

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-4 py-3 text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed disabled:opacity-45 ${cls}`}
    >
      {children}
    </button>
  );
}

export default function AttendancePage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [me, setMe] = useState<Me | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [present, setPresent] = useState(false);
  const [activeSiteName, setActiveSiteName] = useState<string | null>(null);
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);

  const [pos, setPos] = useState<Pos | null>(null);
  const [nearest, setNearest] = useState<{ site: Site; dist: number } | null>(null);

  const [manualPickOpen, setManualPickOpen] = useState(false);
  const [manualSiteId, setManualSiteId] = useState<string | null>(null);
  const [tempOpen, setTempOpen] = useState(false);
  const [tempName, setTempName] = useState("");

  const [note, setNote] = useState("");
  const [km, setKm] = useState("");
  const [matDesc, setMatDesc] = useState("");
  const [matAmount, setMatAmount] = useState("");
  const [manualOutTime, setManualOutTime] = useState("");
  const [didProgram, setDidProgram] = useState(false);
  const [progHours, setProgHours] = useState("");
  const [progNote, setProgNote] = useState("");
  const [todayCalendar, setTodayCalendar] = useState<CalendarItem[]>([]);

  const [manualDayOpen, setManualDayOpen] = useState(false);
  const [manualDayDate, setManualDayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualDayFrom, setManualDayFrom] = useState("08:00");
  const [manualDayTo, setManualDayTo] = useState("16:00");
  const [manualDaySiteId, setManualDaySiteId] = useState<string | null>(null);
  const [manualDayNote, setManualDayNote] = useState("");
  const [manualDayKm, setManualDayKm] = useState("");

  const selectedSite = manualSiteId ? sites.find((s) => s.id === manualSiteId) ?? null : nearest?.site ?? null;

  const nearestLabel = useMemo(() => {
    if (manualSiteId) return sites.find((s) => s.id === manualSiteId)?.name ?? "Ručně vybraná stavba";
    if (!nearest) return null;
    return `${nearest.site.name} · ${Math.round(nearest.dist)} m`;
  }, [manualSiteId, nearest, sites]);

  async function load() {
    setErr(null);
    setInfo(null);

    const t = await getToken();
    if (!t) {
      setErr("Chybí přihlášení.");
      return;
    }

    const meUrls = ["/api/me/profile", "/api/me", "/api/auth/me"];
    let meObj: Me | null = null;
    for (const u of meUrls) {
      const { res, json } = await fetchJSON(u, t);
      if (res.status === 401) return logout();
      if (!res.ok) continue;
      const extracted = extractUser(json);
      if (extracted) {
        meObj = extracted;
        break;
      }
    }

    if (!meObj) throw new Error("Nepodařilo se načíst uživatele.");
    setMe(meObj);
    try {
      localStorage.setItem("user", JSON.stringify(meObj));
    } catch {}

    const sitesTry = await fetchJSON("/api/sites", t);
    if (sitesTry.res.status === 401) return logout();
    if (!sitesTry.res.ok) throw new Error(sitesTry.json?.error || "Nepodařilo se načíst stavby.");
    const safeSites = Array.isArray(sitesTry.json?.sites ?? sitesTry.json?.data?.sites ?? sitesTry.json?.data)
      ? ((sitesTry.json?.sites ?? sitesTry.json?.data?.sites ?? sitesTry.json?.data) as Site[])
      : [];
    setSites(safeSites);

    const st = await fetchJSON("/api/attendance/status", t);
    if (st.res.status === 401) return logout();
    if (!st.res.ok) throw new Error(st.json?.error || "Nepodařilo se načíst stav směny.");

    const j = st.json || {};
    const presentVal = j.present ?? j.is_present ?? (j.status === "IN" ? true : undefined) ?? (j.open ? true : undefined) ?? false;
    const openSiteId = j.open?.site_id ?? j.open?.siteId ?? j.site_id ?? j.active_site_id ?? null;
    const siteNameVal =
      j.site_name ??
      j.active_site_name ??
      j.current_site_name ??
      j.open?.site_name ??
      (openSiteId ? safeSites.find((s) => s.id === openSiteId)?.name : null) ??
      null;

    setPresent(!!presentVal);
    setActiveSiteId(openSiteId ? String(openSiteId) : null);
    setActiveSiteName(siteNameVal ? String(siteNameVal) : null);

    const day = new Date().toISOString().slice(0, 10);
    const calendar = await fetchJSON(`/api/calendar?from=${day}&to=${day}`, t);
    setTodayCalendar(calendar.res.ok && Array.isArray(calendar.json?.items) ? calendar.json.items as CalendarItem[] : []);
  }

  async function refreshGeo(sitesList: Site[]) {
    try {
      const p = await getPosition();
      setPos(p);
      setNearest(pickNearestSite(p, sitesList));
    } catch {
      setPos(null);
      setNearest(null);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (e: unknown) {
        setErr(getErrorMessage(e));
      }
    })();
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

      const p = await getPosition().catch(() => null);
      if (p) setPos(p);

      let siteId: string | null = manualSiteId;
      if (!siteId && p && sites.length) {
        const best = pickNearestSite(p, sites);
        setNearest(best);
        if (best) siteId = best.site.id;
      }

      if (!siteId) {
        setTempOpen(true);
        setInfo("V okolí není aktivní stavba. Vyberte stavbu ručně nebo vytvořte dočasnou.");
        return;
      }

      const res = await fetch("/api/attendance/in", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          site_id: siteId,
          lat: p?.lat,
          lng: p?.lng,
          accuracy_m: p ? Math.round(p.accuracy) : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nepodařilo se uložit příchod.");

      const s = sites.find((x) => x.id === siteId);
      setPresent(true);
      setActiveSiteId(siteId);
      setActiveSiteName(s?.name || null);
      setInfo(`Docházka zahájena${s?.name ? ` · ${s.name}` : ""}.`);
      setManualSiteId(null);
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
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
      if (!name) throw new Error("Zadejte název dočasné stavby.");

      const reqRes = await fetch("/api/sites/pending", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({ name, lat: p.lat, lng: p.lng, radius_m: 200 }),
      });

      const reqJson = await reqRes.json().catch(() => ({}));
      if (!reqRes.ok) throw new Error(reqJson?.error || "Nepodařilo se vytvořit dočasnou stavbu.");

      const newSiteId = reqJson?.site?.id;
      if (!newSiteId) throw new Error("Chybí ID nové dočasné stavby.");

      const inRes = await fetch("/api/attendance/in", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({ site_id: newSiteId, lat: p.lat, lng: p.lng, accuracy_m: Math.round(p.accuracy) }),
      });

      const inJson = await inRes.json().catch(() => ({}));
      if (!inRes.ok) throw new Error(inJson?.error || "Nepodařilo se uložit příchod.");

      setPresent(true);
      setActiveSiteId(String(newSiteId));
      setActiveSiteName(`Dočasná: ${name}`);
      setTempOpen(false);
      setTempName("");
      setInfo("Docházka zahájena na dočasné stavbě.");
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function doOut(forceWithoutLocation = false) {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const t = await getToken();
      if (!t) throw new Error("Chybí přihlášení.");

      if (!note.trim()) throw new Error("Doplňte popis práce před ukončením docházky.");

      if (!km.trim()) throw new Error("Doplňte kilometry. Pokud žádné nejsou, zadejte 0.");
      const kmVal = Number(km.replace(",", "."));
      if (!Number.isFinite(kmVal) || kmVal < 0) throw new Error("Kilometry nejsou platné.");

      if (!matAmount.trim()) throw new Error("Doplňte materiál v Kč. Pokud žádný není, zadejte 0.");
      const matAmt = Number(matAmount.replace(",", "."));
      if (!Number.isFinite(matAmt) || matAmt < 0) throw new Error("Částka za materiál není platná.");
      if (matAmt > 0 && !matDesc.trim()) throw new Error("U materiálu doplňte krátký popis.");
      if (me?.is_programmer && didProgram) {
        const ph = Number(progHours.replace(",", "."));
        if (!Number.isFinite(ph) || ph <= 0) throw new Error("Doplňte počet hodin programování.");
      }
      if (forceWithoutLocation && !manualOutTime.trim()) throw new Error("Zadejte čas odchodu bez polohy.");

      const p = forceWithoutLocation ? null : await getPosition().catch(() => null);
      if (p) setPos(p);

      let siteId: string | null = manualSiteId || activeSiteId || null;
      if (!siteId && p && sites.length) {
        const best = pickNearestSite(p, sites);
        setNearest(best);
        if (best) siteId = best.site.id;
      }

      if (!siteId && p && sites.length) {
        let bestAny: { site: Site; dist: number } | null = null;
        for (const s of sites) {
          if (s.lat == null || s.lng == null) continue;
          const dist = haversineMeters(p, { lat: s.lat, lng: s.lng });
          if (!bestAny || dist < bestAny.dist) bestAny = { site: s, dist };
        }
        if (bestAny) siteId = bestAny.site.id;
      }

      if (!siteId) throw new Error("Nepodařilo se určit stavbu pro odchod.");

      const payload: Record<string, string | number | boolean | null | undefined> = {
        site_id: siteId,
        note_work: note.trim() || undefined,
        km: kmVal,
        material_desc: matDesc.trim() || undefined,
        material_amount: matAmt,
        programming_hours: me?.is_programmer && didProgram ? Number(progHours.replace(",", ".")) : undefined,
        programming_note: me?.is_programmer && didProgram ? progNote.trim() || undefined : undefined,
        lat: p?.lat,
        lng: p?.lng,
        accuracy_m: p ? Math.round(p.accuracy) : undefined,
        allow_without_location: forceWithoutLocation,
        reported_left_at: forceWithoutLocation ? manualOutTime.trim() : undefined,
      };

      const res = await fetch("/api/attendance/out", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nepodařilo se uložit odchod.");

      setPresent(false);
      setActiveSiteId(null);
      setActiveSiteName(null);
      setInfo(forceWithoutLocation ? "Docházka ukončena bez polohy." : "Docházka ukončena.");
      setNote("");
      setKm("");
      setMatDesc("");
      setMatAmount("");
      setDidProgram(false);
      setProgHours("");
      setProgNote("");
      setManualOutTime("");
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
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

      const hours = hoursFromTimes(manualDayFrom, manualDayTo);
      if (!manualDayDate) throw new Error("Vyberte datum.");
      if (!(hours > 0)) throw new Error("Čas Do musí být později než Od.");
      if (!manualDayNote.trim()) throw new Error("Doplňte popis práce.");

      const kmVal = manualDayKm.trim() ? Number(manualDayKm.replace(",", ".")) : 0;
      if (manualDayKm.trim() && (!Number.isFinite(kmVal) || kmVal < 0)) throw new Error("Kilometry nejsou platné.");

      const res = await fetch("/api/attendance/manual-day", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${t}` },
        body: JSON.stringify({
          day_local: manualDayDate,
          time_from: manualDayFrom,
          time_to: manualDayTo,
          site_id: manualDaySiteId,
          note_work: manualDayNote.trim(),
          km: kmVal,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nepodařilo se uložit pracovní den.");

      setInfo("Pracovní den byl doplněn.");
      setManualDayOpen(false);
      setManualDayNote("");
      setManualDayKm("");
    } catch (e: unknown) {
      setErr(getErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const statusLabel = present ? "Docházka běží" : "Připraveno k zahájení";
  const statusText = present ? activeSiteName || "Aktivní stavba není určena" : selectedSite?.name || "Vyberte stavbu nebo použijte polohu";

  return (
    <main className="min-h-screen bg-[#f4f7fb] px-4 pb-24 pt-5 text-slate-950 md:pb-5">
      <div className="mx-auto max-w-6xl space-y-5">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <Image src="/ekybl-logo.png" alt="Elektro práce Lukáš Kybl" width={190} height={52} className="hidden h-auto w-40 sm:block" />
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Docházka</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">Docházka a práce</h1>
              <p className="mt-1 text-sm text-slate-600">
                Přihlášený uživatel: <span className="font-medium text-slate-900">{me?.name || "—"}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {me?.role === "admin" && (
              <a href="/admin" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50">
                Administrace
              </a>
            )}
            <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm hover:bg-slate-50" onClick={logout}>
              Odhlásit
            </button>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${present ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>
                    {statusLabel}
                  </div>
                  <h2 className="mt-4 text-2xl font-semibold">{statusText}</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    {present
                      ? "Při ukončení docházky můžete doplnit popis práce, kilometry a materiál. Přechod na další akci se při stejném čase uloží odděleně."
                      : "Aplikace vybere nejbližší stavbu podle polohy. Když poloha nesedí, vyberte stavbu ručně."}
                  </p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                  <div className="text-xs text-slate-500">Poloha / stavba</div>
                  <div className="mt-1 font-semibold">{nearestLabel || "Nenalezena v dosahu"}</div>
                  {pos ? <div className="mt-1 text-xs text-slate-500">Přesnost: {Math.round(pos.accuracy)} m</div> : null}
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <ActionButton disabled={busy || present} onClick={doIn}>
                  Zahájit docházku
                </ActionButton>
                <ActionButton disabled={busy || !present} onClick={() => doOut(false)} tone="danger">
                  Ukončit docházku
                </ActionButton>
                <ActionButton disabled={busy} onClick={() => setManualPickOpen(true)} tone="ghost">
                  Vybrat stavbu
                </ActionButton>
                <ActionButton disabled={busy} onClick={() => refreshGeo(sites)} tone="ghost">
                  Obnovit polohu
                </ActionButton>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <a href="/calendar" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="text-sm font-semibold">Kalendář</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">Plán práce, lékař, volno, nemoc a vlastní položky.</div>
              </a>
              <a href="/me" className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="text-sm font-semibold">Moje výdělky</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">Přehled zaplaceno, nezaplaceno a částečně.</div>
              </a>
              <button type="button" onClick={() => setManualDayOpen(true)} className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="text-sm font-semibold">Doplnit den</div>
                <div className="mt-1 text-xs leading-5 text-slate-600">Nouzové doplnění docházky bez polohy.</div>
              </button>
            </div>
          </div>

          <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Ukončení docházky</h2>
                <p className="mt-1 text-xs text-slate-500">Před odchodem vyplňte práci, kilometry a materiál. Hodnoty jdou do výplat i exportu.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Povinné</span>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="block text-xs font-semibold text-slate-600">
                Popis práce
                <textarea className="mt-1 min-h-24 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="Co se dnes dělalo" value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-600">
                  Kilometry
                  <input className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="0" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Materiál Kč
                  <input className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="0" inputMode="decimal" value={matAmount} onChange={(e) => setMatAmount(e.target.value)} />
                </label>
              </div>
              <label className="block text-xs font-semibold text-slate-600">
                Popis materiálu
                <input className="mt-1 w-full rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100" placeholder="Např. kabel, jistič, svorky. Pokud materiál nebyl, nechte prázdné." value={matDesc} onChange={(e) => setMatDesc(e.target.value)} />
              </label>

              {me?.is_programmer ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input type="checkbox" checked={didProgram} onChange={(e) => setDidProgram(e.target.checked)} />
                    Dnes se programovalo
                  </label>
                  <div className="mt-2 grid grid-cols-2 gap-3">
                    <input className="w-full rounded-lg border border-slate-300 p-3 text-sm disabled:bg-slate-100" placeholder="Hodiny" inputMode="decimal" value={progHours} onChange={(e) => setProgHours(e.target.value)} disabled={!didProgram} />
                    <input className="w-full rounded-lg border border-slate-300 p-3 text-sm disabled:bg-slate-100" placeholder="Poznámka" value={progNote} onChange={(e) => setProgNote(e.target.value)} disabled={!didProgram} />
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">Dnešní kalendář</div>
                  <div className="mt-1 text-xs text-slate-500">Práce, volno a osobní položky</div>
                </div>
                <a href="/calendar" className="rounded-lg border bg-white px-3 py-2 text-xs font-semibold">Otevřít</a>
              </div>
              <div className="mt-3 space-y-2">
                {todayCalendar.slice(0, 3).map((item) => (
                  <div key={item.id} className="rounded-lg border bg-white p-3">
                    <div className="text-xs font-semibold text-slate-500">{calendarTypeLabels[item.type]}</div>
                    <div className="mt-1 text-sm font-semibold">{item.title}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.all_day ? "Celý den" : item.start_time ? `${item.start_time.slice(0, 5)}${item.end_time ? ` - ${item.end_time.slice(0, 5)}` : ""}` : "Bez času"}
                      {item.location ? ` · ${item.location}` : ""}
                    </div>
                  </div>
                ))}
                {!todayCalendar.length ? <div className="rounded-lg border bg-white p-3 text-sm text-slate-500">Na dnešek není nic v kalendáři.</div> : null}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">Ukončení bez polohy</div>
              <p className="mt-1 text-xs leading-5 text-amber-800">Použijte jen při výpadku GPS nebo dodatečném odchodu.</p>
              <input type="time" value={manualOutTime} onChange={(e) => setManualOutTime(e.target.value)} disabled={busy || !present} className="mt-3 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm" />
              <button type="button" disabled={busy || !present} onClick={() => doOut(true)} className="mt-3 w-full rounded-lg border border-amber-400 bg-amber-100 px-4 py-3 text-sm font-semibold text-amber-900 disabled:opacity-45">
                Ukončit bez polohy
              </button>
            </div>
          </aside>
        </section>

        {err && <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div>}
        {info && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div>}
      </div>

      {manualPickOpen && (
        <Modal title="Vybrat stavbu" onClose={() => setManualPickOpen(false)}>
          <div className="max-h-96 overflow-auto rounded-lg border border-slate-200">
            {sites.map((s) => (
              <button
                key={s.id}
                type="button"
                className="flex w-full items-center justify-between border-b border-slate-200 px-3 py-3 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  setManualSiteId(s.id);
                  setManualPickOpen(false);
                  setInfo(`Vybraná stavba: ${s.name}`);
                }}
              >
                <span>{s.name}</span>
              </button>
            ))}
          </div>
          <button type="button" className="mt-3 rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setManualPickOpen(false)}>
            Zavřít
          </button>
        </Modal>
      )}

      {tempOpen && (
        <Modal title="Dočasná stavba" onClose={() => setTempOpen(false)}>
          <p className="text-sm leading-6 text-slate-600">Zadejte název dočasné stavby. Po uložení se k ní rovnou přiřadí příchod.</p>
          <input className="mt-3 w-full rounded-lg border border-slate-300 p-3 text-sm" placeholder="Název dočasné stavby" value={tempName} onChange={(e) => setTempName(e.target.value)} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setTempOpen(false)}>
              Zrušit
            </button>
            <button type="button" disabled={busy} className="rounded-lg bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45" onClick={submitTempSiteAndIn}>
              Uložit a zahájit docházku
            </button>
          </div>
        </Modal>
      )}

      {manualDayOpen && (
        <Modal title="Doplnit pracovní den" onClose={() => setManualDayOpen(false)}>
          <p className="text-sm leading-6 text-slate-600">Vytvoří se příchod i odchod. Hodiny se vypočítají podle času od-do.</p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-slate-700">
              Datum
              <input type="date" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={manualDayDate} onChange={(e) => setManualDayDate(e.target.value)} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Stavba
              <select className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" value={manualDaySiteId ?? ""} onChange={(e) => setManualDaySiteId(e.target.value || null)}>
                <option value="">Bez stavby</option>
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-slate-700">
              Od
              <input type="time" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={manualDayFrom} onChange={(e) => setManualDayFrom(e.target.value)} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Do
              <input type="time" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" value={manualDayTo} onChange={(e) => setManualDayTo(e.target.value)} />
            </label>
          </div>

          <textarea className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Popis práce" value={manualDayNote} onChange={(e) => setManualDayNote(e.target.value)} />
          <input className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" inputMode="decimal" placeholder="Kilometry (volitelné)" value={manualDayKm} onChange={(e) => setManualDayKm(e.target.value)} />

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-lg border border-slate-300 px-3 py-2 text-sm" onClick={() => setManualDayOpen(false)}>
              Zrušit
            </button>
            <button type="button" disabled={busy} className="rounded-lg bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45" onClick={submitManualDay}>
              Uložit
            </button>
          </div>
        </Modal>
      )}
      <BottomNav />
    </main>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 md:items-center">
      <div className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">{title}</div>
          <button type="button" className="rounded-lg border border-slate-300 px-3 py-1 text-sm" onClick={onClose}>
            Zavřít
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}
