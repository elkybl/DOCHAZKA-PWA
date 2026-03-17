import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { dayLocalCZNow } from "@/lib/time";

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

const session = await getServerSession(authOptions);
if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

const body = await req.json();

const site_id = body?.site_id as string | undefined;
const allow_without_location = !!body?.allow_without_location;
const lat = Number(body?.lat);
const lng = Number(body?.lng);
const accuracy_m = body?.accuracy_m != null ? Number(body.accuracy_m) : null;

  const note_work_raw = (body?.note_work ?? "").toString().trim();
  const note_work = note_work_raw || null;
  const km = body?.km != null ? Number(body.km) : null;

  const material_desc = (body?.material_desc ?? "").toString().trim() || null;
  const material_amount = body?.material_amount != null ? Number(body.material_amount) : null;

  const programming_hours = body?.programming_hours != null ? Number(body.programming_hours) : null;
  const programming_note = (body?.programming_note ?? "").toString().trim() || null;

  if (!site_id) return json({ error: "Chybí stavba." }, { status: 400 });
  if (programming_hours != null && (!Number.isFinite(programming_hours) || programming_hours < 0 || programming_hours > 24)) {
    return json({ error: "Neplatné hodiny programování." }, { status: 400 });
  }
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);
  if (!hasLocation && !allow_without_location) return json({ error: "Chybí poloha." }, { status: 400 });
  if (km != null && (!Number.isFinite(km) || km < 0)) return json({ error: "Km je neplatné." }, { status: 400 });
  if (material_amount != null && (!Number.isFinite(material_amount) || material_amount < 0))
    return json({ error: "Materiál částka je neplatná." }, { status: 400 });

  const db = supabaseAdmin();

  // zjišťujeme, jestli je uživatel programátor (aby si nemohl každý posílat programming_hours)
  const { data: me, error: meErr } = await db
    .from("users")
    .select("id,is_programmer")
    .eq("id", session.userId)
    .maybeSingle();
  if (meErr) return json({ error: "DB chyba (me)." }, { status: 500 });
  const canProg = (me as any)?.is_programmer === true;
  if (!canProg && (programming_hours != null || programming_note)) {
    return json({ error: "Programování smí zadávat jen programátor." }, { status: 403 });
  }

  // ✅ pojistka: nejde OUT bez IN
  const { data: last, error: lastErr } = await db
    .from("attendance_events")
    .select("type,server_time,site_id")
    .eq("user_id", session.userId)
    .order("server_time", { ascending: false })
    .limit(1);

  if (lastErr) return json({ error: "DB chyba." }, { status: 500 });
  if (!last || !last[0] || last[0].type !== "IN") {
    return json({ error: "Nemáš otevřenou směnu (chybí příchod). Nejdřív dej PŘÍCHOD." }, { status: 409 });
  }

  // site
  const { data: site, error: sErr } = await db
    .from("sites")
    .select("id,lat,lng,radius_m")
    .eq("id", site_id)
    .single();

  if (sErr || !site) return json({ error: "Stavba nenalezena." }, { status: 404 });

  let distance_m: number | null = null;
  const radius_m = Number(site.radius_m || 0);

  if (hasLocation) {
    distance_m = Math.round(haversineMeters({ lat, lng }, { lat: Number(site.lat), lng: Number(site.lng) }));
    if (radius_m > 0 && distance_m > radius_m && !allow_without_location) {
      return json(
        { error: `Jsi mimo radius stavby (${distance_m} m > ${radius_m} m).` },
        { status: 403 }
      );
    }
  }

  const nowIso = new Date().toISOString();

  const { error } = await db.from("attendance_events").insert({
    user_id: session.userId,
    site_id,
    type: "OUT",
    server_time: nowIso,
    day_local: dayLocalCZNow(),

    lat: hasLocation ? lat : null,
    lng: hasLocation ? lng : null,
    accuracy_m,
    distance_m,

    note_work,
    km,
    material_desc,
    material_amount,

    programming_hours: canProg ? programming_hours : null,
    programming_note: canProg ? programming_note : null,
  });

  if (error) return json({ error: `Nešlo uložit odchod: ${error.message}` }, { status: 500 });

  return json({ ok: true, distance_m });
}
