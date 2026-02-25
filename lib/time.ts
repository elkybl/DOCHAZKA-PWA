export function dayLocalCZFromIso(iso: string) {
  // iso = server_time (UTC ISO string), ale my si z něj uděláme CZ den.
  // Použijeme Intl pro Europe/Prague.
  const d = new Date(iso);

  const parts = new Intl.DateTimeFormat("cs-CZ", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);

  const y = parts.find(p => p.type === "year")?.value ?? "1970";
  const m = parts.find(p => p.type === "month")?.value ?? "01";
  const day = parts.find(p => p.type === "day")?.value ?? "01";

  // vrací "YYYY-MM-DD"
  return `${y}-${m}-${day}`;
}

export function dayLocalCZNow() {
  return dayLocalCZFromIso(new Date().toISOString());
}

// ---------- Formatting (Europe/Prague) ----------

function partsInTZ(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("cs-CZ", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t: string, fallback: string) => parts.find((p) => p.type === t)?.value ?? fallback;
  return {
    y: Number(get("year", "1970")),
    m: Number(get("month", "01")),
    d: Number(get("day", "01")),
    hh: Number(get("hour", "00")),
    mm: Number(get("minute", "00")),
    ss: Number(get("second", "00")),
  };
}

export function fmtTimeCZFromIso(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = partsInTZ(d, "Europe/Prague");
  return `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

export function fmtDateTimeCZFromIso(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const p = partsInTZ(d, "Europe/Prague");
  const dd = String(p.d).padStart(2, "0");
  const mm = String(p.m).padStart(2, "0");
  return `${p.y}-${mm}-${dd} ${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`;
}

// ---------- Conversions (Europe/Prague local <-> UTC Date) ----------

function tzOffsetMinutes(atUtcInstant: Date, timeZone: string) {
  // Returns offset minutes such that: local = utc + offset
  // Using the classic Intl "parts" trick.
  const p = partsInTZ(atUtcInstant, timeZone);
  const asIfUtc = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return (asIfUtc - atUtcInstant.getTime()) / 60000;
}

export function czLocalToUtcDate(input: {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  ss?: number;
}) {
  // Convert Europe/Prague local date-time to a real UTC Date.
  // We iterate once to be stable across DST boundaries.
  const ss = input.ss ?? 0;
  let guess = Date.UTC(input.y, input.m - 1, input.d, input.hh, input.mm, ss);
  let dt = new Date(guess);
  let off = tzOffsetMinutes(dt, "Europe/Prague");
  let utc = guess - off * 60000;
  // one more pass
  dt = new Date(utc);
  off = tzOffsetMinutes(dt, "Europe/Prague");
  utc = guess - off * 60000;
  return new Date(utc);
}

export function roundToHalfHourCZ(utcInstant: Date) {
  // Round in Europe/Prague local time to nearest 30 minutes.
  const p = partsInTZ(utcInstant, "Europe/Prague");
  const total = p.hh * 60 + p.mm;
  const rounded = Math.round(total / 30) * 30;
  const hh = Math.floor(rounded / 60);
  const mm = rounded % 60;
  return czLocalToUtcDate({ y: p.y, m: p.m, d: p.d, hh, mm, ss: 0 });
}

export function parseReportedLeftAtCZ(reported: string | null | undefined, inTimeIso: string) {
  const inLocalDay = dayLocalCZFromIso(inTimeIso);
  const [yy, mm, dd] = inLocalDay.split("-").map((x) => Number(x));

  if (!reported || !reported.trim()) return new Date();
  const s = reported.trim();

  // 1) ISO-like: 2026-02-24 15:20 / 2026-02-24T15:20
  const isoLike = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (isoLike) {
    const y = Number(isoLike[1]);
    const m = Number(isoLike[2]);
    const d = Number(isoLike[3]);
    const hh = Number(isoLike[4]);
    const min = Number(isoLike[5]);
    const ss = isoLike[6] ? Number(isoLike[6]) : 0;
    return czLocalToUtcDate({ y, m, d, hh, mm: min, ss });
  }

  // 2) CZ: "24.2. 15:20" / "24.02.2026 15:20"
  const czLike = s.match(/^(\d{1,2})\.(\d{1,2})\.(?:\s*(\d{4}))?\s+(\d{1,2}):(\d{2})$/);
  if (czLike) {
    const d = Number(czLike[1]);
    const m = Number(czLike[2]);
    const y = czLike[3] ? Number(czLike[3]) : yy;
    const hh = Number(czLike[4]);
    const min = Number(czLike[5]);
    return czLocalToUtcDate({ y, m, d, hh, mm: min, ss: 0 });
  }

  // 3) HH:MM (same local day as IN)
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const hh = Number(hm[1]);
    const min = Number(hm[2]);
    if (hh >= 0 && hh <= 23 && min >= 0 && min <= 59) {
      return czLocalToUtcDate({ y: yy, m: mm, d: dd, hh, mm: min, ss: 0 });
    }
  }

  // 4) Fallback: whatever Date can parse
  const tryFull = new Date(s);
  if (!Number.isNaN(tryFull.getTime())) return tryFull;
  return new Date();
}


export function roundToHalfHourCZFromIso(iso: string) {
  return roundToHalfHourCZ(new Date(iso));
}
