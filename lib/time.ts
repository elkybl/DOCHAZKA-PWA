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
