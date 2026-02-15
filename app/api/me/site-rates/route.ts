import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { z } from "zod";

const patchSchema = z.object({
  site_id: z.string().uuid(),
  hourly_rate: z.number().min(0).max(5000),
  km_rate: z.number().min(0).max(1000),
});

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from("user_site_rates")
    .select("site_id,hourly_rate,km_rate,updated_at")
    .eq("user_id", session.userId);

  if (error) return json({ error: "DB chyba." }, { status: 500 });
  return json({ rates: data || [] });
}

export async function PATCH(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from("user_site_rates").upsert({
    user_id: session.userId,
    site_id: parsed.data.site_id,
    hourly_rate: parsed.data.hourly_rate,
    km_rate: parsed.data.km_rate,
  });

  if (error) return json({ error: "Nešlo uložit." }, { status: 500 });
  return json({ ok: true });
}
