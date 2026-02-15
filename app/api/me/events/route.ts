import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const url = new URL(req.url);
  const days = Number(url.searchParams.get("days") || "14");
  const from = new Date(Date.now() - Math.max(1, Math.min(60, days)) * 86400000).toISOString();

  const db = supabaseAdmin();

  const { data, error } = await db
    .from("attendance_events")
    .select(`
      id,
      type,
      server_time,
      site_id,
      note_work,
      km,
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

  const rows = (data || []).map((r: any) => ({
    id: r.id,
    type: r.type,
    server_time: r.server_time,
    site_id: r.site_id,
    site_name: r.sites?.name || null,
    note_work: r.note_work ?? "",
    km: r.km ?? 0,
    offsite_reason: r.offsite_reason ?? "",
    offsite_hours: r.offsite_hours ?? 0,
    material_desc: r.material_desc ?? "",
    material_amount: r.material_amount ?? 0,
    is_paid: !!r.is_paid,
  }));

  return json({ rows });
}
