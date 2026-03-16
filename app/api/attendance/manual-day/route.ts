import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";

function toNum(v: any, d = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

function isValidDay(day: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(day);
}

function isValidTime(t: string) {
  return /^\d{2}:\d{2}$/.test(t);
}

/**
 * Prague local YYYY-MM-DD + HH:MM -> UTC ISO string
 * Serverless typically runs in UTC; we compute offset via Intl.
 */
function pragueLocalToUtcIso(day: string, hhmm: string) {
  const base = new Date(`${day}T${hhmm}:00Z`);

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(base);

  const obj: any = {};
  for (const p of parts) obj[p.type] = p.value;

  const pragueDisplayed = `${obj.year}-${obj.month}-${obj.day}T${obj.hour}:${obj.minute}:00Z`;
  const desiredPrague = `${day}T${hhmm}:00Z`;

  const disp = new Date(pragueDisplayed).getTime();
  const want = new Date(desiredPrague).getTime();
  const delta = disp - want;

  return new Date(base.getTime() - delta).toISOString();
}

export async function POST(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return json({ error: "Nepřihlášen." }, { status: 401 });

  const body = await req.json().catch(() => ({}));

  const day_local = String(body.day_local || "").trim();
  const time_from = String(body.time_from || "").trim();
  const time_to = String(body.time_to || "").trim();
  const site_id = body.site_id ? String(body.site_id) : null;

  const note_work = String(body.note_work || "").trim();
  const km = toNum(body.km, 0);

  if (!isValidDay(day_local)) return json({ error: "Špatné datum." }, { status: 400 });
  if (!isValidTime(time_from) || !isValidTime(time_to)) return json({ error: "Špatný čas." }, { status: 400 });

  const [fh, fm] = time_from.split(":").map(Number);
  const [th, tm] = time_to.split(":").map(Number);
  if (th * 60 + tm <= fh * 60 + fm) return json({ error: "Čas Do musí být později než Od." }, { status: 400 });

  if (!Number.isFinite(km) || km < 0) return json({ error: "Km jsou neplatné." }, { status: 400 });

  const db = supabaseAdmin();

  const in_time = pragueLocalToUtcIso(day_local, time_from);
  const out_time = pragueLocalToUtcIso(day_local, time_to);

  const prefix = "MIMO LOKACI – DOPLNĚNÝ DEN – ";
  const noteFinal = (prefix + (note_work || "doplněno ručně")).slice(0, 500);

  const { error } = await db.from("attendance_events").insert([
    {
      user_id: session.userId,
      site_id,
      type: "IN",
      server_time: in_time,
      day_local,
      lat: null,
      lng: null,
      accuracy_m: null,
      distance_m: null,
      is_paid: false,
    },
    {
      user_id: session.userId,
      site_id,
      type: "OUT",
      server_time: out_time,
      day_local,
      lat: null,
      lng: null,
      accuracy_m: null,
      distance_m: null,
      note_work: noteFinal,
      km: km || null,
      is_paid: false,
    },
  ]);

  if (error) return json({ error: `Nešlo uložit nouzový den: ${error.message}` }, { status: 500 });

  return json({ ok: true });
}
