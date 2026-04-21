import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer, json } from "@/lib/http";
import { verifySession } from "@/lib/auth";
import { compareAttendanceEventsAsc } from "@/lib/attendance-order";
import { dayLocalCZFromIso, toDate } from "@/lib/time";

type EventRow = {
  id: string;
  user_id: string;
  site_id: string | null;
  type: "IN" | "OUT" | "OFFSITE";
  server_time: string;
  day_local: string | null;
  note_work: string | null;
  is_paid: boolean;
};

type UserRow = {
  id: string;
  name: string | null;
  is_active: boolean | null;
  role: string | null;
};

type SiteRow = {
  id: string;
  name: string | null;
};

async function requireAdmin(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return { error: json({ error: "Nepřihlášen." }, { status: 401 }) };
  if (session.role !== "admin") return { error: json({ error: "Jen admin." }, { status: 403 }) };
  return { session };
}

function riskTitle(code: string) {
  switch (code) {
    case "open_long":
      return "Dlouho otevřená směna";
    case "same_time_transition":
      return "Stejný čas odchodu a příchodu";
    case "missing_in":
      return "Odchod bez nalezeného příchodu";
    case "consecutive_in":
      return "Dva příchody za sebou";
    case "zero_length":
      return "Nulová nebo velmi krátká směna";
    case "missing_note":
      return "Odchod bez popisu práce";
    case "missing_site":
      return "Záznam bez stavby";
    default:
      return "Rizikový záznam";
  }
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;

  const db = supabaseAdmin();
  const from = new Date(Date.now() - 45 * 86400000).toISOString();

  const [
    usersRes,
    pendingSitesRes,
    unpaidRes,
    eventsRes,
    sitesRes,
  ] = await Promise.all([
    db.from("users").select("id,name,is_active,role"),
    db.from("sites").select("id", { count: "exact", head: true }).eq("is_pending", true).eq("is_archived", false),
    db.from("attendance_events").select("id", { count: "exact", head: true }).eq("is_paid", false),
    db
      .from("attendance_events")
      .select("id,user_id,site_id,type,server_time,day_local,note_work,is_paid")
      .gte("server_time", from)
      .order("server_time", { ascending: true })
      .limit(1500),
    db.from("sites").select("id,name"),
  ]);

  if (usersRes.error) return json({ error: "DB chyba (users)." }, { status: 500 });
  if (eventsRes.error) return json({ error: "DB chyba (events)." }, { status: 500 });

  const users = (usersRes.data || []) as UserRow[];
  const userName = new Map<string, string>();
  for (const u of users) userName.set(String(u.id), String(u.name || "Neznámý uživatel"));

  const siteName = new Map<string, string>();
  for (const s of (sitesRes.data || []) as SiteRow[]) siteName.set(String(s.id), String(s.name || "Neznámá stavba"));

  const events = ((eventsRes.data || []) as EventRow[]).sort(compareAttendanceEventsAsc);
  const openByUser = new Map<string, EventRow>();
  const risks: Array<{
    code: string;
    title: string;
    user_name: string;
    site_name: string | null;
    day: string;
    detail: string;
    severity: "low" | "medium" | "high";
  }> = [];

  function addRisk(input: {
    code: string;
    event: EventRow;
    detail: string;
    severity?: "low" | "medium" | "high";
  }) {
    risks.push({
      code: input.code,
      title: riskTitle(input.code),
      user_name: userName.get(input.event.user_id) || input.event.user_id,
      site_name: input.event.site_id ? siteName.get(input.event.site_id) || input.event.site_id : null,
      day: input.event.day_local || dayLocalCZFromIso(input.event.server_time),
      detail: input.detail,
      severity: input.severity || "medium",
    });
  }

  let sameTimeTransitions = 0;

  for (const e of events) {
    if (!e.site_id) addRisk({ code: "missing_site", event: e, detail: "Záznam nemá přiřazenou stavbu.", severity: "low" });

    if (e.type === "IN") {
      const open = openByUser.get(e.user_id);
      if (open) {
        addRisk({
          code: "consecutive_in",
          event: e,
          detail: "Uživatel má další příchod bez předchozího odchodu.",
          severity: "high",
        });
      }
      openByUser.set(e.user_id, e);
      continue;
    }

    if (e.type === "OUT") {
      const open = openByUser.get(e.user_id);
      if (!open) {
        addRisk({ code: "missing_in", event: e, detail: "Odchod nemá v posledních 45 dnech odpovídající příchod.", severity: "high" });
      } else {
        const start = toDate(open.server_time).getTime();
        const end = toDate(e.server_time).getTime();
        const minutes = Math.max(0, Math.round((end - start) / 60000));

        if (open.server_time === e.server_time) {
          sameTimeTransitions += 1;
          addRisk({
            code: "same_time_transition",
            event: e,
            detail: "Příchod a odchod mají stejný čas. Nové záznamy už systém posouvá o 1 sekundu.",
            severity: "medium",
          });
        }
        if (minutes <= 1) addRisk({ code: "zero_length", event: e, detail: `Délka směny je ${minutes} min.`, severity: "medium" });
        if (minutes > 14 * 60) addRisk({ code: "open_long", event: e, detail: `Směna trvala ${Math.round(minutes / 60)} h.`, severity: "high" });
      }

      if (!e.note_work || !e.note_work.trim()) {
        addRisk({ code: "missing_note", event: e, detail: "Odchod nemá vyplněný popis práce.", severity: "low" });
      }
      openByUser.delete(e.user_id);
    }
  }

  for (const open of openByUser.values()) {
    const start = toDate(open.server_time).getTime();
    const hours = Math.round((Date.now() - start) / 3600000);
    if (hours >= 14) {
      addRisk({
        code: "open_long",
        event: open,
        detail: `Směna je otevřená přibližně ${hours} h.`,
        severity: "high",
      });
    }
  }

  const activeUsers = users.filter((u) => u.is_active !== false).length;

  return json({
    summary: {
      active_users: activeUsers,
      open_shifts: openByUser.size,
      pending_sites: pendingSitesRes.count || 0,
      unpaid_events: unpaidRes.count || 0,
      risk_count: risks.length,
      same_time_transitions: sameTimeTransitions,
    },
    risks: risks
      .sort((a, b) => {
        const order = { high: 0, medium: 1, low: 2 };
        return order[a.severity] - order[b.severity];
      })
      .slice(0, 12),
  });
}
