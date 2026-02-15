import { NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getBearer } from "@/lib/http";
import { verifySession } from "@/lib/auth";

function csvEscape(v: any) {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: NextRequest) {
  const token = getBearer(req);
  const session = token ? await verifySession(token) : null;
  if (!session) return new Response("Unauthorized", { status: 401 });

  const userId = (session as any).userId || (session as any).user_id || (session as any).id;
  const url = new URL(req.url);

  // month = "2026-02"
  const month = (url.searchParams.get("month") || "").trim();
  const base = month ? new Date(`${month}-01T00:00:00.000Z`) : new Date();
  const start = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), 1, 0, 0, 0));
  const end = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 1, 0, 0, 0));

  const db = supabaseAdmin();

  const { data: trips, error } = await db
    .from("trips")
    .select("id,site_id,purpose,note,start_time,end_time,distance_km,distance_km_user,distance_method")
    .eq("user_id", String(userId))
    .gte("start_time", start.toISOString())
    .lt("start_time", end.toISOString())
    .order("start_time", { ascending: true });

  if (error) return new Response("DB error", { status: 500 });

  const { data: sites } = await db.from("sites").select("id,name");
  const map = new Map<string, string>();
  for (const s of sites || []) map.set(String((s as any).id), String((s as any).name));

  const header = [
    "start_time",
    "end_time",
    "site",
    "purpose",
    "note",
    "km_calc",
    "km_manual",
    "km_final",
    "method",
  ];

  const lines: string[] = [];
  lines.push(header.join(","));

  for (const t of trips || []) {
    const siteName = (t as any).site_id ? map.get(String((t as any).site_id)) || "" : "";
    const kmCalc = (t as any).distance_km ?? "";
    const kmManual = (t as any).distance_km_user ?? "";
    const kmFinal = (t as any).distance_km_user != null ? (t as any).distance_km_user : ((t as any).distance_km ?? "");
    const method = (t as any).distance_km_user != null ? "manual" : ((t as any).distance_method ?? "");

    const row = [
      (t as any).start_time ?? "",
      (t as any).end_time ?? "",
      siteName,
      (t as any).purpose ?? "",
      (t as any).note ?? "",
      kmCalc,
      kmManual,
      kmFinal,
      method,
    ].map(csvEscape);

    lines.push(row.join(","));
  }

  const csv = lines.join("\n");
  const fileMonth = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="kniha-jizd-${fileMonth}.csv"`,
    },
  });
}
