import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { parseReportedLeftAtCZ, roundToHalfHourCZ } from "@/lib/time";

function clampOutTime(out: Date, inTimeIso: string) {
  const now = new Date();
  const inTime = new Date(inTimeIso);

  // nesmí být před příchodem
  if (out.getTime() < inTime.getTime()) return new Date(inTime.getTime());

  // nesmí být v budoucnu
  if (out.getTime() > now.getTime()) return now;

  return out;
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Unauthorized" }, { status: 401 });
  if ((session as any).role !== "admin") return json({ error: "Forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!id) return json({ error: "Chybí ID." }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || "");
  const src = String(body?.out_time || body?.reported_left_at || "").trim();

  const db = supabaseAdmin();

  // načti žádost
  const { data: reqRow, error: reqErr } = await db
    .from("attendance_close_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (reqErr || !reqRow) return json({ error: "Žádost nenalezena." }, { status: 404 });

  if (action !== "APPROVE") return json({ error: "Neplatná akce." }, { status: 400 });
  if (!src) return json({ error: "Chybí čas odchodu (např. 16:50)." }, { status: 400 });

  // 1) parse reported_left_at (CZ) -> Date | null
  let outTime = parseReportedLeftAtCZ(src, reqRow.in_time);
  if (!outTime) return json({ error: "Neplatný čas. Použij např. 16:50." }, { status: 400 });

  // 2) round to nearest 30m (funkce bere ISO string)
  outTime = roundToHalfHourCZ(outTime.toISOString());

  // 3) clamp (ne dřív než IN, ne v budoucnu)
  outTime = clampOutTime(outTime, reqRow.in_time);

  // 4) vytvoř OUT event
  const { error: insErr } = await db.from("attendance_events").insert({
    user_id: reqRow.user_id,
    site_id: reqRow.site_id,
    type: "OUT",
    server_time: outTime.toISOString(),
    day_local: reqRow.day_local || null,
    note_work: reqRow.note_work || null,
    km: reqRow.km ?? null,
    material_desc: reqRow.material_desc || null,
    material_amount: reqRow.material_amount ?? null,
    offsite_reason: null,
    offsite_hours: null,
    is_paid: false,
  });

  if (insErr) return json({ error: "Nešlo vytvořit odchod." }, { status: 500 });

  // 5) označ žádost jako schválenou + uložit použitý čas
  await db
    .from("attendance_close_requests")
    .update({ status: "APPROVED", approved_out_time: outTime.toISOString() })
    .eq("id", id);

  return json({ ok: true, approved_out_time: outTime.toISOString() });
}
