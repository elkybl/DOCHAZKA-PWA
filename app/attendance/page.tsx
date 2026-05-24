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

function roundedHoursFromTimes(from: string, to: string) {
  const [fh, fm] = from.split(":").map(Number);
  const [th, tm] = to.split(":").map(Number);
  const mins = Math.max(0, th * 60 + tm - (fh * 60 + fm));
  return Math.ceil(mins / 30) * 0.5;
}

function roundedHoursFromIsoRange(startIso: string | null, end: Date) {
  if (!startIso) return 0;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  return Math.ceil(mins / 30) * 0.5;
}

function roundedHoursFromIsoAndManualTime(startIso: string | null, hhmm: string) {
  if (!startIso || !hhmm) return 0;
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return 0;
  const [hours, minutes] = hhmm.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  const end = new Date(start);
  end.setHours(hours, minutes, 0, 0);
  if (end.getTime() < start.getTime()) end.setDate(end.getDate() + 1);
  return roundedHoursFromIsoRange(startIso, end);
}

type WorkSplitRow = {
  id: string;
  category: string;
  hours: string;
  note: string;
};

const WORK_CATEGORY_OPTIONS = [
  { value: "cn", label: "CN / hodinovka", helper: "Práce účtovaná přímo do konkrétní CN nebo hodinovky." },
  { value: "viceprace", label: "Vícepráce", helper: "Práce mimo původní rozsah, kterou je potřeba oddělit a popsat samostatně." },
  { value: "svetla", label: "Světla", helper: "Montáž, úpravy nebo servis svítidel, okruhů a ovládání světel." },
  { value: "hruba_stavba", label: "Hrubá stavba", helper: "Tahání tras, sekání, jádra, průrazy a příprava před kompletací." },
  { value: "klientske_zmeny", label: "Klientské změny", helper: "Dodatečné změny podle přání klienta oproti původnímu zadání." },
  { value: "kompletace", label: "Kompletace", helper: "Dokončovací práce, osazování, finální kompletace a předání." },
  { value: "rozvadec", label: "Rozvaděč", helper: "Osazování, úpravy, zapojování a kontrola rozvaděče." },
  { value: "montaz", label: "Montáž", helper: "Běžná montáž, tahání kabelů, osazování a kompletace." },
  { value: "servis", label: "Servis", helper: "Opravy, výjezdy, dohledání závad a krátké zásahy." },
  { value: "nakup", label: "Nákup materiálu", helper: "Čas strávený nákupem nebo vyzvednutím materiálu." },
  { value: "mimo_lokaci", label: "Práce mimo lokaci", helper: "Příprava, řešení u dodavatele nebo práce mimo stavbu." },
  { value: "programovani", label: "Programování", helper: "Programování, konfigurace a testování softwarové části." },
  { value: "priprava", label: "Příprava / administrativa", helper: "Příprava podkladů, dokumentace nebo předání." },
  { value: "jine", label: "Jiné", helper: "Všechno, co se nevejde do předchozích kategorií." },
] as const;

function makeSplitRow(category = "cn"): WorkSplitRow {
  return { id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, category, hours: "", note: "" };
}

function splitCategoryLabel(category: string) {
  return WORK_CATEGORY_OPTIONS.find((item) => item.value === category)?.label || category;
}

function splitCategoryHelper(category: string) {
  return WORK_CATEGORY_OPTIONS.find((item) => item.value === category)?.helper || "";
}

function composeWorkNote(baseNote: string, rows: WorkSplitRow[]) {
  const cleanBase = baseNote.trim();
  const cleanRows = rows
    .map((row) => ({
      category: row.category,
      hours: Number(String(row.hours).replace(",", ".")),
      note: row.note.trim(),
    }))
    .filter((row) => Number.isFinite(row.hours) && row.hours > 0);

  if (!cleanRows.length) return cleanBase;

  const breakdown = cleanRows
    .map((row) => `- ${splitCategoryLabel(row.category)}: ${String(row.hours).replace(".", ",")} h${row.note ? ` – ${row.note}` : ""}`)
    .join("\n");

  return `${cleanBase}\n\nRozpad hodin:\n${breakdown}`.trim();
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function fmtHours(value: number) {
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 2 });
}

function defaultCategoryForManualKind(kind: "work" | "shopping" | "offsite" | "service") {
  if (kind === "shopping") return "nakup";
  if (kind === "offsite") return "mimo_lokaci";
  if (kind === "service") return "servis";
  return "cn";
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
  const [activeInTime, setActiveInTime] = useState<string | null>(null);
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
  const [splitRows, setSplitRows] = useState<WorkSplitRow[]>([makeSplitRow()]);
  const [todayCalendar, setTodayCalendar] = useState<CalendarItem[]>([]);

  const [manualDayOpen, setManualDayOpen] = useState(false);
  const [manualDayDate, setManualDayDate] = useState(todayIso());
  const [manualDayFrom, setManualDayFrom] = useState("08:00");
  const [manualDayTo, setManualDayTo] = useState("16:00");
  const [manualDaySiteId, setManualDaySiteId] = useState<string | null>(null);
  const [manualDayKind, setManualDayKind] = useState<"work" | "shopping" | "offsite" | "service">("work");
  const [manualDayNote, setManualDayNote] = useState("");
  const [manualDayKm, setManualDayKm] = useState("");
  const [manualSplitRows, setManualSplitRows] = useState<WorkSplitRow[]>([makeSplitRow()]);
  const endCardRef = useRef<HTMLDivElement | null>(null);
  const noteRef = useRef<HTMLTextAreaElement | null>(null);
  const kmRef = useRef<HTMLInputElement | null>(null);
  const matAmountRef = useRef<HTMLInputElement | null>(null);
  const matDescRef = useRef<HTMLInputElement | null>(null);
  const progHoursRef = useRef<HTMLInputElement | null>(null);
  const manualOutTimeRef = useRef<HTMLInputElement | null>(null);

  const selectedSite = manualSiteId ? sites.find((site) => site.id === manualSiteId) ?? null : nearest?.site ?? null;
  const nearestLabel = useMemo(() => {
    if (manualSiteId) return sites.find((site) => site.id === manualSiteId)?.name ?? "Ručně vybraná stavba";
    if (!nearest) return null;
    return `${nearest.site.name} - ${Math.round(nearest.dist)} m`;
  }, [manualSiteId, nearest, sites]);

  const currentRoundedHours = useMemo(() => {
    if (manualOutTime.trim()) return roundedHoursFromIsoAndManualTime(activeInTime, manualOutTime.trim());
    return roundedHoursFromIsoRange(activeInTime, new Date());
  }, [activeInTime, manualOutTime]);

  const openDurationHours = useMemo(() => {
    if (!activeInTime) return 0;
    const start = new Date(activeInTime);
    if (Number.isNaN(start.getTime())) return 0;
    return Math.max(0, (Date.now() - start.getTime()) / 3600000);
  }, [activeInTime]);

  const staleOpenShift = openDurationHours >= 18;

  const manualRoundedHours = useMemo(
    () => roundedHoursFromTimes(manualDayFrom, manualDayTo),
    [manualDayFrom, manualDayTo]
  );

  const splitHoursTotal = useMemo(
    () => splitRows.reduce((sum, row) => sum + (Number(String(row.hours).replace(",", ".")) || 0), 0),
    [splitRows]
  );

  const manualSplitHoursTotal = useMemo(
    () => manualSplitRows.reduce((sum, row) => sum + (Number(String(row.hours).replace(",", ".")) || 0), 0),
    [manualSplitRows]
  );

  const completionItems = useMemo(() => {
    return [
      { label: "Kilometry", done: km.trim().length > 0 },
      { label: "Rozpad hodin", done: currentRoundedHours <= 0 || Math.abs(splitHoursTotal - currentRoundedHours) < 0.01 },
      {
        label: "Programování",
        done: !me?.is_programmer || !didProgram || (progHours.trim().length > 0 && progNote.trim().length > 0),
      },
    ];
  }, [km, currentRoundedHours, splitHoursTotal, me?.is_programmer, didProgram, progHours, progNote]);

  const completedCount = completionItems.filter((item) => item.done).length;
  const missingCompletionItems = completionItems.filter((item) => !item.done);
  const canSubmitOut = present && missingCompletionItems.length === 0 && !busy;

  useEffect(() => {
    setManualSplitRows((current) => {
      if (current.length !== 1) return current;
      const [first] = current;
      if (first.hours || first.note) return current;
      if (first.category === defaultCategoryForManualKind(manualDayKind)) return current;
      return [{ ...first, category: defaultCategoryForManualKind(manualDayKind) }];
    });
  }, [manualDayKind]);

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

  function updateSplitRow(id: string, patch: Partial<WorkSplitRow>) {
    setSplitRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function updateManualSplitRow(id: string, patch: Partial<WorkSplitRow>) {
    setManualSplitRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function validateSplitRows(rows: WorkSplitRow[], expectedHours: number) {
    if (expectedHours <= 0) return null;
    const normalized = rows.map((row) => ({
      ...row,
      parsedHours: Number(String(row.hours).replace(",", ".")),
      note: row.note.trim(),
    }));

    if (!normalized.length || normalized.every((row) => !row.parsedHours)) {
      return `Rozepište ${String(expectedHours).replace(".", ",")} h do kategorií práce.`;
    }

    for (const row of normalized) {
      if (!Number.isFinite(row.parsedHours) || row.parsedHours <= 0) {
        return "Každá kategorie musí mít platný počet hodin větší než 0.";
      }
      if (!row.note) {
        return `Doplňte stručný popis pro kategorii ${splitCategoryLabel(row.category)}.`;
      }
    }

    const total = normalized.reduce((sum, row) => sum + row.parsedHours, 0);
    if (Math.abs(total - expectedHours) > 0.01) {
      return `Rozpad hodin musí dát přesně ${String(expectedHours).replace(".", ",")} h. Teď je tam ${String(total).replace(".", ",")} h.`;
    }

    return null;
  }

  function openEndFormHint() {
    setOutErr("Nejdřív doplňte údaje k odchodu. Formulář je níž na stránce.");
    endCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => kmRef.current?.focus(), 120);
  }

  function submitOutFromCard() {
    if (!present) {
      setOutErr("Nejdřív zahajte docházku na stavbě.");
      return;
    }

    const firstMissing = missingCompletionItems[0];
    if (!firstMissing) {
      void doOut(false);
      return;
    }

    const fieldMap: Record<string, { field: string; message: string }> = {
      Kilometry: { field: "km", message: "Nejdřív doplňte kilometry. Pokud žádné nejsou, zadejte 0." },
      "Programování": { field: "prog_hours", message: "Pokud se dnes programovalo, doplňte hodiny a poznámku k programování." },
      "Rozpad hodin": { field: "note", message: "Nejdřív správně rozdělte hodiny do kategorií, aby jejich součet seděl na celý den." },
    };

    const target = fieldMap[firstMissing.label] ?? { field: "note", message: "Před ukončením dne ještě doplňte chybějící údaje." };
    focusOutField(target.field, target.message);
  }

  async function load() {
    setErr(null);
    setInfo(null);

    const token = await getToken();
    if (!token) {
      setErr("Chybí přihlášení.");
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

    if (!meObj) throw new Error("Nepodařilo se načíst uživatele.");
    setMe(meObj);
    try {
      localStorage.setItem("user", JSON.stringify(meObj));
    } catch {}

    const sitesTry = await fetchJSON("/api/sites", token);
    if (sitesTry.res.status === 401) return logout();
    if (!sitesTry.res.ok) throw new Error(sitesTry.json?.error || "Nepodařilo se načíst stavby.");
    const safeSites = Array.isArray(sitesTry.json?.sites ?? sitesTry.json?.data?.sites ?? sitesTry.json?.data)
      ? ((sitesTry.json?.sites ?? sitesTry.json?.data?.sites ?? sitesTry.json?.data) as Site[])
      : [];
    setSites(safeSites);

    const statusResponse = await fetchJSON("/api/attendance/status", token);
    if (statusResponse.res.status === 401) return logout();
    if (!statusResponse.res.ok) throw new Error(statusResponse.json?.error || "Nepodařilo se načíst stav docházky.");

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
    setActiveInTime(typeof status.open?.in_time === "string" ? status.open.in_time : null);

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
      if (!token) throw new Error("Chybí přihlášení.");

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
        setInfo("V okolí není aktivní stavba. Vyberte stavbu ručně nebo vytvořte dočasnou.");
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
      if (!res.ok) throw new Error(data?.error || "Nepodařilo se uložit příchod.");

      const site = sites.find((item) => item.id === siteId);
      setPresent(true);
      setActiveSiteId(siteId);
      setActiveSiteName(site?.name || null);
      setActiveInTime(data?.server_time || new Date().toISOString());
      setSplitRows([makeSplitRow()]);
      setInfo(`Docházka zahájena${site?.name ? ` - ${site.name}` : ""}.`);
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
      if (!token) throw new Error("Chybí přihlášení.");

      const currentPos = pos || (await getPosition().catch(() => null));
      if (!currentPos) throw new Error("Nepodarilo se ziskat polohu.");

      const name = tempName.trim();
      if (!name) throw new Error("Zadejte název dočasné stavby.");

      const reqRes = await fetch("/api/sites/pending", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, lat: currentPos.lat, lng: currentPos.lng, radius_m: 200 }),
      });

      const reqJson = await reqRes.json().catch(() => ({}));
      if (!reqRes.ok) throw new Error(reqJson?.error || "Nepodařilo se vytvořit dočasnou stavbu.");

      const newSiteId = reqJson?.site?.id;
      if (!newSiteId) throw new Error("Chybí ID nové dočasné stavby.");

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
      if (!inRes.ok) throw new Error(inJson?.error || "Nepodařilo se uložit příchod.");

      setPresent(true);
      setActiveSiteId(String(newSiteId));
      setActiveSiteName(`Dočasná: ${name}`);
      setActiveInTime(inJson?.server_time || new Date().toISOString());
      setSplitRows([makeSplitRow()]);
      setTempOpen(false);
      setTempName("");
      setInfo("Docházka zahájena na dočasné stavbě.");
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
      if (!token) throw new Error("Chybí přihlášení.");
      if (!km.trim()) return focusOutField("km", "Doplňte kilometry. Pokud žádné nejsou, zadejte 0.");

      const kmVal = Number(km.replace(",", "."));
      if (!Number.isFinite(kmVal) || kmVal < 0) return focusOutField("km", "Kilometry nejsou platné.");

      const matAmt = matAmount.trim() ? Number(matAmount.replace(",", ".")) : 0;
      if (matAmount.trim() && (!Number.isFinite(matAmt) || matAmt < 0)) return focusOutField("material", "Částka za materiál není platná.");

      if (me?.is_programmer && didProgram) {
        const ph = Number(progHours.replace(",", "."));
        if (!Number.isFinite(ph) || ph <= 0) return focusOutField("prog_hours", "Doplňte počet hodin programování.");
      }

      if (forceWithoutLocation && !manualOutTime.trim()) return focusOutField("manual_out_time", "Zadejte čas odchodu bez polohy.");
      const splitError = validateSplitRows(splitRows, currentRoundedHours);
      if (splitError) return focusOutField("note", splitError);

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

      const payload: Record<string, string | number | boolean | null | undefined> = {
        site_id: siteId || undefined,
        note_work: composeWorkNote(note, splitRows) || undefined,
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
      if (!res.ok) throw new Error(data?.error || "Nepodařilo se uložit odchod.");

      setPresent(false);
      setActiveSiteId(null);
      setActiveSiteName(null);
      setActiveInTime(null);
      setSplitRows([makeSplitRow()]);
      setInfo(forceWithoutLocation ? "Docházka ukončena bez polohy." : "Docházka ukončena.");
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
      if (!token) throw new Error("Chybí přihlášení.");

      const hours = hoursFromTimes(manualDayFrom, manualDayTo);
      if (!manualDayDate) throw new Error("Vyberte datum.");
      if (!(hours > 0)) throw new Error("Čas Do musí být později než Od.");
      const splitError = validateSplitRows(manualSplitRows, manualRoundedHours);
      if (splitError) throw new Error(splitError);

      const kmVal = manualDayKm.trim() ? Number(manualDayKm.replace(",", ".")) : 0;
      if (manualDayKm.trim() && (!Number.isFinite(kmVal) || kmVal < 0)) throw new Error("Kilometry nejsou platné.");

      const res = await fetch("/api/attendance/manual-day", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          day_local: manualDayDate,
          time_from: manualDayFrom,
          time_to: manualDayTo,
          site_id: manualDaySiteId,
          kind: manualDayKind,
          note_work: composeWorkNote(manualDayNote, manualSplitRows),
          km: kmVal,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Nepodarilo se ulozit pracovni den.");

      setInfo("Pracovní den byl doplněn.");
      setManualDayOpen(false);
      setManualSplitRows([makeSplitRow(defaultCategoryForManualKind("work"))]);
      setManualDayKind("work");
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
      title="Docházka a práce"
      subtitle="Jeden přehled pro zahájení dne, ukončení docházky, kalendář i rychlé opravy bez zbytečného hledání."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {me?.role === "admin" ? (
            <a href="/admin" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50">
              Administrace
            </a>
          ) : null}
          <button type="button" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold shadow-sm hover:bg-slate-50" onClick={logout}>
            Odhlásit
          </button>
        </div>
      }
    >
      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <div className="order-2 space-y-6 xl:order-1">
          <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.10)]">
            <div className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#eff6ff_28%,#ffffff_72%)] p-5 sm:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${present ? "bg-emerald-50 text-emerald-800" : "bg-blue-50 text-blue-800"}`}>
                  {present ? "Docházka běží" : "Připraveno k zahájení"}
                </span>
                {present ? (
                  <span className="inline-flex rounded-full bg-slate-950 px-3 py-1 text-xs font-semibold text-white">
                    Aktivní den
                  </span>
                ) : null}
              </div>

              <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 max-w-2xl">
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                    {present ? activeSiteName || "Aktivní stavba není určená" : selectedSite?.name || "Vyberte stavbu nebo použijte polohu"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {present
                      ? "Den už běží. Doplňte rozpad hodin, kilometry a případné programování. Nouzové ukončení nechte jen jako záložní variantu."
                      : "Aplikace umí použít nejbližší stavbu podle polohy. Když poloha nesedí, stavbu přepněte ručně nebo si založte dočasnou."}
                  </p>
                </div>

                <div className="grid min-w-[240px] gap-3 rounded-[24px] border border-slate-200 bg-white/90 p-4 text-sm shadow-sm xl:w-[280px]">
                  <div>
                    <div className="text-xs font-medium text-slate-500">Přihlášený uživatel</div>
                    <div className="mt-1 font-semibold text-slate-950">{me?.name || "-"}</div>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500">Poloha / stavba</div>
                    <div className="mt-1 font-semibold text-slate-950">{nearestLabel || "Nenalezena v dosahu"}</div>
                    <div className="mt-1 text-xs text-slate-500">Přesnost: {pos ? `${Math.round(pos.accuracy)} m` : "bez polohy"}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-6">
              <div className="grid flex-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <button type="button" disabled={busy || present} onClick={doIn} className="rounded-2xl bg-emerald-600 px-4 py-4 text-left text-white shadow-[0_18px_40px_rgba(5,150,105,0.24)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-45">
                <div className="text-sm font-semibold">Zahájit docházku</div>
                <div className="mt-1 text-xs text-emerald-50">Použije nejbližší stavbu nebo ruční výběr.</div>
              </button>
              <button type="button" disabled={busy} onClick={() => setManualPickOpen(true)} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="text-sm font-semibold text-slate-950">Vybrat stavbu</div>
                <div className="mt-1 text-xs text-slate-600">Přepnutí stavby bez čekání na GPS.</div>
              </button>
              <button type="button" disabled={busy} onClick={() => refreshGeo(sites)} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                <div className="text-sm font-semibold text-slate-950">Obnovit polohu</div>
                <div className="mt-1 text-xs text-slate-600">Znovu ověří nejbližší stavbu podle GPS.</div>
              </button>
            </div>

            <div className="mt-6 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-[26px] border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Rychlé kroky pro dnešek</div>
                    <div className="mt-1 text-sm text-slate-600">Kalendář, výdělky a ruční doplnění dne držíme pohromadě bez zbytečných boxů navíc.</div>
                  </div>
                  {present ? (
                    <button type="button" onClick={openEndFormHint} className="rounded-full border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-900">
                      Přejít na ukončení dne
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <LinkCard href="/calendar" title="Kalendář" desc="Dnešní plán, volno i vlastní položky." />
                <LinkCard href="/me" title="Moje výdělky" desc="Přehled k úhradě a detail jednotlivých dnů." />
                <button type="button" onClick={() => setManualDayOpen(true)} className="rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-blue-200 hover:bg-blue-50/40">
                  <div className="text-sm font-semibold text-slate-950">Doplnit den / nákup</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">Ruční doplnění dne, nákup materiálu nebo práce mimo lokaci.</div>
                </button>
                <LinkCard href="/me/edit" title="Upravit den" desc="Oprava práce, materiálu a přesného času dne." />
                </div>
              </div>

              <div className={`rounded-[26px] border px-5 py-4 ${staleOpenShift ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"}`}>
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="max-w-xl">
                    <div className={`text-xs font-semibold uppercase tracking-[0.16em] ${staleOpenShift ? "text-rose-800" : "text-amber-800"}`}>Nouzové uzavření</div>
                    <h3 className={`mt-2 text-base font-semibold ${staleOpenShift ? "text-rose-950" : "text-amber-950"}`}>Ukončení bez polohy</h3>
                    <p className={`mt-1 text-sm leading-6 ${staleOpenShift ? "text-rose-900" : "text-amber-900"}`}>
                      Použijte jen při výpadku GPS nebo když odchod doplňujete dodatečně. Je to záložní varianta, ne hlavní workflow dne.
                    </p>
                    {staleOpenShift ? (
                      <div className="mt-3 rounded-2xl border border-rose-200 bg-white/80 px-3 py-3 text-sm font-medium text-rose-900">
                        Tenhle den běží už déle než 18 hodin. Nejbezpečnější je zadat skutečný čas odchodu a ukončit ho tady ručně.
                      </div>
                    ) : null}
                  </div>
                  <div className="grid min-w-[260px] gap-2 sm:grid-cols-[180px_auto] sm:items-end">
                    <input ref={manualOutTimeRef} type="time" value={manualOutTime} onChange={(e) => { setManualOutTime(e.target.value); if (outField === "manual_out_time") setOutField(null); }} disabled={busy || !present} className={`w-full rounded-xl border bg-white px-3 py-3 text-sm ${outField === "manual_out_time" ? "border-red-300" : "border-amber-300"}`} />
                    <button type="button" disabled={busy || !present} onClick={() => doOut(true)} className="rounded-xl border border-amber-400 bg-white px-4 py-3 text-sm font-semibold text-amber-950 shadow-sm disabled:opacity-45">
                      Ukončit bez polohy
                    </button>
                  </div>
                </div>
              </div>
            </div>
            </div>
          </div>
        </div>

        <aside className="order-3 space-y-4 xl:order-2 xl:sticky xl:top-24 xl:self-start">
          <section ref={endCardRef} className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] xl:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Ukončení docházky</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">Rozpad hodin, čas a kilometry jdou do výplat, přehledu i exportu. Souhrn dne i materiál jsou volitelné doplňky.</p>
              </div>
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-800">Povinné</span>
            </div>

            {outErr ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{outErr}</div> : null}

            <div className={`mt-4 rounded-2xl border p-4 ${canSubmitOut ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className={`text-sm font-semibold ${canSubmitOut ? "text-emerald-950" : "text-amber-950"}`}>
                    {canSubmitOut ? "Den je připravený k ukončení" : `Před ukončením doplňte ještě ${missingCompletionItems.length} položky`}
                  </div>
                  <div className={`mt-1 text-xs leading-5 ${canSubmitOut ? "text-emerald-900" : "text-amber-900"}`}>
                    {canSubmitOut
                      ? "Rozpad hodin i kilometry jsou hotové. Teď už můžete docházku bez obav ukončit."
                      : "Tady hned vidíte, co ještě chybí. Když stisknete ukončení moc brzy, formulář vás přesně navede na první chybějící pole."}
                  </div>
                </div>
                <div className="flex min-w-[220px] flex-col items-stretch gap-2">
                  <div className={`rounded-xl px-3 py-2 text-center text-xs font-semibold ${canSubmitOut ? "bg-white text-emerald-800" : "bg-white text-amber-800"}`}>
                    {canSubmitOut ? "Připraveno k ukončení" : `${completedCount}/${completionItems.length} údajů připraveno`}
                  </div>
                  <button
                    type="button"
                    disabled={busy || !present}
                    onClick={submitOutFromCard}
                    className={`rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-45 ${canSubmitOut ? "bg-blue-700" : "bg-amber-600 hover:bg-amber-700"}`}
                  >
                    {canSubmitOut ? "Ukončit docházku" : "Zkontrolovat a doplnit"}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-900">Stav formuláře</div>
                <div className="text-xs font-semibold text-slate-500">{completedCount}/{completionItems.length} připraveno</div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {completionItems.map((item) => (
                  <div key={item.label} className={`rounded-xl border px-3 py-2 text-xs font-semibold ${item.done ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    {item.done ? "Hotovo" : "Chybí"} - {item.label}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="block text-xs font-semibold text-slate-600">
                Souhrn dne (volitelné)
                <textarea ref={noteRef} className={`mt-1 min-h-28 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 ${outField === "note" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="Co se dnes dělalo" value={note} onChange={(e) => { setNote(e.target.value); if (outField === "note") setOutField(null); }} />
                <span className="mt-2 block text-[11px] font-medium text-slate-500">Nemusíte znovu opisovat celý den. Povinný detail patří do kategorií níže. Tohle je jen krátké shrnutí navíc.</span>
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Rozpad hodin do kategorií</div>
                    <div className="mt-1 text-xs text-slate-500">Za dnešek je potřeba rozdělit přesně {fmtHours(currentRoundedHours)} h. Součet níže musí sedět, jinak den nepůjde ukončit.</div>
                  </div>
                  <button type="button" onClick={() => setSplitRows((current) => [...current, makeSplitRow(current.at(-1)?.category || "cn")])} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                    Přidat kategorii
                  </button>
                </div>
                <div className="mt-3 space-y-3">
                  {splitRows.map((row, index) => (
                    <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                      <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_120px_auto]">
                        <label className="text-xs font-semibold text-slate-600">
                          Kategorie
                          <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={row.category} onChange={(e) => updateSplitRow(row.id, { category: e.target.value })}>
                            {WORK_CATEGORY_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </label>
                        <label className="text-xs font-semibold text-slate-600">
                          Hodiny
                          <input className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" inputMode="decimal" placeholder="0" value={row.hours} onChange={(e) => updateSplitRow(row.id, { hours: e.target.value.replace(/[^\d.,]/g, "") })} />
                        </label>
                        <div className="flex items-end">
                          <button type="button" onClick={() => setSplitRows((current) => current.length === 1 ? [makeSplitRow(row.category)] : current.filter((item) => item.id !== row.id))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                            {index === 0 && splitRows.length === 1 ? "Vyčistit" : "Smazat"}
                          </button>
                        </div>
                      </div>
                      <label className="mt-3 block text-xs font-semibold text-slate-600">
                        Co se dělalo v téhle kategorii
                        <input className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Např. dokončení světel v obýváku, úprava rozvaděče, klientská změna v kuchyni" value={row.note} onChange={(e) => updateSplitRow(row.id, { note: e.target.value })} />
                      </label>
                      <div className="mt-2 text-xs text-slate-500">{splitCategoryHelper(row.category)}</div>
                    </div>
                  ))}
                </div>
                <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${Math.abs(splitHoursTotal - currentRoundedHours) < 0.01 && currentRoundedHours > 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
                  Součet kategorií: {fmtHours(splitHoursTotal)} h z {fmtHours(currentRoundedHours)} h
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-xs font-semibold text-slate-600">
                  Kilometry
                  <input ref={kmRef} className={`mt-1 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 ${outField === "km" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="0" inputMode="decimal" value={km} onChange={(e) => { setKm(e.target.value); if (outField === "km") setOutField(null); }} />
                </label>
                <label className="block text-xs font-semibold text-slate-600">
                  Materiál Kč
                  <input ref={matAmountRef} className={`mt-1 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 ${outField === "material" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="0" inputMode="decimal" value={matAmount} onChange={(e) => { setMatAmount(e.target.value); if (outField === "material") setOutField(null); }} />
                </label>
              </div>

              <label className="block text-xs font-semibold text-slate-600">
                Popis materiálu
                <input ref={matDescRef} className={`mt-1 w-full rounded-2xl border p-3 text-sm outline-none focus:border-blue-600 focus:ring-4 focus:ring-blue-100 ${outField === "material_desc" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="Například kabel, jistič, svorky. Pokud materiál nebyl, nechte prázdné." value={matDesc} onChange={(e) => { setMatDesc(e.target.value); if (outField === "material_desc") setOutField(null); }} />
              </label>

              {me?.is_programmer ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <input type="checkbox" checked={didProgram} onChange={(e) => setDidProgram(e.target.checked)} />
                    Dnes se programovalo
                  </label>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <input ref={progHoursRef} className={`w-full rounded-2xl border p-3 text-sm disabled:bg-slate-100 ${outField === "prog_hours" ? "border-red-300 bg-red-50/50" : "border-slate-300"}`} placeholder="Hodiny" inputMode="decimal" value={progHours} onChange={(e) => { setProgHours(e.target.value); if (outField === "prog_hours") setOutField(null); }} disabled={!didProgram} />
                    <input className="w-full rounded-2xl border border-slate-300 p-3 text-sm disabled:bg-slate-100" placeholder="Poznámka" value={progNote} onChange={(e) => setProgNote(e.target.value)} disabled={!didProgram} />
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_80px_rgba(15,23,42,0.10)] xl:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">Dnešní kalendář</h2>
                <p className="mt-1 text-xs text-slate-500">Práce, volno a osobní položky na dnešek.</p>
              </div>
              <a href="/calendar" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold shadow-sm hover:bg-slate-50">
                Otevřít
              </a>
            </div>
            <div className="mt-3 space-y-2">
              {todayCalendar.slice(0, 4).map((item) => (
                <div key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-semibold text-slate-500">{calendarTypeLabels[item.type]}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-950">{item.title}</div>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
                      {item.all_day ? "Celý den" : item.start_time ? item.start_time.slice(0, 5) : "Bez času"}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500">
                    {item.all_day ? "Bez pevného času" : item.start_time ? `${item.start_time.slice(0, 5)}${item.end_time ? ` - ${item.end_time.slice(0, 5)}` : ""}` : "Bez času"}
                    {item.location ? ` - ${item.location}` : ""}
                  </div>
                </div>
              ))}
              {!todayCalendar.length ? <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">Na dnešek nemáte v kalendáři žádnou položku.</div> : null}
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
                  setInfo(`Vybraná stavba: ${site.name}`);
                }}
              >
                <span>{site.name}</span>
                <span className="text-xs text-slate-500">{site.id === manualSiteId ? "Aktivní" : "Vybrat"}</span>
              </button>
            ))}
          </div>
          <button type="button" className="mt-3 rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setManualPickOpen(false)}>
            Zavřít
          </button>
        </Modal>
      ) : null}

      {tempOpen ? (
        <Modal title="Dočasná stavba" onClose={() => setTempOpen(false)}>
          <p className="text-sm leading-6 text-slate-600">Zadejte název dočasné stavby. Po uložení se k ní rovnou přiřadí příchod.</p>
          <input className="mt-3 w-full rounded-2xl border border-slate-300 p-3 text-sm" placeholder="Název dočasné stavby" value={tempName} onChange={(e) => setTempName(e.target.value)} />
          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setTempOpen(false)}>
              Zrušit
            </button>
            <button type="button" disabled={busy} className="rounded-xl bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45" onClick={submitTempSiteAndIn}>
              Uložit a zahájit docházku
            </button>
          </div>
        </Modal>
      ) : null}

      {manualDayOpen ? (
        <Modal title="Doplnit den, nákup nebo práci mimo lokaci" onClose={() => setManualDayOpen(false)}>
          <p className="text-sm leading-6 text-slate-600">Vytvoří se příchod i odchod. Hodiny se vypočítají podle času od-do. Když jde o nákup nebo jinou práci mimo stavbu, vyberte odpovídající typ, aby bylo všem hned jasné, kam čas patří.</p>

          <div className="mt-3 grid gap-2 sm:grid-cols-4">
            {([
              ["work", "Práce na stavbě"],
              ["shopping", "Nákup materiálu"],
              ["offsite", "Práce mimo lokaci"],
              ["service", "Servis / řešení"],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setManualDayKind(value)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold ${manualDayKind === value ? "border-blue-200 bg-blue-50 text-blue-900" : "border-slate-200 bg-white text-slate-600"}`}
              >
                {label}
              </button>
            ))}
          </div>

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

          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
            {manualDayKind === "shopping"
              ? "Použijte pro nákup materiálu, cestu po skladu nebo vyřizování věcí mimo stavbu. Čas se tak správně oddělí od montáže na stavbě."
              : manualDayKind === "offsite"
                ? "Použijte pro práci mimo stavbu, která patří k danému dni. Tohle nevypíná běžící docházku, jen doplňuje samostatný ruční řádek."
                : manualDayKind === "service"
                  ? "Použijte pro kratší servis, dohledání závady nebo řešení drobností mimo hlavní stavbu."
                  : "Použijte pro klasickou práci na stavbě včetně ručně doplněného dne."}
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

          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">Rozpad hodin do kategorií</div>
                <div className="mt-1 text-xs text-slate-500">Za tenhle ručně doplněný den je potřeba rozdělit přesně {fmtHours(manualRoundedHours)} h.</div>
              </div>
              <button type="button" onClick={() => setManualSplitRows((current) => [...current, makeSplitRow(current.at(-1)?.category || defaultCategoryForManualKind(manualDayKind))])} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                Přidat kategorii
              </button>
            </div>
            <div className="mt-3 space-y-3">
              {manualSplitRows.map((row, index) => (
                <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                  <div className="grid gap-3 lg:grid-cols-[minmax(0,220px)_120px_auto]">
                    <label className="text-xs font-semibold text-slate-600">
                      Kategorie
                      <select className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={row.category} onChange={(e) => updateManualSplitRow(row.id, { category: e.target.value })}>
                        {WORK_CATEGORY_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs font-semibold text-slate-600">
                      Hodiny
                      <input className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" inputMode="decimal" placeholder="0" value={row.hours} onChange={(e) => updateManualSplitRow(row.id, { hours: e.target.value.replace(/[^\d.,]/g, "") })} />
                    </label>
                    <div className="flex items-end">
                      <button type="button" onClick={() => setManualSplitRows((current) => current.length === 1 ? [makeSplitRow(defaultCategoryForManualKind(manualDayKind))] : current.filter((item) => item.id !== row.id))} className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                        {index === 0 && manualSplitRows.length === 1 ? "Vyčistit" : "Smazat"}
                      </button>
                    </div>
                  </div>
                  <label className="mt-3 block text-xs font-semibold text-slate-600">
                    Co se dělalo v téhle kategorii
                    <input className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Např. nákup světel, kompletace rozvaděče, klientská změna v koupelně" value={row.note} onChange={(e) => updateManualSplitRow(row.id, { note: e.target.value })} />
                  </label>
                  <div className="mt-2 text-xs text-slate-500">{splitCategoryHelper(row.category)}</div>
                </div>
              ))}
            </div>
            <div className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${Math.abs(manualSplitHoursTotal - manualRoundedHours) < 0.01 && manualRoundedHours > 0 ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>
              Součet kategorií: {fmtHours(manualSplitHoursTotal)} h z {fmtHours(manualRoundedHours)} h
            </div>
          </div>

          <label className="mt-3 block text-sm font-medium text-slate-700">
            Souhrn dne (volitelné)
            <textarea
              className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"
              rows={3}
              placeholder={
                manualDayKind === "shopping"
                  ? "Např. nákup kabelů, jističů a svorek do rozvaděče"
                  : manualDayKind === "offsite"
                    ? "Např. příprava podkladů, odvoz materiálu, řešení u dodavatele"
                    : manualDayKind === "service"
                      ? "Např. dohledání závady, výměna drobného dílu, rychlý servis"
                      : "Krátké shrnutí dne navíc"
              }
              value={manualDayNote}
              onChange={(e) => setManualDayNote(e.target.value)}
            />
            <span className="mt-2 block text-xs text-slate-500">Pokud je rozpad hodin vyplněný poctivě, stačí sem napsat jen krátké shrnutí navíc.</span>
          </label>
          <input className="mt-3 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm" inputMode="decimal" placeholder="Kilometry (volitelné)" value={manualDayKm} onChange={(e) => setManualDayKm(e.target.value)} />

          <div className="mt-3 flex justify-end gap-2">
            <button type="button" className="rounded-xl border border-slate-300 px-3 py-2 text-sm" onClick={() => setManualDayOpen(false)}>
              Zrušit
            </button>
            <button type="button" disabled={busy} className="rounded-xl bg-blue-800 px-3 py-2 text-sm font-semibold text-white disabled:opacity-45" onClick={submitManualDay}>
              Uložit
            </button>
          </div>
        </Modal>
      ) : null}
    </AppShell>
  );
}

function LinkCard({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <a href={href} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:bg-blue-50/40">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-950">{title}</div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-500">Otevřít</span>
      </div>
      <div className="mt-2 text-xs leading-5 text-slate-600">{desc}</div>
    </a>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/40 p-4 md:items-center">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="text-lg font-semibold">{title}</div>
          <button type="button" className="rounded-xl border border-slate-300 px-3 py-1 text-sm" onClick={onClose}>
            Zavřít
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}





