import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId as string;
  const db = supabaseAdmin();

  const { data: lastIn, error: inErr } = await db
    .from("attendance_events")
    .select("id,site_id,server_time")
    .eq("user_id", userId)
    .eq("type", "IN")
    .order("server_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inErr) return json({ error: "DB chyba." }, { status: 500 });
  if (!lastIn) return json({ status: "OUT", open: null });

  const { data: firstOutAfter, error: outErr } = await db
    .from("attendance_events")
    .select("id,server_time")
    .eq("user_id", userId)
    .eq("type", "OUT")
    .gt("server_time", lastIn.server_time)
    .order("server_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (outErr) return json({ error: "DB chyba." }, { status: 500 });

  if (firstOutAfter) {
    return json({ status: "OUT", open: null });
  }

  return json({
    status: "IN",
    open: { site_id: lastIn.site_id ?? null, in_time: lastIn.server_time, in_event_id: lastIn.id },
  });
}
