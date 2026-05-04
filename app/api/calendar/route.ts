import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { compareAttendanceEventsAsc } from "@/lib/attendance-order";
import { calendarCreateSchema, normalizeCalendarPayload } from "@/lib/calendar";
import { buildCalendarLink, sendNotification } from "@/lib/notify";
import { dayLocalCZFromIso, hm, toDate } from "@/lib/time";

type UserRow = { id: string; name: string; email?: string | null };
type AttendanceEventRow = {
  user_id: string;
  site_id: string | null;
  type: "IN" | "OUT" | "OFFSITE";
  server_time: string;
  day_local: string | null;
  note_work: string | null;
  offsite_reason: string | null;
  offsite_hours: number | null;
  sites?: { name?: string | null } | null;
};

function dateParam(value: string | null, fallback: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function timeForCalendar(iso: string | null) {
  if (!iso) return null;
  const value = hm(iso);
  return /^\d{2}:\d{2}$/.test(value) ? value : null;
}

function weekdayFromDate(day: string) {
  const weekday = new Date(`${day}T12:00:00`).getDay();
  return weekday === 0 ? 7 : weekday;
}

function enumerateDays(from: string, to: string) {
  const result: string[] = [];
  const cursor = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (cursor <= end) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

async function requireSession(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  const session = auth.session;
  const url = new URL(req.url);
  const from = dateParam(url.searchParams.get("from"), today());
  const to = dateParam(url.searchParams.get("to"), plusDays(30));
  const requestedUser = url.searchParams.get("user_id");
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status");
  const showDeleted = url.searchParams.get("deleted") === "1" && session.role === "admin";

  const db = supabaseAdmin();

  let query = db
    .from("calendar_items")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: true });

  if (!showDeleted) query = query.is("deleted_at", null);
  if (session.role !== "admin") query = query.eq("user_id", session.userId);
  else if (requestedUser) query = query.eq("user_id", requestedUser);
  if (type) query = query.eq("type", type);
  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return json({ error: "DB chyba kalendáře. Je potřeba spustit migraci calendar_items." }, { status: 500 });

  const attendanceItems = await loadAttendanceItems({
    db,
    from,
    to,
    type,
    status,
    role: session.role,
    sessionUserId: session.userId,
    requestedUser,
  });

  const userIds = [
    ...new Set([
      ...(data || []).map((row) => String((row as { user_id: string }).user_id)),
      ...attendanceItems.map((row) => String(row.user_id)),
    ]),
  ];
  const names = new Map<string, string>();
  if (userIds.length) {
    const users = await db.from("users").select("id,name").in("id", userIds);
    for (const u of (users.data || []) as UserRow[]) names.set(u.id, u.name);
  }

  const items = [
    ...(data || []).map((row) => ({
      ...row,
      source: "calendar",
      readonly: false,
      user_name: names.get(String((row as { user_id: string }).user_id)) || "Neznámý pracovník",
    })),
    ...attendanceItems.map((row) => ({
      ...row,
      user_name: names.get(String(row.user_id)) || "Neznámý pracovník",
    })),
  ].sort((a, b) => {
    if (String(a.date) !== String(b.date)) return String(a.date).localeCompare(String(b.date));
    return String(a.start_time || "").localeCompare(String(b.start_time || ""));
  });

  return json({ items });
}

async function loadAttendanceItems({
  db,
  from,
  to,
  type,
  status,
  role,
  sessionUserId,
  requestedUser,
}: {
  db: ReturnType<typeof supabaseAdmin>;
  from: string;
  to: string;
  type: string | null;
  status: string | null;
  role: "admin" | "worker";
  sessionUserId: string;
  requestedUser: string | null;
}) {
  if ((type && type !== "work_shift") || (status && status !== "done")) return [];

  let evQuery = db
    .from("attendance_events")
    .select("user_id,site_id,type,server_time,day_local,note_work,offsite_reason,offsite_hours,sites:site_id(name)")
    .gte("day_local", from)
    .lte("day_local", to)
    .in("type", ["IN", "OUT", "OFFSITE"])
    .order("day_local", { ascending: true })
    .order("server_time", { ascending: true });

  if (role !== "admin") evQuery = evQuery.eq("user_id", sessionUserId);
  else if (requestedUser) evQuery = evQuery.eq("user_id", requestedUser);

  const evResult = await evQuery;
  if (evResult.error) return [];

  const byUserDaySite = new Map<string, AttendanceEventRow[]>();
  for (const event of (evResult.data || []) as AttendanceEventRow[]) {
    const day = event.day_local || dayLocalCZFromIso(event.server_time);
    if (!day) continue;
    const key = `${event.user_id}__${day}__${event.site_id || "none"}`;
    byUserDaySite.set(key, [...(byUserDaySite.get(key) || []), { ...event, day_local: day }]);
  }

  return Array.from(byUserDaySite.entries()).map(([key, listRaw]) => {
    const [userId, day, siteIdRaw] = key.split("__");
    const list = [...listRaw].sort(compareAttendanceEventsAsc);
    const siteName = list.find((event) => event.sites?.name)?.sites?.name || null;
    let lastIn: AttendanceEventRow | null = null;
    let firstIn: string | null = null;
    let lastOut: string | null = null;
    let hours = 0;
    const notes: string[] = [];

    for (const event of list) {
      if (event.type === "IN") {
        lastIn = event;
        if (!firstIn) firstIn = event.server_time;
      } else if (event.type === "OUT") {
        lastOut = event.server_time;
        if (lastIn) {
          const diff = (toDate(event.server_time).getTime() - toDate(lastIn.server_time).getTime()) / 3600000;
          if (Number.isFinite(diff) && diff > 0) hours += diff;
          lastIn = null;
        }
        if (event.note_work?.trim()) notes.push(event.note_work.trim());
      } else if (event.type === "OFFSITE") {
        const offHours = Number(event.offsite_hours) || 0;
        if (offHours > 0) hours += offHours;
        if (event.offsite_reason?.trim()) notes.push(`Mimo stavbu: ${event.offsite_reason.trim()}`);
      }
    }

    return {
      id: `attendance:${userId}:${day}:${siteIdRaw}`,
      source: "attendance",
      readonly: true,
      user_id: userId,
      type: "work_shift",
      title: siteName ? `Docházka · ${siteName}` : "Docházka",
      date: day,
      start_time: timeForCalendar(firstIn),
      end_time: timeForCalendar(lastOut),
      all_day: false,
      location: siteName,
      notes: notes.join("\n") || null,
      planned_hours: null,
      actual_hours: round2(hours),
      status: "done",
      seen_confirmed: true,
      seen_at: null,
      attendance_status: "confirmed",
      check_in_at: firstIn,
      check_out_at: lastOut,
      attendance_note: null,
      approved_by: null,
      approved_at: null,
    };
  });
}

export async function POST(req: NextRequest) {
  const auth = await requireSession(req);
  if (auth.error) return auth.error;

  const session = auth.session;
  const body = await req.json().catch(() => null);
  const parsed = calendarCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data kalendáře." }, { status: 400 });

  const targetUserId = session.role === "admin" ? parsed.data.user_id || session.userId : session.userId;
  if (session.role !== "admin" && parsed.data.user_id && parsed.data.user_id !== session.userId) {
    return json({ error: "Nemůžeš plánovat za jiného pracovníka." }, { status: 403 });
  }

  const targetUserIds =
    session.role === "admin"
      ? [...new Set((parsed.data.user_ids && parsed.data.user_ids.length ? parsed.data.user_ids : [targetUserId]).filter(Boolean))]
      : [session.userId];

  const normalizedPayload = normalizeCalendarPayload({
    ...parsed.data,
    user_id: targetUserId,
    created_by: session.userId,
    updated_by: session.userId,
    attendance_status: parsed.data.attendance_status || "pending",
  });
  const { user_ids: _userIds, bulk_create: _bulkCreate, ...payload } = normalizedPayload as typeof normalizedPayload & {
    user_ids?: string[];
    bulk_create?: unknown;
  };

  const db = supabaseAdmin();
  const bulk = parsed.data.bulk_create;

  async function notifyAssignedUsers(targetIds: string[], entityIds: string[]) {
    if (session.role !== "admin" || !targetIds.length) return;
    const usersRes = await db.from("users").select("id,name,email").in("id", targetIds);
    const users = (usersRes.data || []) as UserRow[];
    await Promise.all(
      users
        .filter((user) => user.id !== session.userId && user.email)
        .map((user) =>
          sendNotification({
            userId: user.id,
            email: user.email || null,
            kind: "calendar_assignment",
            entityType: "calendar_item",
            entityId: entityIds[0] || `${payload.date}:${user.id}`,
            actorUserId: session.userId,
            subject: `FlowDesk: nová práce v kalendáři na ${payload.date}`,
            text: `Ahoj ${user.name || ""},\n\nadmin ti přidal položku do kalendáře na ${payload.date}.\n\nNázev: ${payload.title}\n${payload.location ? `Místo: ${payload.location}\n` : ""}\nOtevřít kalendář: ${buildCalendarLink(payload.date)}`,
            html: `<p>Ahoj ${user.name || ""},</p><p>admin ti přidal položku do kalendáře na <strong>${payload.date}</strong>.</p><p><strong>Název:</strong> ${payload.title}</p>${payload.location ? `<p><strong>Místo:</strong> ${payload.location}</p>` : ""}<p><a href="${buildCalendarLink(payload.date)}">Otevřít kalendář</a></p>`,
            detail: { day: payload.date, title: payload.title, location: payload.location, assigned_user_id: user.id },
          }),
        ),
    );
  }

  if (session.role === "admin" && !bulk && targetUserIds.length > 1) {
    const rows = targetUserIds.map((userId) =>
      normalizeCalendarPayload({
        ...payload,
        user_id: userId,
      }),
    );
    const insertMany = await db.from("calendar_items").insert(rows).select("*");
    if (insertMany.error) return json({ error: "Nešlo uložit položku pro více pracovníků." }, { status: 500 });
    await notifyAssignedUsers(targetUserIds, (insertMany.data || []).map((row) => String((row as { id: string }).id)));
    return json({ items: insertMany.data || [], created: rows.length });
  }

  if (bulk && parsed.data.type === "availability") {
    const candidateDays = enumerateDays(bulk.from_date, bulk.to_date).filter((day) => bulk.weekdays.includes(weekdayFromDate(day)));
    if (!candidateDays.length) return json({ error: "Ve zvoleném rozsahu nevyšel žádný den." }, { status: 400 });

    const existing = await db
      .from("calendar_items")
      .select("date,start_time,end_time,all_day")
      .eq("user_id", targetUserId)
      .eq("type", "availability")
      .in("date", candidateDays)
      .is("deleted_at", null);

    const existingKeys = new Set(
      (existing.data || []).map((row) => `${row.date}__${row.start_time || ""}__${row.end_time || ""}__${row.all_day ? "1" : "0"}`),
    );

    const rows = candidateDays
      .filter((day) => !existingKeys.has(`${day}__${payload.start_time || ""}__${payload.end_time || ""}__${payload.all_day ? "1" : "0"}`))
      .map((day) =>
        normalizeCalendarPayload({
          ...payload,
          date: day,
        }),
      );

    if (!rows.length) {
      return json({ items: [], created: 0, skipped: candidateDays.length, message: "Všechny vybrané dostupnosti už existují." });
    }

    const insert = await db.from("calendar_items").insert(rows).select("*");
    if (insert.error) return json({ error: "Nešlo uložit hromadnou dostupnost." }, { status: 500 });
    return json({ items: insert.data || [], created: rows.length, skipped: candidateDays.length - rows.length });
  }

  const { data, error } = await db.from("calendar_items").insert(payload).select("*").single();
  if (error || !data) return json({ error: "Nešlo uložit položku kalendáře." }, { status: 500 });

  await notifyAssignedUsers([String(payload.user_id)], [String(data.id)]);

  return json({ item: data });
}
