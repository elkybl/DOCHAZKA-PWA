import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

const schema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(180).optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  radius_m: z.number().min(50).max(2000).optional(), // default 200
});

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId as string;
  const db = supabaseAdmin();

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const p = parsed.data;

  const { data, error } = await db
    .from("sites")
    .insert({
      name: p.name,
      address: p.address ?? null,
      lat: p.lat,
      lng: p.lng,
      radius_m: p.radius_m ?? 200,
      is_pending: true,
      created_by: userId,
    })
    .select("id,name,lat,lng,radius_m,is_pending")
    .single();

  if (error || !data) return json({ error: "Nešlo vytvořit dočasnou stavbu." }, { status: 500 });

  return json({ site: data });
}
