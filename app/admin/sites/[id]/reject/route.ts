import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

// Bezpečný prefix do textů
function prefix(siteName: string) {
  const safe = (siteName || "").trim().slice(0, 120);
  return `[ZAMÍTNUTÁ DOČASNÁ AKCE: ${safe || "bez názvu"}] `;
}

async function isAdmin(session: any) {
  const db = supabaseAdmin();

  const userId = session?.userId ?? session?.user_id ?? session?.id;
  if (!userId) return false;

  // Pokud už je role v tokenu, použij ji
  const role = session?.role ?? session?.userRole ?? null;
  if (role === "admin") return true;

  // Jinak ověř z DB
  const me = await db.from("users").select("role").eq("id", String(userId)).maybeSingle();
  return me.data?.role === "admin";
}

// Robustní update stavby – zkusí různé sloupce (podle toho, co máš v DB)
async function archivePendingSite(siteId: string) {
  const db = supabaseAdmin();
  const nowIso = new Date().toISOString();

  // 1) Nejčastější: is_pending + is_archived
  {
    const r = await db
      .from("sites")
      .update({ is_pending: false, is_archived: true, archived_at: nowIso } as any)
      .eq("id", siteId);

    if (!r.error) return { ok: true };
  }

  // 2) is_pending + archived_at
  {
    const r = await db
      .from("sites")
      .update({ is_pending: false, archived_at: nowIso } as any)
      .eq("id", siteId);

    if (!r.error) return { ok: true };
  }

  // 3) jen is_pending
  {
    const r = await db.from("sites").update({ is_pending: false } as any).eq("id", siteId);
    if (!r.error) return { ok: true };
  }

  // 4) poslední nouzovka: přejmenuj, aby to bylo jasné (když nic jiného nejde)
  const r4 = await db.from("sites").update({ name: `ARCHIV: ${nowIso.slice(0, 10)} #${siteId}` } as any).eq("id", siteId);
  if (r4.error) return { ok: false, error: "Nešlo archivovat stavbu (neznámé sloupce v DB)." };

  return { ok: true };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const admin = await isAdmin(session);
  if (!admin) return json({ error: "Unauthorized" }, { status: 401 });

  const { id: siteId } = await ctx.params;

  const db = supabaseAdmin();

  // Najdi stavbu
  const siteRes = await db.from("sites").select("id,name,is_pending").eq("id", siteId).maybeSingle();
  if (siteRes.error || !siteRes.data) return json({ error: "Stavba nenalezena." }, { status: 404 });

  const site = siteRes.data as any;

  // (volitelné) když to není pending, klidně to dovolíme také, ale hlavně je to určené pro pending
  const pfx = prefix(site.name);

  // 1) Archivuj / zamítni stavbu (podle toho, jaké máš sloupce)
  const arch = await archivePendingSite(siteId);
  if (!arch.ok) return json({ error: arch.error || "Nešlo zamítnout/archivovat stavbu." }, { status: 500 });

  // 2) Najdi všechny docházkové záznamy s site_id = siteId
  // očekáváme attendance_events: id, type, note_work, offsite_reason, site_id
  const evRes = await db
    .from("attendance_events")
    .select("id,type,note_work,offsite_reason,site_id")
    .eq("site_id", siteId);

  if (evRes.error) {
    // Když se nepodaří select, aspoň nastav site_id = null hromadně
    await db.from("attendance_events").update({ site_id: null } as any).eq("site_id", siteId);
    return json({
      ok: true,
      moved: "bulk_only",
      message: "Stavba zamítnuta. Záznamy přesunuty do Nezařazeno (bez doplnění textu).",
    });
  }

  const rows: any[] = evRes.data || [];

  // 3) Přesuň záznamy do Nezařazeno a doplň prefix do textů (bezpečně po jednom)
  let moved = 0;
  let failed = 0;

  for (const r of rows) {
    const patch: any = { site_id: null };

    // doplnění textu podle typu
    if (r.type === "OUT") {
      // note_work obvykle existuje
      if (typeof r.note_work === "string") patch.note_work = pfx + r.note_work;
      else patch.note_work = pfx + "";
    } else if (r.type === "OFFSITE") {
      // offsite_reason obvykle existuje
      if (typeof r.offsite_reason === "string") patch.offsite_reason = pfx + r.offsite_reason;
      else patch.offsite_reason = pfx + "";
    }

    const up = await db.from("attendance_events").update(patch).eq("id", r.id);
    if (up.error) {
      // fallback – aspoň site_id null
      const up2 = await db.from("attendance_events").update({ site_id: null } as any).eq("id", r.id);
      if (up2.error) failed++;
      else moved++;
    } else {
      moved++;
    }
  }

  return json({
    ok: true,
    site_id: siteId,
    site_name: site.name,
    affected: rows.length,
    moved,
    failed,
    message:
      failed > 0
        ? "Stavba zamítnuta. Většina záznamů přesunuta do Nezařazeno, pár se nepodařilo upravit (zkontroluj DB sloupce)."
        : "Stavba zamítnuta. Záznamy přesunuty do Nezařazeno a označené v textu.",
  });
}
