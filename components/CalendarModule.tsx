"use client";

import { useEffect, useMemo, useState } from "react";
import { calendarItemTypes, calendarTypeLabels, isAvailability, isWorkRelated, type CalendarItemType } from "@/lib/calendar";

type User = { id: string; name: string };

type CalendarItem = {
  id: string;
  source?: "calendar" | "attendance";
  readonly?: boolean;
  user_id: string;
  user_name?: string;
  type: CalendarItemType;
  title: string;
  date: string;
  start_time: string | null;
  end_time: string | null;
  all_day: boolean;
  location: string | null;
  notes: string | null;
  planned_hours: number | null;
  actual_hours: number | null;
  status: "planned" | "in_progress" | "done" | "cancelled";
  seen_confirmed: boolean;
  seen_at: string | null;
  attendance_status: "pending" | "checked_in" | "confirmed" | "missed" | "excused" | null;
  check_in_at: string | null;
  check_out_at: string | null;
  attendance_note: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

type FormState = {
  id: string | null;
  user_id: string;
  type: CalendarItemType;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  all_day: boolean;
  location: string;
  notes: string;
  planned_hours: string;
};

const initialForm = (date: string, userId = "", type: CalendarItemType = "work_shift"): FormState => ({
  id: null,
  user_id: userId,
  type,
  title: defaultTitle(type),
  date,
  start_time: "",
  end_time: "",
  all_day: false,
  location: "",
  notes: "",
  planned_hours: "",
});

function defaultTitle(type: CalendarItemType) {
  switch (type) {
    case "availability":
      return "Dostupny";
    case "vacation":
      return "Dovolena";
    case "sick_leave":
      return "Nemoc";
    case "doctor":
      return "Lekar";
    case "personal_leave":
      return "Osobni volno";
    case "meeting":
      return "Schuzka";
    case "training":
      return "Skoleni";
    case "service_visit":
      return "Servis";
    case "installation_job":
      return "Montaz";
    case "custom":
      return "Vlastni polozka";
    default:
      return "Prace";
  }
}

function getToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("token");
}

function getLocalUser() {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem("user");
  return raw ? (JSON.parse(raw) as { id: string; name: string; role: string }) : null;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(day: string, count: number) {
  const d = new Date(`${day}T12:00:00`);
  d.setDate(d.getDate() + count);
  return d.toISOString().slice(0, 10);
}

function startOfWeek(day: string) {
  const d = new Date(`${day}T12:00:00`);
  const weekday = d.getDay() || 7;
  d.setDate(d.getDate() - weekday + 1);
  return d.toISOString().slice(0, 10);
}

function startOfMonth(day: string) {
  return `${day.slice(0, 7)}-01`;
}

function monthDays(anchor: string) {
  const first = startOfMonth(anchor);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function weekDays(anchor: string) {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

function formatDate(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("cs-CZ", { weekday: "short", day: "numeric", month: "numeric" });
}

function formatMonth(day: string) {
  return new Date(`${day}T12:00:00`).toLocaleDateString("cs-CZ", { month: "long", year: "numeric" });
}

function timeLabel(item: CalendarItem) {
  if (item.all_day) return "Cely den";
  if (item.start_time && item.end_time) return `${item.start_time.slice(0, 5)} - ${item.end_time.slice(0, 5)}`;
  if (item.start_time) return `Od ${item.start_time.slice(0, 5)}`;
  return "Cas neurcen";
}

function statusLabel(item: CalendarItem) {
  if (item.source === "attendance") return "Skutecna dochazka";
  if (item.type === "availability") return "Dostupnost";
  if (item.approved_at) return "Schvaleno";
  if (item.attendance_status === "confirmed") return "Dochazka potvrzena";
  if (item.attendance_status === "checked_in") return "Probiha";
  if (item.seen_confirmed) return "Videno";
  return "Ceka na potvrzeni";
}

function statusClass(item: CalendarItem) {
  if (item.source === "attendance") return "bg-slate-950 text-white border-slate-950";
  if (item.type === "availability") return "bg-cyan-50 text-cyan-800 border-cyan-100";
  if (item.approved_at) return "bg-emerald-50 text-emerald-800 border-emerald-100";
  if (item.attendance_status === "confirmed") return "bg-blue-50 text-blue-800 border-blue-100";
  if (item.attendance_status === "checked_in") return "bg-slate-950 text-white border-slate-950";
  if (item.seen_confirmed) return "bg-slate-100 text-slate-700 border-slate-200";
  return "bg-amber-50 text-amber-800 border-amber-100";
}

function typeClass(type: CalendarItemType) {
  if (type === "availability") return "border-cyan-200 bg-cyan-50";
  if (["vacation", "sick_leave", "doctor", "personal_leave", "obstacle"].includes(type)) return "border-amber-200 bg-amber-50";
  if (["meeting", "training"].includes(type)) return "border-blue-200 bg-blue-50";
  return "border-emerald-200 bg-emerald-50";
}

function formatAvailability(item: CalendarItem) {
  if (item.all_day) return "Cely den k dispozici";
  if (item.start_time && item.end_time) return `${item.start_time.slice(0, 5)} - ${item.end_time.slice(0, 5)}`;
  if (item.start_time) return `Od ${item.start_time.slice(0, 5)}`;
  return "Bez casu";
}

export function CalendarModule({ admin = false }: { admin?: boolean }) {
  const [token, setToken] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; name: string; role: string } | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [items, setItems] = useState<CalendarItem[]>([]);
  const [anchor, setAnchor] = useState(todayKey());
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [view, setView] = useState<"month" | "week">("month");
  const [userFilter, setUserFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => initialForm(todayKey()));
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = getToken();
    const u = getLocalUser();
    setToken(t);
    setMe(u);
    if (!t) window.location.href = "/login";
  }, []);

  useEffect(() => {
    if (!admin || !token) return;
    fetch("/api/admin/users", { headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json().catch(() => ({})))
      .then((d) => setUsers(d.users || []))
      .catch(() => setUsers([]));
  }, [admin, token]);

  const range = useMemo(() => {
    const days = view === "week" ? weekDays(anchor) : monthDays(anchor);
    return { from: days[0], to: days[days.length - 1], days };
  }, [anchor, view]);

  async function load() {
    if (!token) return;
    setErr(null);
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (admin && userFilter !== "ALL") qs.set("user_id", userFilter);
    if (typeFilter !== "ALL") qs.set("type", typeFilter);
    const res = await fetch(`/api/calendar?${qs.toString()}`, { headers: { authorization: `Bearer ${token}` } });
    const data = (await res.json().catch(() => ({}))) as { items?: CalendarItem[]; error?: string };
    if (!res.ok) {
      setErr(data.error || "Kalendar nejde nacist.");
      return;
    }
    setItems(data.items || []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, range.from, range.to, userFilter, typeFilter]);

  const byDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items) map.set(item.date, [...(map.get(item.date) || []), item]);
    return map;
  }, [items]);

  const selectedItems = useMemo(() => byDay.get(selectedDay) || [], [byDay, selectedDay]);
  const selectedUserCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of selectedItems) map.set(item.user_name || "Pracovnik", (map.get(item.user_name || "Pracovnik") || 0) + 1);
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "cs"));
  }, [selectedItems]);
  const selectedAvailability = useMemo(
    () => selectedItems.filter((item) => item.type === "availability" && item.source !== "attendance"),
    [selectedItems],
  );
  const formAvailability = useMemo(() => {
    if (!form.date || !form.user_id) return [];
    return items.filter(
      (item) => item.date === form.date && item.user_id === form.user_id && item.type === "availability" && item.source !== "attendance",
    );
  }, [form.date, form.user_id, items]);
  const adminNeedsAvailabilityWarning = admin && isWorkRelated(form.type) && !!form.user_id && formAvailability.length === 0;

  function openCreate(day = selectedDay, type: CalendarItemType = admin ? "work_shift" : "availability") {
    setForm(initialForm(day, admin && userFilter !== "ALL" ? userFilter : me?.id || "", type));
    setFormOpen(true);
    setErr(null);
    setInfo(null);
  }

  function openEdit(item: CalendarItem) {
    setForm({
      id: item.id,
      user_id: item.user_id,
      type: item.type,
      title: item.title,
      date: item.date,
      start_time: item.start_time?.slice(0, 5) || "",
      end_time: item.end_time?.slice(0, 5) || "",
      all_day: item.all_day,
      location: item.location || "",
      notes: item.notes || "",
      planned_hours: item.planned_hours == null ? "" : String(item.planned_hours),
    });
    setFormOpen(true);
    setErr(null);
    setInfo(null);
  }

  async function saveForm() {
    if (!token) return;
    const finalTitle = form.title.trim() || defaultTitle(form.type);
    if (!finalTitle) return setErr("Dopln nazev polozky.");
    if (admin && !form.user_id) return setErr("Vyber pracovnika.");
    setBusy("form");
    setErr(null);
    setInfo(null);
    try {
      const payload = {
        user_id: admin ? form.user_id : undefined,
        type: form.type,
        title: finalTitle,
        date: form.date,
        start_time: form.all_day || !form.start_time ? null : form.start_time,
        end_time: form.all_day || !form.end_time ? null : form.end_time,
        all_day: form.all_day,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
        planned_hours: form.planned_hours ? Number(form.planned_hours.replace(",", ".")) : null,
      };
      const res = await fetch(form.id ? `/api/calendar/${form.id}` : "/api/calendar", {
        method: form.id ? "PATCH" : "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Neslo ulozit polozku.");
      setInfo(adminNeedsAvailabilityWarning ? "Polozka je ulozena jako plan. Pracovnik pro ten den jeste nema zadanou dostupnost." : "Kalendar ulozen.");
      setFormOpen(false);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Neslo ulozit polozku.");
    } finally {
      setBusy(null);
    }
  }

  async function patchItem(item: CalendarItem, patch: Record<string, unknown>) {
    if (!token) return;
    setBusy(item.id);
    setErr(null);
    setInfo(null);
    try {
      const res = await fetch(`/api/calendar/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(patch),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Neslo ulozit zmenu.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Neslo ulozit zmenu.");
    } finally {
      setBusy(null);
    }
  }

  async function deleteItem(item: CalendarItem) {
    if (!token || !confirm(`Smazat polozku "${item.title}"?`)) return;
    setBusy(item.id);
    setErr(null);
    try {
      const res = await fetch(`/api/calendar/${item.id}`, { method: "DELETE", headers: { authorization: `Bearer ${token}` } });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Neslo smazat polozku.");
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Neslo smazat polozku.");
    } finally {
      setBusy(null);
    }
  }

  function move(delta: number) {
    setAnchor(addDays(anchor, view === "week" ? delta * 7 : delta * 31));
  }

  const workerAvailabilityCount = items.filter((item) => item.type === "availability" && item.source !== "attendance").length;

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[auto_auto_1fr_auto] lg:items-end">
          <div>
            <div className="text-xs font-medium text-slate-600">Zobrazeni</div>
            <div className="mt-2 grid grid-cols-2 rounded-lg border bg-slate-50 p-1">
              {(["month", "week"] as const).map((item) => (
                <button key={item} onClick={() => setView(item)} className={`rounded-md px-3 py-2 text-xs font-semibold ${view === item ? "bg-slate-950 text-white" : "text-slate-600"}`}>
                  {item === "month" ? "Mesic" : "Tyden"}
                </button>
              ))}
            </div>
          </div>
          {admin ? (
            <label className="block text-xs font-medium text-slate-600">
              Pracovnik
              <select className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
                <option value="ALL">Vsichni</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          ) : (
            <div className="rounded-lg border border-cyan-100 bg-cyan-50 px-4 py-3">
              <div className="text-xs font-medium text-cyan-800">Moje dostupnost</div>
              <div className="mt-1 text-sm text-cyan-950">V obdobi mas zadanych {workerAvailabilityCount} dostupnosti.</div>
            </div>
          )}
          <label className="block text-xs font-medium text-slate-600">
            Typ
            <select className="mt-2 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option value="ALL">Vsechny typy</option>
              {calendarItemTypes.map((type) => <option key={type} value={type}>{calendarTypeLabels[type]}</option>)}
            </select>
          </label>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            {!admin ? <button className="rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-900 shadow-sm" onClick={() => openCreate(selectedDay, "availability")}>Nastavit dostupnost</button> : null}
            <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white shadow-sm" onClick={() => openCreate(selectedDay, admin ? "work_shift" : "custom")}>Pridat polozku</button>
          </div>
        </div>
        {err ? <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</div> : null}
        {info ? <div className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div> : null}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xl font-semibold capitalize">{formatMonth(anchor)}</div>
            <div className="mt-1 text-xs text-slate-500">{range.from} - {range.to}</div>
          </div>
          <div className="flex gap-2">
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => move(-1)}>Predchozi</button>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => { setAnchor(todayKey()); setSelectedDay(todayKey()); }}>Dnes</button>
            <button className="rounded-lg border px-3 py-2 text-sm" onClick={() => move(1)}>Dalsi</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-slate-500">
          {["Po", "Ut", "St", "Ct", "Pa", "So", "Ne"].map((d) => <div key={d} className="py-1">{d}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {range.days.map((day) => {
            const dayItems = byDay.get(day) || [];
            const active = day === selectedDay;
            const muted = day.slice(0, 7) !== anchor.slice(0, 7) && view === "month";
            return (
              <button key={day} onClick={() => setSelectedDay(day)} className={`min-h-28 rounded-lg border p-2 text-left transition ${active ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white hover:bg-slate-50"} ${muted ? "opacity-50" : ""}`}>
                <div className="text-xs font-semibold">{formatDate(day)}</div>
                <div className="mt-2 space-y-1">
                  {dayItems.slice(0, 3).map((item) => (
                    <div key={item.id} className={`truncate rounded border px-2 py-1 text-[11px] ${item.source === "attendance" ? "border-slate-300 bg-slate-100" : typeClass(item.type)}`}>
                      <span className="font-semibold">{item.start_time ? `${item.start_time.slice(0, 5)} ` : ""}{admin ? `${item.user_name || "Pracovnik"} · ` : ""}</span>
                      {item.title}
                    </div>
                  ))}
                  {dayItems.length > 3 ? <div className="text-[11px] text-slate-500">+{dayItems.length - 3} dalsi</div> : null}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Detail dne</h2>
              <div className="mt-1 text-sm text-slate-500">{selectedDay}</div>
            </div>
            <div className="flex gap-2">
              {!admin ? <button className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-900" onClick={() => openCreate(selectedDay, "availability")}>Dostupnost</button> : null}
              <button className="rounded-lg border px-3 py-2 text-sm font-semibold" onClick={() => openCreate(selectedDay, admin ? "work_shift" : "custom")}>Pridat</button>
            </div>
          </div>
          {admin && selectedUserCounts.length ? <div className="mt-3 flex flex-wrap gap-2">{selectedUserCounts.map(([name, count]) => <span key={name} className="rounded-full border bg-slate-50 px-3 py-1 text-xs font-semibold text-slate-700">{name}: {count}</span>)}</div> : null}
          {admin ? (
            <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-cyan-950">Dostupnost pracovniku</h3>
                  <p className="mt-1 text-xs leading-5 text-cyan-900/80">Admin pri planovani hned vidi, kdo si na den zadal dostupnost a v jakem case.</p>
                </div>
                <span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-xs font-semibold text-cyan-900">{selectedAvailability.length} zaznamu</span>
              </div>
              <div className="mt-3 space-y-2">
                {selectedAvailability.length ? selectedAvailability.map((item) => (
                  <div key={item.id} className="rounded-lg border border-cyan-200 bg-white px-3 py-3 text-sm text-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-950">{item.user_name || "Pracovnik"}</div>
                      <span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-900">{formatAvailability(item)}</span>
                    </div>
                    {item.notes ? <div className="mt-1 text-xs text-slate-500">{item.notes}</div> : null}
                  </div>
                )) : <div className="rounded-lg border border-dashed border-cyan-200 bg-white px-3 py-4 text-sm text-slate-500">Na tento den jeste nikdo nezadal dostupnost.</div>}
              </div>
            </div>
          ) : null}
          <div className="mt-4 space-y-3">
            {selectedItems.map((item) => <CalendarCard key={item.id} item={item} admin={admin} currentUserId={me?.id || ""} busy={busy === item.id} onEdit={() => openEdit(item)} onDelete={() => deleteItem(item)} onPatch={(patch) => patchItem(item, patch)} />)}
            {!selectedItems.length ? <div className="rounded-lg border bg-slate-50 p-5 text-center text-sm text-slate-500">Na tento den neni nic naplanovane.</div> : null}
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-lg font-semibold">{formOpen ? (form.id ? "Upravit polozku" : "Nova polozka") : "Rychly prehled"}</h2>
          {formOpen ? (
            <div className="mt-4 space-y-3">
              {admin ? <Field label="Pracovnik"><select className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={form.user_id} onChange={(e) => setForm((p) => ({ ...p, user_id: e.target.value }))}><option value="">Vyber pracovnika</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field> : null}
              <Field label="Typ"><select className="mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm" value={form.type} onChange={(e) => setForm((p) => ({ ...p, type: e.target.value as CalendarItemType, title: p.title.trim() ? p.title : defaultTitle(e.target.value as CalendarItemType) }))}>{calendarItemTypes.map((type) => <option key={type} value={type}>{calendarTypeLabels[type]}</option>)}</select></Field>
              <Field label="Nazev"><input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} /></Field>
              <Field label="Datum"><input type="date" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.all_day} onChange={(e) => setForm((p) => ({ ...p, all_day: e.target.checked }))} />Cely den</label>
              {!form.all_day ? <div className="grid grid-cols-2 gap-3"><Field label="Od"><input type="time" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={form.start_time} onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))} /></Field><Field label="Do"><input type="time" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={form.end_time} onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))} /></Field></div> : null}
              <Field label="Plan hodin"><input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" inputMode="decimal" value={form.planned_hours} onChange={(e) => setForm((p) => ({ ...p, planned_hours: e.target.value.replace(/[^\d.,]/g, "") }))} /></Field>
              <Field label="Misto"><input className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={form.location} onChange={(e) => setForm((p) => ({ ...p, location: e.target.value }))} /></Field>
              <Field label="Poznamka"><textarea className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" rows={4} value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} /></Field>
              {admin && isWorkRelated(form.type) ? <div className={`rounded-lg border p-3 text-sm ${adminNeedsAvailabilityWarning ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>{adminNeedsAvailabilityWarning ? <><div className="font-semibold">Pracovnik jeste nema zadanou dostupnost.</div><div className="mt-1">Polozku muzes ulozit jako plan, ale zustane v rezimu cekani na potvrzeni.</div></> : <><div className="font-semibold">Dostupnost nalezena.</div><div className="mt-1">{formAvailability.map((item) => formatAvailability(item)).join(", ")}</div></>}</div> : null}
              {!admin && isAvailability(form.type) ? <div className="rounded-lg border border-cyan-200 bg-cyan-50 p-3 text-sm text-cyan-900">Touto polozkou si znacis, kdy muzes pracovat. Admin pak pri planovani rovnou uvidi tvoje casove okno.</div> : null}
              <div className="flex justify-end gap-2"><button className="rounded-lg border px-4 py-2 text-sm" onClick={() => setFormOpen(false)}>Zrusit</button><button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy === "form"} onClick={saveForm}>{busy === "form" ? "Ukladam" : "Ulozit"}</button></div>
            </div>
          ) : <div className="mt-4 grid gap-2"><Mini label="Polozky v obdobi" value={String(items.length)} /><Mini label="Vybrany den" value={String(selectedItems.length)} /><Mini label="Neprectene" value={String(items.filter((x) => !x.seen_confirmed && x.source !== "attendance").length)} /></div>}
        </div>
      </section>
    </div>
  );
}

function CalendarCard({ item, admin, currentUserId, busy, onEdit, onDelete, onPatch }: { item: CalendarItem; admin: boolean; currentUserId: string; busy: boolean; onEdit: () => void; onDelete: () => void; onPatch: (patch: Record<string, unknown>) => void }) {
  const work = isWorkRelated(item.type);
  const canAcknowledge = item.user_id === currentUserId;
  const readOnly = !!item.readonly || item.source === "attendance";
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${readOnly ? "border-slate-300 bg-slate-100 text-slate-800" : typeClass(item.type)}`}>{readOnly ? "Dochazka" : calendarTypeLabels[item.type]}</span>
            <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${statusClass(item)}`}>{statusLabel(item)}</span>
          </div>
          <h3 className="mt-2 text-base font-semibold">{item.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{timeLabel(item)}</span><span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-700">{item.user_name || "Pracovnik"}</span></div>
          {item.location ? <div className="mt-1 text-xs text-slate-500">{item.location}</div> : null}
        </div>
        <div className="text-right text-sm">{item.planned_hours != null ? <div>Plan {item.planned_hours} h</div> : null}{item.actual_hours != null ? <div className="font-semibold">Skutecne {item.actual_hours} h</div> : null}</div>
      </div>
      {item.notes ? <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">{item.notes}</div> : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {!readOnly && !item.seen_confirmed && canAcknowledge ? <button className="rounded-lg border px-3 py-2 text-sm" disabled={busy} onClick={() => onPatch({ seen_confirmed: true })}>Videno</button> : null}
        {!readOnly && work && !item.check_in_at ? <button className="rounded-lg border px-3 py-2 text-sm" disabled={busy} onClick={() => onPatch({ check_in_at: new Date().toISOString() })}>Prichod</button> : null}
        {!readOnly && work && item.check_in_at && !item.check_out_at ? <button className="rounded-lg border px-3 py-2 text-sm" disabled={busy} onClick={() => onPatch({ check_out_at: new Date().toISOString() })}>Odchod</button> : null}
        {!readOnly && admin && !item.approved_at ? <button className="rounded-lg border px-3 py-2 text-sm" disabled={busy} onClick={() => onPatch({ approved: true })}>Schvalit</button> : null}
        {!readOnly ? <button className="rounded-lg border px-3 py-2 text-sm" onClick={onEdit}>Upravit</button> : null}
        {!readOnly ? <button className="rounded-lg border px-3 py-2 text-sm hover:bg-red-50" disabled={busy} onClick={onDelete}>Smazat</button> : null}
      </div>
    </article>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block text-xs font-medium text-slate-600">{label}{children}</label>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border bg-slate-50 p-3"><div className="text-xs text-slate-500">{label}</div><div className="mt-1 text-xl font-semibold">{value}</div></div>;
}
