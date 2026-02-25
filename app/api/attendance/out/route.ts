import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { attendanceOutSchema } from "@/lib/validators";
import { dayLocalCZNow } from "@/lib/time";

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const parsed = attendanceOutSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const { site_id, lat, lng, accuracy_m, note_work, km, material_desc, material_amount } = parsed.data;

  const db = supabaseAdmin();

  // Najdi poslední IN
  const { data: lastIn, error: inErr } = await db
    .from("attendance_events")
    .select("id,site_id,server_time")
    .eq("user_id", session.userId)
    .eq("type", "IN")
    .order("server_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (inErr) return json({ error: "DB chyba." }, { status: 500 });
  if (!lastIn) return json({ error: "Nebyl začátek směny (chybí PŘÍCHOD)." }, { status: 400 });

  // Je už po něm OUT?
  const { data: outAfter } = await db
    .from("attendance_events")
    .select("id")
    .eq("user_id", session.userId)
    .eq("type", "OUT")
    .gt("server_time", lastIn.server_time)
    .order("server_time", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (outAfter) return json({ error: "Směna je už ukončená." }, { status: 400 });

  const useSiteId = site_id || lastIn.site_id;
  if (!useSiteId) return json({ error: "Chybí stavba." }, { status: 400 });

  // načti stavbu a zkontroluj radius
  const { data: site, error: siteErr } = await db
    .from("sites")
    .select("id,lat,lng,radius_m,is_pending")
    .eq("id", useSiteId)
    .single();

  if (siteErr || !site) return json({ error: "Stavba nenalezena." }, { status: 404 });
  if ((site as any).is_pending) return json({ error: "Dočasná stavba není aktivní (musí ji schválit admin)." }, { status: 403 });

  const distance_m = Math.round(haversineMeters({ lat, lng }, { lat: Number(site.lat), lng: Number(site.lng) }));
  const radius_m = Number((site as any).radius_m || 0);

  if (radius_m > 0 && distance_m > radius_m) {
    return json({ error: `Jsi mimo radius stavby (${distance_m} m > ${radius_m} m).` }, { status: 403 });
  }

  const nowIso = new Date().toISOString();

  const { error } = await db.from("attendance_events").insert({
    user_id: session.userId,
    site_id: useSiteId,
    type: "OUT",
    server_time: nowIso,
    day_local: dayLocalCZNow(),
    lat,
    lng,
    accuracy_m,
    distance_m,
    note_work,
    km,
    material_desc,
    material_amount,
  });

  if (error) return json({ error: "Nešlo uložit odchod." }, { status: 500 });

  return json({ ok: true, distance_m });
}
