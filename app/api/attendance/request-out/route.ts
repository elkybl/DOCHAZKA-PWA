import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { toDate } from "@/lib/time";

const schema = z.object({
  reported_left_at: z.string().min(2).max(50), // "16:50" nebo "12.2. 16:50"
  forget_reason: z.string().min(3).max(500),
  note_work: z.string().min(3).max(2000),

  km: z.number().min(0).max(2000).optional(),
  material_desc: z.string().max(500).optional(),
  material_amount: z.number().min(0).max(200000).optional(),
});

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId as string;
  const db = supabaseAdmin();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data žádosti." }, { status: 400 });

  // otevřená směna?
  const { data: lastIn } = await db
    .from("attendance_events")
    .select("site_id,server_time")
    .eq("user_id", userId)
    .eq("type", "IN")
    .order("server_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: lastOut } = await db
    .from("attendance_events")
    .select("server_time")
    .eq("user_id", userId)
    .eq("type", "OUT")
    .order("server_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  const inTime = lastIn?.server_time ? toDate(lastIn.server_time).getTime() : 0;
  const outTime = lastOut?.server_time ? toDate(lastOut.server_time).getTime() : 0;

  if (!lastIn || !(inTime > outTime)) {
    return json({ error: "Nemáš otevřenou směnu (není co uzavírat)." }, { status: 400 });
  }

  // už existuje pending žádost?
  const { data: existing } = await db
    .from("attendance_close_requests")
    .select("id,status")
    .eq("user_id", userId)
    .eq("status", "pending")
    .order("requested_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    return json({ error: "Už máš odeslanou žádost (čeká na schválení adminem)." }, { status: 400 });
  }

  const p = parsed.data;

  const ins = await db.from("attendance_close_requests").insert({
    user_id: userId,
    site_id: lastIn.site_id ?? null,
    in_time: lastIn.server_time,

    reported_left_at: p.reported_left_at,
    forget_reason: p.forget_reason,
    note_work: p.note_work,
    km: p.km ?? null,
    material_desc: p.material_desc ?? null,
    material_amount: p.material_amount ?? null,
  });

  if (ins.error) return json({ error: "Nešlo odeslat žádost." }, { status: 500 });

  return json({ ok: true });
}
