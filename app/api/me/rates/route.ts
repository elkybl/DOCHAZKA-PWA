import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

const rateNum = z.number().min(0).max(200000);

const saveSchema = z.object({
  default_hourly_rate: rateNum.nullable().optional(),
  default_km_rate: rateNum.nullable().optional(),
  rows: z
    .array(
      z.object({
        site_id: z.string().min(1),
        hourly_rate: rateNum.nullable().optional(),
        km_rate: rateNum.nullable().optional(),
      })
    )
    .default([]),
});

function toNullOrNumber(v: any) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return n;
}

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId as string;
  const db = supabaseAdmin();

  const { data: me, error: meErr } = await db
    .from("users")
    .select("id,hourly_rate,km_rate")
    .eq("id", userId)
    .single();

  if (meErr || !me) return json({ error: "Uživatel nenalezen." }, { status: 404 });

  const { data: rows, error: rErr } = await db
    .from("user_site_rates")
    .select("site_id,hourly_rate,km_rate")
    .eq("user_id", userId)
    .order("site_id", { ascending: true });

  if (rErr) return json({ error: "DB chyba (user_site_rates)." }, { status: 500 });

  return json({
    default_hourly_rate: (me as any).hourly_rate ?? null,
    default_km_rate: (me as any).km_rate ?? null,
    rows: (rows || []).map((r: any) => ({
      site_id: r.site_id,
      hourly_rate: r.hourly_rate ?? null,
      km_rate: r.km_rate ?? null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId as string;
  const db = supabaseAdmin();

  const body = await req.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Neplatná data sazeb." }, { status: 400 });
  }

  const payload = parsed.data;
  const defHourly = toNullOrNumber(payload.default_hourly_rate);
  const defKm = toNullOrNumber(payload.default_km_rate);

  // 1) uložit default sazby do users
  const upd = await db
    .from("users")
    .update({
      hourly_rate: defHourly,
      km_rate: defKm,
    })
    .eq("id", userId);

  if (upd.error) return json({ error: `Nešlo uložit default sazby: ${upd.error.message}` }, { status: 500 });

  // 2) uložit sazby pro stavby (upsert)
  const rowsToUpsert = (payload.rows || []).map((r) => ({
    user_id: userId,
    site_id: r.site_id,
    hourly_rate: toNullOrNumber(r.hourly_rate),
    km_rate: toNullOrNumber(r.km_rate),
  }));

  // nechceme ukládat úplně prázdné řádky (obě null) – místo toho je smažeme
  const toKeep = rowsToUpsert.filter((r) => r.hourly_rate !== null || r.km_rate !== null);
  const toDeleteSiteIds = rowsToUpsert
    .filter((r) => r.hourly_rate === null && r.km_rate === null)
    .map((r) => r.site_id);

  if (toKeep.length) {
    const up = await db
      .from("user_site_rates")
      .upsert(toKeep, { onConflict: "user_id,site_id" });

    if (up.error) return json({ error: `Nešlo uložit sazby pro stavby: ${up.error.message}` }, { status: 500 });
  }

  if (toDeleteSiteIds.length) {
    const del = await db
      .from("user_site_rates")
      .delete()
      .eq("user_id", userId)
      .in("site_id", toDeleteSiteIds);

    if (del.error) return json({ error: `Nešlo vyčistit prázdné sazby: ${del.error.message}` }, { status: 500 });
  }

  return json({ ok: true });
}
