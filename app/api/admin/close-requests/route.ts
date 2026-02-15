import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });
  if ((session as any).role !== "admin") return json({ error: "Unauthorized" }, { status: 401 });

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("attendance_close_requests")
    .select(
      "id,user_id,site_id,in_time,requested_at,reported_left_at,forget_reason,note_work,km,material_desc,material_amount,status"
    )
    .eq("status", "pending")
    .order("requested_at", { ascending: true });

  if (error) return json({ error: "DB chyba (requests)." }, { status: 500 });

  // pro hezčí UI si dotáhneme jména userů + site názvy
  const { data: users } = await db.from("users").select("id,name");
  const { data: sites } = await db.from("sites").select("id,name");

  const uMap = new Map<string, string>();
  for (const u of users || []) uMap.set((u as any).id, (u as any).name);

  const sMap = new Map<string, string>();
  for (const s of sites || []) sMap.set((s as any).id, (s as any).name);

  const rows = (data || []).map((r: any) => ({
    ...r,
    user_name: uMap.get(r.user_id) || "—",
    site_name: r.site_id ? sMap.get(r.site_id) || "—" : "—",
  }));

  return json({ rows });
}
