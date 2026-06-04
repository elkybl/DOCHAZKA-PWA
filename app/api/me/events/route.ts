import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { buildDayReviewKey, listLatestUserDayReviews } from "@/lib/day-reviews";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") || "120");
  const onlyUnpaid = url.searchParams.get("only_unpaid") === "1";
  const from = new Date(Date.now() - Math.max(1, Math.min(365, days)) * 86400000).toISOString();

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("attendance_events")
    .select(`
      id,
      type,
      server_time,
      day_local,
      site_id,
      note_work,
      km,
      programming_hours,
      programming_note,
      offsite_reason,
      offsite_hours,
      material_desc,
      material_amount,
      is_paid,
      sites:site_id ( name )
    `)
    .eq("user_id", session.userId)
    .gte("server_time", from)
    .in("type", ["OUT", "OFFSITE"])
    .order("server_time", { ascending: false });

  if (error) return json({ error: "DB chyba." }, { status: 500 });

  const allRows = (data || []).map((r: any) => ({
    id: r.id,
    type: r.type,
    server_time: r.server_time,
    day_local: r.day_local || r.server_time.slice(0, 10),
    site_id: r.site_id,
    site_name: r.sites?.name || null,
    note_work: r.note_work ?? "",
    km: r.km ?? 0,
    programming_hours: r.programming_hours ?? 0,
    programming_note: r.programming_note ?? "",
    offsite_reason: r.offsite_reason ?? "",
    offsite_hours: r.offsite_hours ?? 0,
    material_desc: r.material_desc ?? "",
    material_amount: r.material_amount ?? 0,
    is_paid: !!r.is_paid,
  }));

  const daysUsed = Array.from(new Set(allRows.map((row) => row.day_local))).sort();
  const fromDay = daysUsed[0];
  const toDay = daysUsed[daysUsed.length - 1];

  let locks: Array<{ from_day: string; to_day: string }> = [];
  if (fromDay && toDay) {
    const { data: lockRows } = await db
      .from("attendance_payroll_locks")
      .select("from_day,to_day")
      .lte("from_day", toDay)
      .gte("to_day", fromDay);
    locks = (lockRows as Array<{ from_day: string; to_day: string }>) || [];
  }

  const reviews = fromDay && toDay ? await listLatestUserDayReviews(db, { userId: session.userId, fromDay, toDay }) : new Map();

  let rows = allRows.map((row) => {
    const day = row.day_local;
    const lock = locks.find((item) => item.from_day <= day && item.to_day >= day);
    const review = reviews.get(buildDayReviewKey(session.userId, row.day_local, row.site_id));
    return {
      ...row,
      is_locked: !!lock,
      lock_range: lock ? `${lock.from_day} – ${lock.to_day}` : null,
      review_status: review?.status || null,
      review_note: review?.note || null,
      approved_at: review?.approved_at || null,
    };
  });

  if (onlyUnpaid) rows = rows.filter((r: any) => !r.is_paid);
  return json({ rows });
}
