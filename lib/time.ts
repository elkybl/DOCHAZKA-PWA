// lib/time.ts
// ✅ Jednotné formátování času pro UI (bez ručního slice a bez vynucování timeZone).
// Prohlížeč/telefon v ČR už má správnou lokální TZ (CET/CEST).
export const APP_TZ = "Europe/Prague";

// HH:MM v lokálním čase zařízení
export function hm(iso?: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" });
}

// DD.MM.YYYY HH:MM v lokálním čase zařízení
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

// --- Kompatibilita se starším kódem ---
export function fmtCZ(dt: string | null | undefined) {
  return dtCZ(dt ?? null);
}

// Helper: přečte hodinu/minutu v TZ (jen pro výpočty)
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
 * Pravidlo:
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
  // přes půlnoc
  if (delta < -720) delta += 1440;
  if (delta > 720) delta -= 1440;

  return new Date(d.getTime() + delta * 60000);
}

// alias pro starší názvy (kdybys je někde měl)
export function roundToHalfHourCZ(iso: string) {
  return roundTo30ByTZ(iso, APP_TZ);
}
