import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { dayLocalCZNow } from "@/lib/time";
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

  const body = await req.json().catch(() => null);
  const site_id = body?.site_id ? String(body.site_id) : "";
  const lat = Number(body?.lat);
  const lng = Number(body?.lng);
  const accuracy_m = body?.accuracy_m != null ? Number(body.accuracy_m) : null;

  if (!site_id) return json({ error: "Chybí stavba." }, { status: 400 });
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return json({ error: "Chybí poloha." }, { status: 400 });

  const today = dayLocalCZNow();
  const locked = await findLockForDay(today);
  if (locked) {
    return json(
      { error: `Dnešek ${today} je v uzamčeném výplatním období ${locked.from_day} – ${locked.to_day}.` },
      { status: 409 }
    );
  }

  const db = supabaseAdmin();
  const approvedReview = await findApprovedDayReview(db, {
    userId: session.userId,
    day: today,
    siteId: site_id,
  });
  if (approvedReview) {
    return json({ error: approvedDayEditMessage(today) }, { status: 409 });
  }

  let openShift: { server_time: string; site_id: string | null; day_local: string | null } | null = null;
  try {
    openShift = await getLatestOpenShift(db, session.userId);
  } catch (error: unknown) {
    return json({ error: error instanceof Error ? error.message : "DB chyba." }, { status: 500 });
  }
  if (openShift) {
    return json({ error: "Už máte otevřený příchod. Nejdřív ukončete aktivní den." }, { status: 409 });
  }

  const { data: site, error: sErr } = await db.from("sites").select("id,lat,lng,radius_m").eq("id", site_id).single();
  if (sErr || !site) return json({ error: "Stavba nenalezena." }, { status: 404 });

  const distance_m = Math.round(
    haversineMeters({ lat, lng }, { lat: Number((site as { lat: number }).lat), lng: Number((site as { lng: number }).lng) })
  );
  const radius_m = Number((site as { radius_m?: number | null }).radius_m || 0);
  if (radius_m > 0 && distance_m > radius_m) {
    return json({ error: `Jste mimo radius stavby (${distance_m} m > ${radius_m} m).` }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const { error } = await db.from("attendance_events").insert({
    user_id: session.userId,
    site_id,
    type: "IN",
    server_time: nowIso,
    day_local: today,
    lat,
    lng,
    accuracy_m,
    distance_m,
  });

  if (error) return json({ error: `Nešlo uložit příchod: ${error.message}` }, { status: 500 });
  return json({ ok: true, distance_m, server_time: nowIso });
}
