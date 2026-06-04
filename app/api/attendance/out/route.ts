import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { dayLocalCZFromIso, parseReportedLeftAtCZ } from "@/lib/time";
import { findLockForDay } from "@/lib/payroll-locks";
import { approvedDayEditMessage, findApprovedDayReview } from "@/lib/day-reviews";
import { getLatestOpenShift } from "@/lib/open-shift";

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const allowWithoutLocation = !!body?.allow_without_location;
  const reportedLeftAt = (body?.reported_left_at ?? "").toString().trim();
  const noteWork = (body?.note_work ?? "").toString().trim() || null;
  const materialDesc = (body?.material_desc ?? "").toString().trim() || null;
  const programmingNote = (body?.programming_note ?? "").toString().trim() || null;

  const km = body?.km != null ? Number(body.km) : null;
  const materialAmount = body?.material_amount != null ? Number(body.material_amount) : null;
  const programmingHours = body?.programming_hours != null ? Number(body.programming_hours) : null;

  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const accuracyM = body?.accuracy_m != null ? Number(body.accuracy_m) : null;
  const hasLocation = Number.isFinite(lat) && Number.isFinite(lng);

  if (!hasLocation && !allowWithoutLocation) {
    return json({ error: "Chybí poloha." }, { status: 400 });
  }
  if (allowWithoutLocation && !reportedLeftAt) {
    return json({ error: "Zadejte čas odchodu bez polohy." }, { status: 400 });
  }
  if (km != null && (!Number.isFinite(km) || km < 0)) {
    return json({ error: "Kilometry nejsou platné." }, { status: 400 });
  }
  if (materialAmount != null && (!Number.isFinite(materialAmount) || materialAmount < 0)) {
    return json({ error: "Částka materiálu není platná." }, { status: 400 });
  }
  if ((materialAmount || 0) > 0 && !materialDesc) {
    return json({ error: "K materiálu doplňte stručný popis." }, { status: 400 });
  }
  if (programmingHours != null && (!Number.isFinite(programmingHours) || programmingHours < 0 || programmingHours > 24)) {
    return json({ error: "Hodiny programování nejsou platné." }, { status: 400 });
  }

  const db = supabaseAdmin();

  const { data: me, error: meErr } = await db
    .from("users")
    .select("id,is_programmer")
    .eq("id", session.userId)
    .maybeSingle();
  if (meErr) return json({ error: "DB chyba (uživatel)." }, { status: 500 });

  const canProg = (me as { is_programmer?: boolean } | null)?.is_programmer === true;
  if (!canProg && (programmingHours != null || programmingNote)) {
    return json({ error: "Programování smí zadávat jen programátor." }, { status: 403 });
  }

  let openShift: { server_time: string; site_id: string | null; day_local: string | null } | null = null;
  try {
    openShift = await getLatestOpenShift(db, session.userId);
  } catch (error: unknown) {
    return json({ error: error instanceof Error ? error.message : "DB chyba." }, { status: 500 });
  }
  if (!openShift) {
    return json({ error: "Nemáte otevřenou směnu. Nejdřív je potřeba zadat příchod." }, { status: 409 });
  }

  const siteId = body?.site_id ? String(body.site_id) : openShift.site_id || null;
  if (!siteId) return json({ error: "Chybí stavba." }, { status: 400 });

  let outInstant = new Date();
  if (allowWithoutLocation && reportedLeftAt) {
    const parsed = parseReportedLeftAtCZ(reportedLeftAt, String(openShift.server_time));
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return json({ error: "Neplatný ručně zadaný čas odchodu." }, { status: 400 });
    }

    const inTime = new Date(String(openShift.server_time));
    if (parsed.getTime() < inTime.getTime()) {
      return json({ error: "Odchod nemůže být dřív než příchod." }, { status: 400 });
    }
    outInstant = parsed;
  }

  const outIso = outInstant.toISOString();
  const dayLocal = dayLocalCZFromIso(outIso);
  const approvedReview = await findApprovedDayReview(db, {
    userId: session.userId,
    day: dayLocal,
    siteId,
  });
  if (approvedReview) {
    return json({ error: approvedDayEditMessage(dayLocal) }, { status: 409 });
  }

  const locked = await findLockForDay(dayLocal);
  if (locked) {
    return json(
      { error: `Den ${dayLocal} je v uzamčeném výplatním období ${locked.from_day} – ${locked.to_day}.` },
      { status: 409 }
    );
  }

  const { data: site, error: siteErr } = await db
    .from("sites")
    .select("id,lat,lng,radius_m")
    .eq("id", siteId)
    .single();
  if (siteErr || !site) return json({ error: "Stavba nenalezena." }, { status: 404 });

  let distanceM: number | null = null;
  const radiusM = Number(site.radius_m || 0);
  if (hasLocation) {
    distanceM = Math.round(haversineMeters({ lat, lng }, { lat: Number(site.lat), lng: Number(site.lng) }));
    if (radiusM > 0 && distanceM > radiusM && !allowWithoutLocation) {
      return json({ error: `Jste mimo radius stavby (${distanceM} m > ${radiusM} m).` }, { status: 403 });
    }
  }

  const { error } = await db.from("attendance_events").insert({
    user_id: session.userId,
    site_id: siteId,
    type: "OUT",
    server_time: outIso,
    day_local: dayLocal,
    lat: hasLocation ? lat : null,
    lng: hasLocation ? lng : null,
    accuracy_m: accuracyM,
    distance_m: distanceM,
    note_work: noteWork,
    km,
    material_desc: materialDesc,
    material_amount: materialAmount,
    programming_hours: canProg ? programmingHours : null,
    programming_note: canProg ? programmingNote : null,
  });

  if (error) return json({ error: `Nešlo uložit odchod: ${error.message}` }, { status: 500 });

  return json({ ok: true, distance_m: distanceM, allow_without_location: allowWithoutLocation, server_time: outIso, day_local: dayLocal });
}
