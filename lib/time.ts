// lib/time.ts
// Jednotný časový helper pro celý projekt (UI + výpočty).
// - UI zobrazuje lokální čas zařízení (v ČR sedí) -> bez vynucování timeZone
// - Výpočty (day_local, rounding, reported_left_at) běží v Europe/Prague

export const APP_TZ = "Europe/Prague";

// --------------------
// UI formatters (bez timeZone -> lokální čas zařízení)
// --------------------

export function hm(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

export function dtCZ(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("cs-CZ", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Backward compat: starší UI volalo fmtCZ / fmtTimeCZFromIso / fmtDateTimeCZFromIso
export function fmtCZ(dt: string | null | undefined) {
  return dtCZ(dt ?? null);
}
export function fmtTimeCZFromIso(iso?: string | null) {
  return hm(iso ?? null);
}
export function fmtDateTimeCZFromIso(iso?: string | null) {
  return dtCZ(iso ?? null);
}

// --------------------
// TZ helpers (Europe/Prague) – pro výpočty
// --------------------

function tzParts(date: Date, tz = APP_TZ) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const o: Record<string, string> = {};
  for (const p of parts) o[p.type] = p.value;
  return o;
}

export function dayLocalCZFromIso(iso?: string | null) {
  if (!iso) return "";
  const o = tzParts(new Date(iso), APP_TZ);
  return `${o.year}-${o.month}-${o.day}`;
}

// Offset in minutes for given UTC instant in a timezone.
// Trick: format instant in TZ -> get its "local" Y-M-D H:M:S,
// then interpret that local timestamp as UTC and compare.
function tzOffsetMinutesAt(utcInstant: Date, tz = APP_TZ) {
  const o = tzParts(utcInstant, tz);
  const asUTC = Date.UTC(
    Number(o.year),
    Number(o.month) - 1,
    Number(o.day),
    Number(o.hour),
    Number(o.minute),
    Number(o.second)
  );
  return (asUTC - utcInstant.getTime()) / 60000;
}

// Create a real UTC instant for a local time (Y-M-D HH:MM) in a TZ.
// Uses 2 iterations to stabilize around DST edges.
function makeInstantFromLocalTZ(
  y: number,
  m: number,
  d: number,
  hh: number,
  mm: number,
  tz = APP_TZ
) {
  // initial guess: interpret local as UTC
  let guess = new Date(Date.UTC(y, m - 1, d, hh, mm, 0));
  // first offset
  let off = tzOffsetMinutesAt(guess, tz);
  let inst = new Date(guess.getTime() - off * 60000);
  // second pass to stabilize (DST boundaries)
  off = tzOffsetMinutesAt(inst, tz);
  inst = new Date(guess.getTime() - off * 60000);
  return inst;
}

// --------------------
// Rounding (for PAY calculations only)
// --------------------

function tzHM(date: Date, tz = APP_TZ) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);

  const o: any = {};
  for (const p of parts) o[p.type] = p.value;
  return { h: Number(o.hour), m: Number(o.minute) };
}

/**
 * Zaokrouhlení na nejbližší 30 minut podle CZ času (používej pro výpočty, ne pro ukládání do DB).
 * 00–14 -> :00
 * 15–44 -> :30
 * 45–59 -> +1h :00
 *
 * Vrací Date (instant), posunutý o delta minut oproti vstupu.
 */
export function roundTo30ByTZ(iso: string, tz = APP_TZ) {
  const d = new Date(iso);
  const { h, m } = tzHM(d, tz);

  let targetH = h;
  let targetM = 0;

  if (m < 15) targetM = 0;
  else if (m < 45) targetM = 30;
  else {
    targetM = 0;
    targetH = h + 1;
    if (targetH === 24) targetH = 0;
  }

  const cur = h * 60 + m;
  const tgt = targetH * 60 + targetM;

  let delta = tgt - cur;
  if (delta < -720) delta += 1440; // přes půlnoc
  if (delta > 720) delta -= 1440;

  return new Date(d.getTime() + delta * 60000);
}

// Backward compat: starší kód volá roundToHalfHourCZ
export function roundToHalfHourCZ(iso: string) {
  return roundTo30ByTZ(iso, APP_TZ);
}

// --------------------
// Parse reported_left_at (pozní odchod) "HH:MM" -> Date instant in CZ
// --------------------

/**
 * reported: typicky "16:50" (nebo v textu někde "… 16:50 …")
 * baseIso: ISO času příchodu (abychom věděli datum dne)
 * Vrací Date (instant) v CZ pro datum příchodu + zadaný čas.
 */
export function parseReportedLeftAtCZ(reported: string, baseIso: string) {
  const s = (reported || "").trim();
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  const baseDay = dayLocalCZFromIso(baseIso);
  const parts = baseDay.split("-").map((x) => Number(x));
  if (parts.length !== 3) return null;

  const [Y, M, D] = parts;
  if (!Y || !M || !D) return null;

  return makeInstantFromLocalTZ(Y, M, D, hh, mm, APP_TZ);
}
// YYYY-MM-DD podle CZ pro "teď"
export function dayLocalCZNow() {
  return dayLocalCZFromIso(new Date().toISOString());
}

/**
 * Převede lokální CZ datum (YYYY-MM-DD) na UTC instant začátku dne v CZ.
 * Používá se např. pro filtr v trips-km endpointu.
 */
export function czLocalToUtcDate(day: string) {
  const m = (day || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return new Date(NaN);

  const Y = Number(m[1]);
  const M = Number(m[2]);
  const D = Number(m[3]);

  // start of day 00:00 v Europe/Prague jako skutečný instant
  // používá interní helper makeInstantFromLocalTZ z tvého time.ts
  return makeInstantFromLocalTZ(Y, M, D, 0, 0, APP_TZ);
}