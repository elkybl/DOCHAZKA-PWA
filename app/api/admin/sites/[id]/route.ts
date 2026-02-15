import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

function extractIdFromPath(req: NextRequest) {
  const parts = req.nextUrl.pathname.split("/").filter(Boolean);
  return parts[parts.length - 1] || "";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

// ✅ Next 16: params je Promise
export async function DELETE(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const p = await context.params;
  let id = p?.id;

  if (!id) id = extractIdFromPath(req);

  if (!id || !isUuid(id)) {
    return json({ error: `Chybí/špatné ID stavby. URL: ${req.nextUrl.pathname}` }, { status: 400 });
  }

  const db = supabaseAdmin();

  // Pozor: pokud má stavba navázané attendance_events (site_id restrict), smazání může selhat.
  const { error } = await db.from("sites").delete().eq("id", id);

  if (error) {
    console.error("DELETE site error:", error);
    return json(
      { error: `Nejde smazat stavbu: ${error.message}. Pokud má navázané záznamy, radši ji deaktivuj.` },
      { status: 409 }
    );
  }

  return json({ ok: true });
}
