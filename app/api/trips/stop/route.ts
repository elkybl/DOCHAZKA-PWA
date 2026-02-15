import { NextRequest } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

const stopSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  purpose: z.string().max(200).optional(),
  note: z.string().max(500).optional(),
  site_id: z.string().max(80).optional(),
});

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // km
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function osrmKm(startLng: number, startLat: number, endLng: number, endLat: number) {
  // veřejný OSRM (zdarma, bez garance)
  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=false`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 3500);

  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => null);
    const meters = data?.routes?.[0]?.distance;
    if (typeof meters !== "number") return null;
    return meters / 1000;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const userId = (session as any).userId || (session as any).user_id || (session as any).id;
  const body = await req.json().catch(() => ({}));
  const parsed = stopSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data." }, { status: 400 });

  const db = supabaseAdmin();

  const { data: open, error: openErr } = await db
    .from("trips")
    .select("id,start_lat,start_lng,start_time")
    .eq("user_id", String(userId))
    .is("end_time", null)
    .order("start_time", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (openErr) return json({ error: "DB chyba." }, { status: 500 });
  if (!open) return json({ error: "Nemáš otevřenou jízdu." }, { status: 409 });

  // výpočet km
  const hKm = haversineKm(open.start_lat, open.start_lng, parsed.data.lat, parsed.data.lng);
  const oKm = await osrmKm(open.start_lng, open.start_lat, parsed.data.lng, parsed.data.lat);

  const km = oKm ?? hKm;
  const method = oKm ? "osrm" : "haversine";

  const upd = await db
    .from("trips")
    .update({
      end_time: new Date().toISOString(),
      end_lat: parsed.data.lat,
      end_lng: parsed.data.lng,
      distance_km: Number(km.toFixed(2)),
      distance_method: method,
      // umožníme při stopu doplnit purpose/note/site_id, když user zapomněl na startu
      purpose: parsed.data.purpose?.trim() || null,
      note: parsed.data.note?.trim() || null,
      site_id: parsed.data.site_id || null,
    })
    .eq("id", open.id)
    .select("id,start_time,end_time,distance_km,distance_method")
    .single();

  if (upd.error || !upd.data) return json({ error: "Nešlo uložit stop jízdy." }, { status: 500 });

  return json({ ok: true, trip: upd.data, fallback_used: !oKm });
}
