import { toDate } from "@/lib/time";

export type OpenShift = {
  site_id: string | null;
  server_time: string;
  day_local: string | null;
};

export async function getLatestOpenShift(db: any, userId: string): Promise<OpenShift | null> {
  const [{ data: lastIn, error: inError }, { data: lastOut, error: outError }] = await Promise.all([
    db
      .from("attendance_events")
      .select("site_id,server_time,day_local")
      .eq("user_id", userId)
      .eq("type", "IN")
      .order("server_time", { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from("attendance_events")
      .select("server_time")
      .eq("user_id", userId)
      .eq("type", "OUT")
      .order("server_time", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (inError) throw new Error(`DB chyba (open shift IN): ${inError.message}`);
  if (outError) throw new Error(`DB chyba (open shift OUT): ${outError.message}`);
  if (!lastIn?.server_time) return null;

  const inTime = toDate(lastIn.server_time).getTime();
  const outTime = lastOut?.server_time ? toDate(lastOut.server_time).getTime() : 0;

  if (!(inTime > outTime)) return null;

  return {
    site_id: lastIn.site_id ?? null,
    server_time: String(lastIn.server_time),
    day_local: lastIn.day_local ?? null,
  };
}
