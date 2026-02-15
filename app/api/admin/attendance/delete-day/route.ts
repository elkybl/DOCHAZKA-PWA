import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

const schema = z.object({
  user_id: z.string().min(1),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), // YYYY-MM-DD
});

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const { user_id, day } = parsed.data;
  const db = supabaseAdmin();

  // 1) primárně mažeme přes day_local (nejčistší)
  const del1 = await db.from("attendance_events").delete().eq("user_id", user_id).eq("day_local", day);

  // 2) fallback: když starší záznamy nemají day_local (nebo je null),
  // smažeme i podle server_time v rozmezí dne (UTC).
  // Pro jednoduchost bereme den jako 00:00 - 23:59 UTC.
  const from = `${day}T00:00:00.000Z`;
  const to = `${day}T23:59:59.999Z`;

  const del2 = await db
    .from("attendance_events")
    .delete()
    .eq("user_id", user_id)
    .gte("server_time", from)
    .lte("server_time", to);

  // pokud oboje selže, vrať chybu
  if (del1.error && del2.error) {
    return json({ error: `Nešlo smazat. ${del1.error.message || del2.error.message}` }, { status: 500 });
  }

  return json({
    ok: true,
    deleted_hint: "Smazáno (přes day_local + fallback přes server_time).",
  });
}
