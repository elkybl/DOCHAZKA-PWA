export type DayReviewStatus = "pending" | "approved" | "returned";

export type DayReviewRow = {
  id: string;
  user_id: string;
  day: string;
  site_id: string | null;
  status: DayReviewStatus;
  note: string | null;
  approved_at: string | null;
  updated_at: string | null;
};

function isMissingReviewTableMessage(message: string) {
  return message.includes("attendance_day_reviews");
}

export function buildDayReviewKey(userId: string, day: string, siteId?: string | null) {
  return `${userId}__${day}__${siteId || ""}`;
}

export function approvedDayEditMessage(day: string, actor: "worker" | "admin" = "worker") {
  if (actor === "admin") {
    return `Den ${day} je už schválený. Nejprve ho vraťte k doplnění a teprve potom upravte záznamy.`;
  }
  return `Den ${day} je už schválený. Pokud je potřeba oprava, požádejte admina o vrácení k doplnění.`;
}

export async function getLatestDayReview(
  db: any,
  params: { userId: string; day: string; siteId?: string | null }
): Promise<DayReviewRow | null> {
  let query = db
    .from("attendance_day_reviews")
    .select("id,user_id,day,site_id,status,note,approved_at,updated_at")
    .eq("user_id", params.userId)
    .eq("day", params.day);

  query = params.siteId ? query.eq("site_id", params.siteId) : query.is("site_id", null);

  const { data, error } = await query.order("updated_at", { ascending: false }).limit(1).maybeSingle();
  if (error) {
    if (isMissingReviewTableMessage(error.message || "")) return null;
    throw new Error(`DB chyba (attendance reviews): ${error.message}`);
  }
  return (data as DayReviewRow | null) || null;
}

export async function findApprovedDayReview(
  db: any,
  params: { userId: string; day: string; siteId?: string | null }
) {
  const review = await getLatestDayReview(db, params);
  return review?.status === "approved" ? review : null;
}

export async function hasAnyApprovedDayReview(
  db: any,
  params: { userId: string; day: string }
): Promise<DayReviewRow | null> {
  const { data, error } = await db
    .from("attendance_day_reviews")
    .select("id,user_id,day,site_id,status,note,approved_at,updated_at")
    .eq("user_id", params.userId)
    .eq("day", params.day)
    .eq("status", "approved")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingReviewTableMessage(error.message || "")) return null;
    throw new Error(`DB chyba (attendance reviews any approved): ${error.message}`);
  }
  return (data as DayReviewRow | null) || null;
}

export async function listLatestUserDayReviews(
  db: any,
  params: { userId: string; fromDay: string; toDay: string }
) {
  const { data, error } = await db
    .from("attendance_day_reviews")
    .select("id,user_id,day,site_id,status,note,approved_at,updated_at")
    .eq("user_id", params.userId)
    .gte("day", params.fromDay)
    .lte("day", params.toDay)
    .order("updated_at", { ascending: false });

  if (error) {
    if (isMissingReviewTableMessage(error.message || "")) return new Map<string, DayReviewRow>();
    throw new Error(`DB chyba (list attendance reviews): ${error.message}`);
  }

  const map = new Map<string, DayReviewRow>();
  for (const row of (data || []) as DayReviewRow[]) {
    const key = buildDayReviewKey(row.user_id, row.day, row.site_id);
    if (!map.has(key)) map.set(key, row);
  }
  return map;
}
