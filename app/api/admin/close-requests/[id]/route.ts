import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

function parseReportedLeftAt(reported: string | null, inTimeIso: string) {
  const now = new Date();
  const inTime = new Date(inTimeIso);

  if (!reported || !reported.trim()) return now;
  const s = reported.trim();

  // 1) ISO nebo libovolný formát, co Date umí parse
  const tryFull = new Date(s);
  if (!Number.isNaN(tryFull.getTime())) return tryFull;

  // 2) HH:MM
  const m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hh = Number(m[1]);
    const mm = Number(m[2]);
    if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59) {
      const d = new Date(inTime);
      d.setHours(hh, mm, 0, 0);
      return d;
    }
  }

  return now;
}

function clampOutTime(out: Date, inTimeIso: string) {
  const now = new Date();
  const inTime = new Date(inTimeIso);

  // OUT nesmí být v budoucnu
  if (out.getTime() > now.getTime()) return now;

  // OUT nesmí být před IN
  if (out.getTime() <= inTime.getTime()) {
    return new Date(inTime.getTime() + 60_000); // IN + 1 min
  }

  return out;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });
  if ((session as any).role !== "admin") return json({ error: "Unauthorized" }, { status: 401 });

  const adminId = (session as any).userId as string;
  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const { data: reqRow, error: rErr } = await db
    .from("attendance_close_requests")
    .select("*")
    .eq("id", id)
    .single();

  if (rErr || !reqRow) return json({ error: "Žádost nenalezena." }, { status: 404 });
  if (reqRow.status !== "pending") return json({ error: "Žádost už byla vyřízena." }, { status: 400 });

  // ✅ Admin může poslat override času v body: { out_time: "16:50" }
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const override = typeof body?.out_time === "string" ? body.out_time : null;
  const src = override || (reqRow.reported_left_at ?? null);

  let outTime = parseReportedLeftAt(src, reqRow.in_time);
  outTime = clampOutTime(outTime, reqRow.in_time);

  // vytvoř OUT event s tímto časem
  const outIns = await db.from("attendance_events").insert({
    user_id: reqRow.user_id,
    site_id: reqRow.site_id,
    type: "OUT",
    server_time: outTime.toISOString(),

    note_work: reqRow.note_work ?? null,
    km: reqRow.km ?? null,
    material_desc: reqRow.material_desc ?? null,
    material_amount: reqRow.material_amount ?? null,

    is_paid: false,
  });

  if (outIns.error) return json({ error: "Nešlo uzavřít směnu (OUT insert)." }, { status: 500 });

  const upd = await db
    .from("attendance_close_requests")
    .update({
      status: "approved",
      decided_at: new Date().toISOString(),
      decided_by: adminId,
    })
    .eq("id", id);

  if (upd.error) return json({ error: "Nešlo označit žádost jako schválenou." }, { status: 500 });

  return json({ ok: true, out_time: outTime.toISOString() });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });
  if ((session as any).role !== "admin") return json({ error: "Unauthorized" }, { status: 401 });

  const adminId = (session as any).userId as string;
  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const upd = await db
    .from("attendance_close_requests")
    .update({
      status: "rejected",
      decided_at: new Date().toISOString(),
      decided_by: adminId,
    })
    .eq("id", id)
    .eq("status", "pending");

  if (upd.error) return json({ error: "Nešlo zamítnout žádost." }, { status: 500 });

  return json({ ok: true });
}
