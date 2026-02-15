import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { z } from "zod";

const patchSchema = z.object({
  radius_m: z.number().min(50).max(2000).optional(),
  name: z.string().min(2).max(120).optional(),
  address: z.string().max(180).optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });
  if ((session as any).role !== "admin") return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = supabaseAdmin();

  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const parsed = patchSchema.safeParse(body || {});
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const patch: any = { is_pending: false };
  if (parsed.data.radius_m != null) patch.radius_m = parsed.data.radius_m;
  if (parsed.data.name) patch.name = parsed.data.name;
  if (parsed.data.address) patch.address = parsed.data.address;
  if (parsed.data.lat != null) patch.lat = parsed.data.lat;
  if (parsed.data.lng != null) patch.lng = parsed.data.lng;

  const upd = await db
    .from("sites")
    .update(patch)
    .eq("id", id)
    .eq("is_pending", true)
    .eq("is_archived", false);

  if (upd.error) return json({ error: "Nešlo aktivovat stavbu." }, { status: 500 });

  return json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // místo tvrdého delete -> archivace
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });
  if ((session as any).role !== "admin") return json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await ctx.params;
  const db = supabaseAdmin();

  const upd = await db
    .from("sites")
    .update({ is_archived: true })
    .eq("id", id)
    .eq("is_pending", true);

  if (upd.error) return json({ error: "Nešlo archivovat dočasnou stavbu." }, { status: 500 });

  return json({ ok: true });
}
