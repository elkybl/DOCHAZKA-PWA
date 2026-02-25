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

  const inTime = lastIn?.server_time ? new Date(lastIn.server_time).getTime() : 0;
  const outTime = lastOut?.server_time ? new Date(lastOut.server_time).getTime() : 0;

  const isIn = !!lastIn && inTime > outTime;

  return json({
    status: isIn ? "IN" : "OUT",
    open: isIn
      ? {
          site_id: lastIn.site_id ?? null,
          in_time: lastIn.server_time,
        }
      : null,
  });
}
