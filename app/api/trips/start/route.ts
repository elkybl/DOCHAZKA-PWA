import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

const startSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  purpose: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  site_id: z.string().max(80).optional(),
});

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId || (session as any).user_id || (session as any).id;

  const body = await req.json().catch(() => ({}));
  const parsed = startSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();

  // pokud už má otevřenou jízdu, neuděláme druhou
  const { data: open } = await db
    .from("trips")
    .select("id")
    .eq("user_id", String(userId))
    .is("end_time", null)
    .limit(1);

  if ((open || []).length > 0) {
    return json({ error: "Už máš otevřenou jízdu. Nejdřív dej Stop." }, { status: 409 });
  }

  const ins = await db.from("trips").insert({
    user_id: String(userId),
    site_id: parsed.data.site_id || null,
    purpose: parsed.data.purpose?.trim() || null,
    note: parsed.data.note?.trim() || null,
    start_lat: parsed.data.lat,
    start_lng: parsed.data.lng,
  }).select("id,start_time").single();

  if (ins.error || !ins.data) return json({ error: "Nešlo uložit start jízdy." }, { status: 500 });

  return json({ ok: true, trip: ins.data });
}
