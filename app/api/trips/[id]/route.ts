import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId || (session as any).user_id || (session as any).id;

  // role se může lišit podle toho, jak to máš v JWT → když tam není, vytáhneme z DB
  let role: "admin" | "worker" | null =
    (session as any).role || (session as any).userRole || null;

  const { id } = await ctx.params;

  const db = supabaseAdmin();

  if (!role) {
    const me = await db.from("users").select("role").eq("id", String(userId)).maybeSingle();
    role = (me.data?.role as any) || "worker";
  }

  const found = await db.from("trips").select("id,user_id").eq("id", id).maybeSingle();
  if (found.error || !found.data) return json({ error: "Záznam nenalezen." }, { status: 404 });

  if (role !== "admin" && String(found.data.user_id) !== String(userId)) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const del = await db.from("trips").delete().eq("id", id);
  if (del.error) return json({ error: "Nešlo smazat jízdu." }, { status: 500 });

  return json({ ok: true });
}
