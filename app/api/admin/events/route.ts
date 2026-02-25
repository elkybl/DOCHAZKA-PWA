import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session || (session as any).role !== "admin") return json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const site_id = url.searchParams.get("site_id");
  const user_id = url.searchParams.get("user_id");
  const type = url.searchParams.get("type");

  const db = supabaseAdmin();
  let q = db
    .from("attendance_events")
    .select("id,user_id,site_id,type,server_time,day_local,note_work,km,offsite_reason,offsite_hours,material_desc,material_amount,is_paid")
    .order("server_time", { ascending: false })
    .limit(2000);

  if (from) q = q.gte("server_time", new Date(from).toISOString());
  if (to) q = q.lte("server_time", new Date(to).toISOString());
  if (site_id) q = q.eq("site_id", site_id);
  if (user_id) q = q.eq("user_id", user_id);
  if (type) q = q.eq("type", type);

  const { data, error } = await q;
  if (error) return json({ error: "DB chyba." }, { status: 500 });

  // map user/site names
  const userIds = Array.from(new Set((data || []).map((x: any) => x.user_id))).filter(Boolean);
  const siteIds = Array.from(new Set((data || []).map((x: any) => x.site_id))).filter(Boolean);

  const [{ data: users }, { data: sites }] = await Promise.all([
    userIds.length
      ? db.from("users").select("id,name").in("id", userIds)
      : Promise.resolve({ data: [] as any[] }),
    siteIds.length
      ? db.from("sites").select("id,name").in("id", siteIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const userName = new Map<string, string>();
  for (const u of users || []) userName.set((u as any).id, (u as any).name);

  const siteName = new Map<string, string>();
  for (const s of sites || []) siteName.set((s as any).id, (s as any).name);

  const rows = (data || []).map((e: any) => ({
    ...e,
    user_name: userName.get(e.user_id) || e.user_id,
    site_name: e.site_id ? siteName.get(e.site_id) || e.site_id : null,
  }));

  return json({ rows });
}
