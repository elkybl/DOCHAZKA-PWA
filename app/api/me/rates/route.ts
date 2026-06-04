import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { loadEffectiveRateEngine, normalizeEffectiveFrom, syncCurrentRateTables } from "@/lib/effective-rates";

const rateNum = z.number().min(0).max(200000);

const saveSchema = z.object({
  user_id: z.string().uuid().optional(),
  effective_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  programming_rate: rateNum.nullable().optional(),
  default_hourly_rate: rateNum.nullable().optional(),
  default_km_rate: rateNum.nullable().optional(),
  rows: z
    .array(
      z.object({
        site_id: z.string().min(1),
        hourly_rate: rateNum.nullable().optional(),
        km_rate: rateNum.nullable().optional(),
        programming_rate: rateNum.nullable().optional(),
      })
    )
    .default([]),
});

function toNullOrNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return num;
}

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const url = new URL(req.url);
  const requestedUserId = url.searchParams.get("user_id")?.trim() || "";
  const targetUserId = session.role === "admin" && requestedUserId ? requestedUserId : session.userId;
  const effectiveFrom = normalizeEffectiveFrom(url.searchParams.get("effective_from"));

  const db = supabaseAdmin();
  const engine = await loadEffectiveRateEngine(db, { userIds: [targetUserId] });
  const targetUser = engine.userById.get(targetUserId);
  if (!targetUser) return json({ error: "Uživatel nenalezen." }, { status: 404 });

  const defaultSnapshot = engine.getDefaultSnapshot(targetUserId, effectiveFrom);
  const siteRows = engine
    .listSiteIds(targetUserId)
    .map((siteId) => {
      const row = engine.getSiteOverrideSnapshot(targetUserId, siteId, effectiveFrom);
      if (!row) return null;
      return {
        site_id: siteId,
        hourly_rate: row.hourly_rate,
        km_rate: row.km_rate,
        programming_rate: row.programming_rate,
        effective_from: row.effective_from,
      };
    })
    .filter(Boolean);

  return json({
    can_edit: session.role === "admin",
    user_id: targetUserId,
    target_user_name: targetUser.name || "",
    effective_from: effectiveFrom,
    default_hourly_rate: defaultSnapshot.hourly_rate ?? null,
    default_km_rate: defaultSnapshot.km_rate ?? null,
    is_programmer: !!targetUser.is_programmer,
    programming_rate: defaultSnapshot.programming_rate ?? null,
    rows: siteRows,
  });
}

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });
  if (session.role !== "admin") return json({ error: "Sazby spravuje administrace." }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Neplatná data sazeb." }, { status: 400 });
  }

  const payload = parsed.data;
  const targetUserId = payload.user_id || session.userId;
  const effectiveFrom = normalizeEffectiveFrom(payload.effective_from);
  const db = supabaseAdmin();

  const [userRes, siteRes] = await Promise.all([
    db.from("users").select("id").eq("id", targetUserId).maybeSingle(),
    db.from("sites").select("id"),
  ]);
  if (userRes.error) return json({ error: "DB chyba (users)." }, { status: 500 });
  if (!userRes.data) return json({ error: "Uživatel nenalezen." }, { status: 404 });
  if (siteRes.error) return json({ error: "DB chyba (sites)." }, { status: 500 });

  const validSiteIds = new Set(((siteRes.data || []) as Array<{ id: string }>).map((site) => String(site.id)));
  for (const row of payload.rows || []) {
    if (!validSiteIds.has(String(row.site_id))) {
      return json({ error: "Jedna ze staveb pro sazbu už neexistuje." }, { status: 400 });
    }
  }

  const defaultInsert = await db.from("user_rate_history").upsert(
    {
      user_id: targetUserId,
      effective_from: effectiveFrom,
      hourly_rate: toNullOrNumber(payload.default_hourly_rate),
      km_rate: toNullOrNumber(payload.default_km_rate),
      programming_rate: toNullOrNumber(payload.programming_rate),
      created_by: session.userId,
    },
    { onConflict: "user_id,effective_from" }
  );
  if (defaultInsert.error) {
    return json({ error: `Nešlo uložit výchozí sazby: ${defaultInsert.error.message}` }, { status: 500 });
  }

  const siteRows = (payload.rows || []).map((row) => ({
    user_id: targetUserId,
    site_id: row.site_id,
    effective_from: effectiveFrom,
    hourly_rate: toNullOrNumber(row.hourly_rate),
    km_rate: toNullOrNumber(row.km_rate),
    programming_rate: toNullOrNumber(row.programming_rate),
    created_by: session.userId,
  }));

  if (siteRows.length) {
    const siteInsert = await db.from("user_site_rate_history").upsert(siteRows, { onConflict: "user_id,site_id,effective_from" });
    if (siteInsert.error) {
      return json({ error: `Nešlo uložit sazby pro stavby: ${siteInsert.error.message}` }, { status: 500 });
    }
  }

  try {
    await syncCurrentRateTables(db, targetUserId);
  } catch (error) {
    return json({ error: `Historie sazeb je uložená, ale nepodařilo se přepočítat aktuální sazby: ${String((error as { message?: string })?.message || error)}` }, { status: 500 });
  }

  return json({ ok: true });
}
