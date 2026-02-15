import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

const editSchema = z.object({
  id: z.string().min(1),
  purpose: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  site_id: z.string().max(80).optional().nullable(),
  distance_km_user: z.number().min(0).max(9999).optional().nullable(),
});

export async function PATCH(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId || (session as any).user_id || (session as any).id;

  const body = await req.json().catch(() => ({}));
  const parsed = editSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();

  // ověř, že trip patří userovi
  const { data: existing, error: exErr } = await db
    .from("trips")
    .select("id,user_id,end_time")
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (exErr || !existing) return json({ error: "Záznam nenalezen." }, { status: 404 });
  if (String(existing.user_id) !== String(userId)) return json({ error: "Unauthorized" }, { status: 401 });
  if (!existing.end_time) return json({ error: "Otevřená jízda nejde upravit. Nejdřív dej Stop." }, { status: 409 });

  const patch: any = {};
  if (parsed.data.purpose !== undefined) patch.purpose = parsed.data.purpose?.trim() || null;
  if (parsed.data.note !== undefined) patch.note = parsed.data.note?.trim() || null;
  if (parsed.data.site_id !== undefined) patch.site_id = parsed.data.site_id || null;

  if (parsed.data.distance_km_user !== undefined) {
    patch.distance_km_user = parsed.data.distance_km_user;
    patch.distance_method = parsed.data.distance_km_user == null ? (patch.distance_method || undefined) : "manual";
  }

  const upd = await db.from("trips").update(patch).eq("id", parsed.data.id).select("id").single();
  if (upd.error) return json({ error: "Nešlo uložit úpravu." }, { status: 500 });

  return json({ ok: true });
}
