import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { toDate } from "@/lib/time";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId as string;
  const db = supabaseAdmin();

  const { data: lastIn } = await db
    .from("attendance_events")
    .select("site_id,server_time,type")
    .eq("user_id", userId)
    .eq("type", "IN")
    .order("server_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastOut } = await db
    .from("attendance_events")
    .select("server_time,type")
    .eq("user_id", userId)
    .eq("type", "OUT")
    .order("server_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inTime = lastIn?.server_time ? toDate(lastIn.server_time).getTime() : 0;
  const outTime = lastOut?.server_time ? toDate(lastOut.server_time).getTime() : 0;

  const isIn = !!lastIn && (inTime > outTime || (inTime === outTime && inTime > 0));

  const { data: recentRows } = await db
    .from("attendance_events")
    .select("site_id,server_time")
    .eq("user_id", userId)
    .not("site_id", "is", null)
    .order("server_time", { ascending: false })
    .limit(25);

  const recentSiteIds = [...new Set(((recentRows || []) as Array<{ site_id: string | null }>).map((row) => row.site_id).filter(Boolean) as string[])].slice(0, 5);
  let recentSites: Array<{ id: string; name: string }> = [];

  if (recentSiteIds.length) {
    const { data: siteRows } = await db.from("sites").select("id,name").in("id", recentSiteIds);
    const siteMap = new Map<string, string>();
    for (const row of (siteRows || []) as Array<{ id: string; name: string | null }>) {
      siteMap.set(String(row.id), String(row.name || "Neznámá stavba"));
    }
    recentSites = recentSiteIds
      .map((id) => ({ id, name: siteMap.get(id) || "Neznámá stavba" }))
      .filter((site) => !!site.id);
  }

  return json({
    status: isIn ? "IN" : "OUT",
    open: isIn
      ? {
          site_id: lastIn.site_id ?? null,
          in_time: lastIn.server_time,
        }
      : null,
    recent_sites: recentSites,
  });
}
