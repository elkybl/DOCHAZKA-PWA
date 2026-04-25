"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/AppNav";
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

function getErrorMessage(error: unknown, fallback = "Doslo k chybe.") {
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
    if (!navigator.geolocation) return reject(new Error("Geolokace neni dostupna."));
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
  for (const site of sites) {
    if (site.lat == null || site.lng == null) continue;
    const dist = haversineMeters(pos, { lat: site.lat, lng: site.lng });
    const radius = site.radius_m ?? fallbackRadiusM;
    if (dist <= radius && (!best || dist < best.dist)) best = { site, dist };
  }
  return best;
}

function hoursFromTimes(from: string, to: string) {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const mins = th * 60 + tm - (fh * 60 + fm);
  return Math.max(0, mins / 60);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export default function AttendancePage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [outErr, setOutErr] = useState<string | null>(null);
  const [outField, setOutField] = useState<string | null>(null);

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
  const [manualDayDate, setManualDayDate] = useState(todayIso());
  const [manualDayFrom, setManualDayFrom] = useState("08:00");
  const [manualDayTo, setManualDayTo] = useState("16:00");
  const [manualDaySiteId, setManualDaySiteId] = useState<string | null>(null);
  const [manualDayNote, setManualDayNote] = useState("");
  const [manualDayKm, setManualDayKm] = useState("");
  const endCardRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const kmRef = useRef<HTMLInputElement | null>(null);
  const matAmountRef = useRef<HTMLInputElement | null>(null);
  const matDescRef = useRef<HTMLInputElement | null>(null);
  const progHoursRef = useRef<HTMLInputElement | null>(null);
  const manualOutTimeRef = useRef<HTMLInputElement | null>(null);

  const selectedSite = manualSiteId ? sites.find((site) => site.id === manualSiteId) ?? null : nearest?.site ?? null;
  const nearestLabel = useMemo(() => {
    if (manualSiteId) return sites.find((site) => site.id === manualSiteId)?.name ?? "Rucne vybrana stavba";
    if (!nearest) return null;
    return `${nearest.site.name} - ${Math.round(nearest.dist)} m`;
  }, [manualSiteId, nearest, sites]);

  const completionItems = useMemo(() => {
    return [
      { label: "Popis prace", done: note.trim().length > 0 },
      { label: "Kilometry", done: km.trim().length > 0 },
      {
        label: "Programovani",
        done: !me?.is_programmer || !didProgram || (progHours.trim().length > 0 && progNote.trim().length > 0),
      },
    ];
  }, [note, km, me?.is_programmer, didProgram, progHours, progNote]);

  const completedCount = completionItems.filter((item) => item.done).length;
  const missingCompletionItems = completionItems.filter((item) => !item.done);
  const canSubmitOut = present && missingCompletionItems.length === 0 && !busy;

  function focusOutField(field: string, message: string) {
    setOutErr(message);
    setOutField(field);
    const map: Record<string, HTMLInputElement | HTMLTextAreaElement | null> = {
      note: noteRef.current,
      km: kmRef.current,
      material: matAmountRef.current,
      material_desc: matDescRef.current,
      prog_hours: progHoursRef.current,
      manual_out_time: manualOutTimeRef.current,
    };
    endCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      map[field]?.focus();
    }, 120);
  }

  function openEndFormHint() {
    setOutErr("Nejdriv doplnte udaje k odchodu. Formular je niz na strance.");
    endCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => noteRef.current?.focus(), 120);
  }

  function submitOutFromCard() {
    if (!present) {
      setOutErr("Nejdriv zahajte dochazku na stavbe.");
      return;
    }

    const firstMissing = missingCompletionItems[0];
    if (!firstMissing) {
      void doOut(false);
      return;
    }

    const fieldMap: Record<string, { field: string; message: string }> = {
      "Popis prace": { field: "note", message: "Nejdriv doplnte popis prace. Pak pujde den ukoncit." },
      Kilometry: { field: "km", message: "Nejdriv doplnte kilometry. Pokud zadne nejsou, zadejte 0." },
      Programovani: { field: "prog_hours", message: "Pokud se dnes programovalo, doplnte hodiny a poznamku k programovani." },
    };

    const target = fieldMap[firstMissing.label] ?? { field: "note", message: "Pred ukoncenim dne jeste doplnte chybejici udaje." };
    focusOutField(target.field, target.message);
  }

  async function load() {
    setErr(null);
    setInfo(null);

    const token = await getToken();
    if (!token) {
      setErr("Chybi prihlaseni.");
      return;
    }

    const meUrls = ["/api/me/profile", "/api/me", "/api/auth/me"];
    let meObj: Me | null = null;
    for (const url of meUrls) {
      const { res, json } = await fetchJSON(url, token);
      if (res.status === 401) return logout();
      if (!res.ok) continue;
      const extracted = extractUser(json);
      if (extracted) {
        meObj = extracted;
        break;
      }
    }

    if (!meObj) throw new Error("Nepodarilo se nacist uzivatele.");
    setMe(meObj);
    try {
      localStorage.setItem("user", JSON.stringify(meObj));
    } catch {}

    const sitesTry = await fetchJSON("/api/sites", token);
    if (sitesTry.res.status === 401) return logout();
    if (!sitesTry.res.ok) throw new Error(sitesTry.json?.error || "Nepodarilo se nacist stavby.");
    const safeSites = Array.isArray(sitesTry.json?.sites ?? sitesTry.json?.data?.sites ?? sitesTry.json?.data)
      ? ((sitesTry.json?.sites ?? sitesTry.json?.data?.sites ?? sitesTry.json?.data) as Site[])
      : [];
    setSites(safeSites);

    const statusResponse = await fetchJSON("/api/attendance/status", token);
    if (statusResponse.res.status === 401) return logout();
    if (!statusResponse.res.ok) throw new Error(statusResponse.json?.error || "Nepodarilo se nacist stav dochazky.");

    const status = statusResponse.json || {};
    const presentVal =
      status.present ?? status.is_present ?? (status.status === "IN" ? true : undefined) ?? (status.open ? true : undefined) ?? false;
    const openSiteId = status.open?.site_id ?? status.open?.siteId ?? status.site_id ?? status.active_site_id ?? null;
    const siteNameVal =
      status.site_name ??
      status.active_site_name ??
      status.current_site_name ??
      status.open?.site_name ??
      (openSiteId ? safeSites.find((site) => site.id === openSiteId)?.name : null) ??
      null;

    setPresent(!!presentVal);
    setActiveSiteId(openSiteId ? String(openSiteId) : null);
    setActiveSiteName(siteNameVal ? String(siteNameVal) : null);

    const day = todayIso();
    const calendar = await fetchJSON(`/api/calendar?from=${day}&to=${day}`, token);
    setTodayCalendar(calendar.res.ok && Array.isArray(calendar.json?.items) ? (calendar.json.items as CalendarItem[]) : []);
  }

  async function refreshGeo(sitesList: Site[]) {
    try {
      const currentPos = await getPosition();
      setPos(currentPos);
      setNearest(pickNearestSite(currentPos, sitesList));
    } catch {
      setPos(null);
      setNearest(null);
    }
  }

  useEffect(() => {
    (async () => {
      try {
        await load();
      } catch (error: unknown) {
        setErr(getErrorMessage(error));
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
      const token = await getToken();
      if (!token) throw new Error("Chybi prihlaseni.");

      const currentPos = await getPosition().catch(() => null);
      if (currentPos) setPos(currentPos);

      let siteId: string | null = manualSiteId;
      if (!siteId && currentPos && sites.length) {
        const best = pickNearestSite(currentPos, sites);
        setNearest(best);
        if (best) siteId = best.site.id;
      }

      if (!siteId) {
        setTempOpen(true);
        setInfo("V okoli neni aktivni stavba. Vyberte stavbu rucne nebo vytvorte docasnou.");
        return;
      }

      const res = await fetch("/api/attendance/in", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          site_id: siteId,
          lat: currentPos?.lat,
          lng: currentPos?.lng,
          accuracy_m: currentPos ? Math.round(currentPos.accuracy) : undefined,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nepodarilo se ulozit prichod.");

      const site = sites.find((item) => item.id === siteId);
      setPresent(true);
      setActiveSiteId(siteId);
      setActiveSiteName(site?.name || null);
      setInfo(`Dochazka zahajena${site?.name ? ` - ${site.name}` : ""}.`);
      setManualSiteId(null);
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitTempSiteAndIn() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Chybi prihlaseni.");

      const currentPos = pos || (await getPosition().catch(() => null));
      if (!currentPos) throw new Error("Nepodarilo se ziskat polohu.");

      const name = tempName.trim();
      if (!name) throw new Error("Zadejte nazev docasne stavby.");

      const reqRes = await fetch("/api/sites/pending", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, lat: currentPos.lat, lng: currentPos.lng, radius_m: 200 }),
      });

      const reqJson = await reqRes.json().catch(() => ({}));
      if (!reqRes.ok) throw new Error(reqJson?.error || "Nepodarilo se vytvorit docasnou stavbu.");

      const newSiteId = reqJson?.site?.id;
      if (!newSiteId) throw new Error("Chybi ID nove docasne stavby.");

      const inRes = await fetch("/api/attendance/in", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          site_id: newSiteId,
          lat: currentPos.lat,
          lng: currentPos.lng,
          accuracy_m: Math.round(currentPos.accuracy),
        }),
      });

      const inJson = await inRes.json().catch(() => ({}));
      if (!inRes.ok) throw new Error(inJson?.error || "Nepodarilo se ulozit prichod.");

      setPresent(true);
      setActiveSiteId(String(newSiteId));
      setActiveSiteName(`Docasna: ${name}`);
      setTempOpen(false);
      setTempName("");
      setInfo("Dochazka zahajena na docasne stavbe.");
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function doOut(forceWithoutLocation = false) {
    setErr(null);
    setInfo(null);
    setOutErr(null);
    setOutField(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Chybi prihlaseni.");
      if (!note.trim()) return focusOutField("note", "Doplnte popis prace pred ukoncenim dochazky.");
      if (!km.trim()) return focusOutField("km", "Doplnte kilometry. Pokud zadne nejsou, zadejte 0.");

      const kmVal = Number(km.replace(",", "."));
      if (!Number.isFinite(kmVal) || kmVal < 0) return focusOutField("km", "Kilometry nejsou platne.");

      const matAmt = matAmount.trim() ? Number(matAmount.replace(",", ".")) : 0;
      if (matAmount.trim() && (!Number.isFinite(matAmt) || matAmt < 0)) return focusOutField("material", "Castka za material neni platna.");

      if (me?.is_programmer && didProgram) {
        const ph = Number(progHours.replace(",", "."));
        if (!Number.isFinite(ph) || ph <= 0) return focusOutField("prog_hours", "Doplnte pocet hodin programovani.");
      }

      if (forceWithoutLocation && !manualOutTime.trim()) return focusOutField("manual_out_time", "Zadejte cas odchodu bez polohy.");

      setBusy(true);

      const currentPos = forceWithoutLocation ? null : await getPosition().catch(() => null);
      if (currentPos) setPos(currentPos);

      let siteId: string | null = manualSiteId || activeSiteId || null;
      if (!siteId && currentPos && sites.length) {
        const best = pickNearestSite(currentPos, sites);
        setNearest(best);
        if (best) siteId = best.site.id;
      }

      if (!siteId && currentPos && sites.length) {
        let bestAny: { site: Site; dist: number } | null = null;
        for (const site of sites) {
          if (site.lat == null || site.lng == null) continue;
          const dist = haversineMeters(currentPos, { lat: site.lat, lng: site.lng });
          if (!bestAny || dist < bestAny.dist) bestAny = { site, dist };
        }
        if (bestAny) siteId = bestAny.site.id;
      }

      if (!siteId) throw new Error("Nepodarilo se urcit stavbu pro odchod.");

      const payload: Record<string, string | number | boolean | null | undefined> = {
        site_id: siteId,
        note_work: note.trim() || undefined,
        km: kmVal,
        material_desc: matDesc.trim() || undefined,
        material_amount: matAmt,
        programming_hours: me?.is_programmer && didProgram ? Number(progHours.replace(",", ".")) : undefined,
        programming_note: me?.is_programmer && didProgram ? progNote.trim() || undefined : undefined,
        lat: currentPos?.lat,
        lng: currentPos?.lng,
        accuracy_m: currentPos ? Math.round(currentPos.accuracy) : undefined,
        allow_without_location: forceWithoutLocation,
        reported_left_at: forceWithoutLocation ? manualOutTime.trim() : undefined,
      };

      const res = await fetch("/api/attendance/out", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nepodarilo se ulozit odchod.");

      setPresent(false);
      setActiveSiteId(null);
      setActiveSiteName(null);
      setInfo(forceWithoutLocation ? "Dochazka ukoncena bez polohy." : "Dochazka ukoncena.");
      setNote("");
      setKm("");
      setMatDesc("");
      setMatAmount("");
      setDidProgram(false);
      setProgHours("");
      setProgNote("");
      setManualOutTime("");
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitManualDay() {
    setBusy(true);
    setErr(null);
    setInfo(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Chybi prihlaseni.");

      const hours = hoursFromTimes(manualDayFrom, manualDayTo);
      if (!manualDayDate) throw new Error("Vyberte datum.");
      if (!(hours > 0)) throw new Error("Cas Do musi byt pozdeji nez Od.");
      if (!manualDayNote.trim()) throw new Error("Doplnte popis prace.");

      const kmVal = manualDayKm.trim() ? Number(manualDayKm.replace(",", ".")) : 0;
      if (manualDayKm.trim() && (!Number.isFinite(kmVal) || kmVal < 0)) throw new Error("Kilometry nejsou platne.");

      const res = await fetch("/api/attendance/manual-day", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
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
      if (!res.ok) throw new Error(data?.error || "Nepodarilo se ulozit pracovni den.");

      setInfo("Pracovni den byl doplnen.");
      setManualDayOpen(false);
      setManualDayNote("");
      setManualDayKm("");
    } catch (error: unknown) {
      setErr(getErrorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell
      area="auto"
      title="Dochazka a prace"
      subtitle="Jeden prehled pro zahajeni dne, ukonceni dochazky, kalendar i rychle opravy bez zbytecneho hledani."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {me?.role === "admin" ? (
            <a href="/admin" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50">
              Administrace
            </a>
          ) : null}
          <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50" onClick={logout}>
            Odhlasit
          </button>
        </div>
      }
    >
      <section className="grid gap-5 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="order-2 space-y-5 xl:order-1">
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-start gap-4">

                <div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${present ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800"}`}>
                    {present ? "Dochazka bezi" : "Pripraveno k zahajeni"}
                  </span>
                  <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                    {present ? activeSiteName || "Aktivni stavba neni urcena" : selectedSite?.name || "Vyberte stavbu nebo pouzijte polohu"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    {present
                      ? "Pred ukoncenim dne doplnte praci, kilometry a material. Prechod na dalsi akci ve stejny cas zustava ulozeny oddelene jako samostatny zaznam."
                      : "Aplikace vybere nejblizsi stavbu podle polohy. Kdyz poloha nesedi, vyberte stavbu rucne nebo vytvorte docasnou."}
                  </p>
                </div>
              </div>

              <div className="grid min-w-[240px] gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm xl:w-[260px]">
                <div>
                  <div className="text-xs font-medium text-slate-500">Prihlaseny uzivatel</div>
                  <div className="mt-1 font-semibold text-slate-950">{me?.name || "-"}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-slate-500">Poloha / stavba</div>
                  <div className="mt-1 font-semibold text-slate-950">{nearestLabel || "Nenalezena v dosahu"}</div>
                  <div className="mt-1 text-xs text-slate-500">Presnost: {pos ? `${Math.round(pos.accuracy)} m` : "bez polohy"}</div>
                </div>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <button type="button" disabled={busy || present} onClick={doIn} className="rounded-2xl bg-emerald-600 px-4 py-4 text-left text-white shadow-[0_18px_40px_rgba(5,150,105,0.24)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45">
                <div className="text-sm font-semibold">Zahajit dochazku</div>
                <div className="mt-1 text-xs text-emerald-50">Pouzije nejblizsi stavbu nebo rucni vyber.</div>
              </button>
              <button type="button" disabled={busy} onClick={() => setManualPickOpen(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="text-sm font-semibold text-slate-950">Vybrat stavbu</div>
                <div className="mt-1 text-xs text-slate-600">PrepnutI stavby bez cekani na GPS.</div>
              </button>
              <button type="button" disabled={busy} onClick={() => refreshGeo(sites)} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="text-sm font-semibold text-slate-950">Obnovit polohu</div>
                <div className="mt-1 text-xs text-slate-600">Znovu overi nejblizsi stavbu podle GPS.</div>
              </button>
            </div>

            {present ? (
              <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-blue-950">Pred ukoncenim dochazky doplnte udaje k odchodu</div>
                    <div className="mt-1 text-xs leading-5 text-blue-900">
                      Povinne jsou popis prace, cas a kilometry. Material muzete doplnit jen tehdy, kdyz je potreba.
                    </div>
                  </div>
                  <button type="button" onClick={openEndFormHint} className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-800 shadow-sm hover:bg-blue-100/60">
                    Otevrit formular
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.05fr_0.95fr]">
            <StatusCard
              title="Dnes resit"
              tone={present ? "blue" : "neutral"}
              items={
                present
                  ? [
                      note.trim() ? "Popis prace je pripraveny." : "Doplnte popis prace pred odchodem.",
                      km.trim() ? "Kilometry jsou vyplnene." : "Pripravte kilometry, i kdyby mely byt 0.",
                      matAmount.trim() ? "Material je vyplneny." : "Doplnte material v Kc, i kdyby mel byt 0.",
                    ]
                  : [
                      selectedSite ? `Vybrana stavba: ${selectedSite.name}.` : "Zkontrolujte stavbu pred zahajenim dne.",
                      todayCalendar.length ? `V kalendari mate ${todayCalendar.length} dnesni polozky.` : "Kalendar je dnes prazdny.",
                      me?.role === "admin" ? "Jako admin muzete prepnout do spravy systemu." : "Po zahajeni dne uz jen doplnite odchod a praci.",
                    ]
              }
            />
            <StatusCard title="Pripravenost odchodu" tone={completedCount === completionItems.length ? "emerald" : "amber"} items={completionItems.map((item) => `${item.done ? "Hotovo" : "Chybi"} - ${item.label}`)} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
            <LinkCard href="/calendar" title="Kalendar" desc="Plan prace, volno, lekar i vlastni polozky." />
            <LinkCard href="/me" title="Moje vydelky" desc="Prehled k uhrade, uhrazeno a detail dnu." />
            <button type="button" onClick={() => setManualDayOpen(true)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
              <div className="text-sm font-semibold text-slate-950">Doplnit den</div>
              <div className="mt-1 text-xs leading-5 text-slate-600">Rucni doplneni dne, kdyz nebyla poloha nebo jste den dodelavali zpetne.</div>
            </button>
            <LinkCard href="/me/edit" title="Upravit den" desc="Doplneni prace, materialu a presne opravy dne." />
          </div>

          <div className="rounded-[28px] border border-amber-200 bg-amber-50 p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-amber-950">Ukonceni bez polohy</h3>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-amber-900">
                  Pouzijte jen pri vypadku GPS nebo kdyz odchod doplnujete dodatecne. Hodi se hlavne na pocitaci, kdyz potrebujete den rychle uzavrit rucne.
                </p>
              </div>
              <div className="grid gap-2 sm:grid-cols-[180px_auto] sm:items-end">
                <input ref={manualOutTimeRef} type="time" value={manualOutTime} onChange={(e) => { setManualOutTime(e.target.value); if (outField === "manual_out_time") setOutField(null); }} disabled={busy || !present} className={`w-full rounded-xl border bg-white px-3 py-3 text-sm ${outField === "manual_out_time" ? "border-red-300" : "border-amber-300"}`} />
                <button type="button" disabled={busy || !present} onClick={() => doOut(true)} className="rounded-xl border border-amber-400 bg-white px-4 py-3 text-sm font-semibold text-amber-950 shadow-sm disabled:opacity-45">
                  Ukoncit bez polohy
                </button>
              </div>
            </div>
          </div>
        </div>

        <aside className="order-3 space-y-4 xl:order-2 xl:sticky xl:top-24 xl:self-start">
          <section ref={endCardRef} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] xl:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Ukonceni dochazky</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Popis prace, cas a kilometry jdou do vyplat, prehledu i exportu. Material je volitelny doplnek.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Povinne</span>
            </div>

            {outErr ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{outErr}</div> : null}

            <div className={`mt-4 rounded-2xl border p-4 ${canSubmitOut ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className={`text-sm font-semibold ${canSubmitOut ? "text-emerald-950" : "text-amber-950"}`}>
                    {canSubmitOut ? "Den je pripraveny k ukonceni" : `Pred ukoncenim doplnte jeste ${missingCompletionItems.length} polozky`}
                  </div>
                  <div className={`mt-1 text-xs leading-5 ${canSubmitOut ? "text-emerald-900" : "text-amber-900"}`}>
                    {canSubmitOut
                      ? "Popis prace i kilometry jsou hotove. Ted uz muzete dochazku bez obav ukoncit."
                      : "Tady hned vidite, co jeste chybi. Kdyz stisknete ukonceni moc brzy, formular vas presne navede na prvni chybejici pole."}
                  </div>
                </div>
                <div className="flex min-w-[220px] flex-col items-stretch gap-2">
                  <div className={`rounded-xl px-3 py-2 text-center text-xs font-semibold ${canSubmitOut ? "bg-white text-emerald-800" : "bg-white text-amber-800"}`}>
                    {canSubmitOut ? "Pripraveno k ukonceni" : `${completedCount}/${completionItems.length} udaju pripraveno`}
                  </div>
                  <button
                    type="button"
                    disabled={busy || !present}
                    onClick={submitOutFromCard}
                    className={`rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-45 ${canSubmitOut ? "bg-blue-700" : "bg-amber-600 hover:bg-amber-700"}`}
                  >
                    {canSubmitOut ? "Ukoncit dochazku" : "Zkontrolovat a doplnit"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Stav formulare</div>
                <div className="text-xs font-semibold text-slate-500">{completedCount}/{completionItems.length} pripraveno</div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {completionItems.map((item) => (
                  <div key={item.label} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${item.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    {item.done ? "Hotovo" : "Chybi"} - {item.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="block text-xs font-semibold text-slate-600">
                Popis prace
                <textarea ref={noteRef} className={`mt-1 min-h-28 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 ${outField === "note" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="Co se dnes delalo" value={note} onChange={(e) => { setNote(e.target.value); if (outField === "note") setOutField(null); }} />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-600">
                  Kilometry
                  <input ref={kmRef} className={`mt-1 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 ${outField === "km" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="0" inputMode="decimal" value={km} onChange={(e) => { setKm(e.target.value); if (outField === "km") setOutField(null); }} />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Material Kc
                  <input ref={matAmountRef} className={`mt-1 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 ${outField === "material" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="0" inputMode="decimal" value={matAmount} onChange={(e) => { setMatAmount(e.target.value); if (outField === "material") setOutField(null); }} />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-600">
                Popis materialu
                <input ref={matDescRef} className={`mt-1 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 ${outField === "material_desc" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="Napriklad kabel, jistic, svorky. Pokud material nebyl, nechte prazdne." value={matDesc} onChange={(e) => { setMatDesc(e.target.value); if (outField === "material_desc") setOutField(null); }} />
              </label>

              {me?.is_programmer ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input type="checkbox" checked={didProgram} onChange={(e) => setDidProgram(e.target.checked)} />
                    Dnes se programovalo
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <input ref={progHoursRef} className={`w-full rounded-2xl border p-3 text-sm disabled:bg-slate-100 ${outField === "prog_hours" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="Hodiny" inputMode="decimal" value={progHours} onChange={(e) => { setProgHours(e.target.value); if (outField === "prog_hours") setOutField(null); }} disabled={!didProgram} />
                    <input className="w-full rounded-2xl border border-slate-300 p-3 text-sm disabled:bg-slate-100" placeholder="Poznamka" value={progNote} onChange={(e) => setProgNote(e.target.value)} disabled={!didProgram} />
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] xl:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Dnesni kalendar</h2>
                <p className="mt-1 text-xs text-slate-500">Prace, volno a osobni polozky na dnesek.</p>
              </div>
              <a href="/calendar" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50">
                Otevrit
              </a>
            </div>
            <div className="mt-3 space-y-2">
              {todayCalendar.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="text-xs font-semibold text-slate-500">{calendarTypeLabels[item.type]}</div>
                  <div className="mt-1 text-sm font-semibold text-slate-950">{item.title}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.all_day ? "Cely den" : item.start_time ? `${item.start_time.slice(0, 5)}${item.end_time ? ` - ${item.end_time.slice(0, 5)}` : ""}` : "Bez casu"}
                    {item.location ? ` - ${item.location}` : ""}
                  </div>
                </div>
              ))}
              {!todayCalendar.length ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Na dnesek nemate v kalendari zadnou polozku.</div> : null}
            </div>
          </section>
        </aside>
      </section>

      {err ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{err}</div> : null}
      {info ? <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{info}</div> : null}

      {manualPickOpen ? (
        <Modal title="Vybrat stavbu" onClose={() => setManualPickOpen(false)}>
          <div className="max-h-96 overflow-auto rounded-2xl border border-slate-200">
            {sites.map((site) => (
              <button
                key={site.id}
                type="button"
                className="flex w-full items-center justify-between border-b border-slate-200 px-3 py-3 text-left text-sm hover:bg-slate-50"
                onClick={() => {
                  setManualSiteId(site.id);
                  setManualPickOpen(false);
                  setInfo(`Vybrana stavba: ${site.name}`);
                }}
              >
                <span>{site.name}</span>
                <span className="text-xs text-slate-500">{site.id === manualSiteId ? "Aktivni" : "Vybrat"}</span>
              </button>
            ))}
          </div>
          <button type="button" className="mt-3 rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setManualPickOpen(false)}>
            Zavrit
          </button>
        </Modal>
      ) : null}

      {tempOpen ? (
        <Modal title="Docasna stavba" onClose={() => setTempOpen(false)}>
          <p className="text-sm leading-6 text-slate-600">Zadejte nazev docasne stavby. Po ulozeni se k ni rovnou priradi prichod.</p>
          <input className="mt-3 w-full rounded-2xl border border-slate-300 p-3 text-sm" placeholder="Nazev docasne stavby" value={tempName} onChange={(e) => setTempName(e.target.value)} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setTempOpen(false)}>
              Zrusit
            </button>
            <button type="button" disabled={busy} className="rounded-xl bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45" onClick={submitTempSiteAndIn}>
              Ulozit a zahajit dochazku
            </button>
          </div>
        </Modal>
      ) : null}

      {manualDayOpen ? (
        <Modal title="Doplnit pracovni den" onClose={() => setManualDayOpen(false)}>
          <p className="text-sm leading-6 text-slate-600">Vytvori se prichod i odchod. Hodiny se vypocitaji podle casu od-do.</p>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-slate-700">
              Datum
              <input type="date" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={manualDayDate} onChange={(e) => setManualDayDate(e.target.value)} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Stavba
              <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={manualDaySiteId ?? ""} onChange={(e) => setManualDaySiteId(e.target.value || null)}>
                <option value="">Bez stavby</option>
                {sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="text-sm font-medium text-slate-700">
              Od
              <input type="time" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={manualDayFrom} onChange={(e) => setManualDayFrom(e.target.value)} />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Do
              <input type="time" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" value={manualDayTo} onChange={(e) => setManualDayTo(e.target.value)} />
            </label>
          </div>

          <textarea className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" rows={3} placeholder="Popis prace" value={manualDayNote} onChange={(e) => setManualDayNote(e.target.value)} />
          <input className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" inputMode="decimal" placeholder="Kilometry (volitelne)" value={manualDayKm} onChange={(e) => setManualDayKm(e.target.value)} />

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setManualDayOpen(false)}>
              Zrusit
            </button>
            <button type="button" disabled={busy} className="rounded-xl bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45" onClick={submitManualDay}>
              Ulozit
            </button>
          </div>
        </Modal>
      ) : null}
    </AppShell>
  );
}

function LinkCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-1 text-xs leading-5 text-slate-600">{desc}</div>
    </a>
  );
}

function StatusCard({ title, items, tone }: { title: string; items: string[]; tone: "neutral" | "blue" | "amber" | "emerald" }) {
  const cls =
    tone === "blue"
      ? "border-blue-200 bg-blue-50/60"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50/70"
        : tone === "emerald"
          ? "border-emerald-200 bg-emerald-50/70"
          : "border-slate-200 bg-white";

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${cls}`}>
      <div className="text-sm font-semibold text-slate-950">{title}</div>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <div key={item} className="rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-slate-700">
            {item}
          </div>
        ))}
      </div>
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 md:items-center">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">{title}</div>
          <button type="button" className="rounded-xl border border-slate-300 px-3 py-1 text-sm" onClick={onClose}>
            Zavrit
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}




