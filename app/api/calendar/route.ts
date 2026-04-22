import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { calendarCreateSchema, normalizeCalendarPayload } from "@/lib/calendar";

type UserRow = { id: string; name: string };

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

  const userIds = [...new Set((data || []).map((row) => String((row as { user_id: string }).user_id)))];
  const names = new Map<string, string>();
  if (userIds.length) {
    const users = await db.from("users").select("id,name").in("id", userIds);
    for (const u of (users.data || []) as UserRow[]) names.set(u.id, u.name);
  }

  return json({
    items: (data || []).map((row) => ({
      ...row,
      user_name: names.get(String((row as { user_id: string }).user_id)) || "Neznámý pracovník",
    })),
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

  const payload = normalizeCalendarPayload({
    ...parsed.data,
    user_id: targetUserId,
    created_by: session.userId,
    updated_by: session.userId,
    attendance_status: parsed.data.attendance_status || "pending",
  });

  const db = supabaseAdmin();
  const { data, error } = await db.from("calendar_items").insert(payload).select("*").single();
  if (error || !data) return json({ error: "Nešlo uložit položku kalendáře." }, { status: 500 });

  return json({ item: data });
}
