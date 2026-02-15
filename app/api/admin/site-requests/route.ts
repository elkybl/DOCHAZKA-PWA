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

  const { data: sites, error } = await db
    .from("sites")
    .select("id,name,address,lat,lng,radius_m,is_pending,is_archived,created_by,created_at")
    .eq("is_pending", true)
    .eq("is_archived", false)
    .order("created_at", { ascending: false });

  if (error) return json({ error: "DB chyba (sites)." }, { status: 500 });

  const { data: users } = await db.from("users").select("id,name");
  const uMap = new Map<string, string>();
  for (const u of users || []) uMap.set(String((u as any).id), String((u as any).name));

  const rows = (sites || []).map((s: any) => ({
    ...s,
    created_by_name: s.created_by ? uMap.get(String(s.created_by)) || "—" : "—",
  }));

  return json({ rows });
}
