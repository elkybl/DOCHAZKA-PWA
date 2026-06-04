import { supabaseAdmin } from "@/lib/supabase";

export type PayrollLock = {
  id: string;
  from_day: string;
  to_day: string;
  note: string | null;
  closed_at: string;
  closed_by: string | null;
};

function isDay(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMissingPayrollLocksTableMessage(message: string) {
  return message.includes("attendance_payroll_locks");
}

export function assertDayString(day: string) {
  if (!isDay(day)) throw new Error(`Neplatný den: ${day}`);
}

export async function findLockForDay(day: string) {
  assertDayString(day);
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("attendance_payroll_locks")
    .select("id,from_day,to_day,note,closed_at,closed_by")
    .lte("from_day", day)
    .gte("to_day", day)
    .order("from_day", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingPayrollLocksTableMessage(error.message || "")) return null;
    throw new Error(`DB chyba (payroll locks): ${error.message}`);
  }
  return (data as PayrollLock | null) || null;
}

export async function hasLockedOverlap(fromDay: string, toDay: string) {
  assertDayString(fromDay);
  assertDayString(toDay);
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("attendance_payroll_locks")
    .select("id,from_day,to_day,note,closed_at,closed_by")
    .lte("from_day", toDay)
    .gte("to_day", fromDay)
    .order("from_day", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingPayrollLocksTableMessage(error.message || "")) return null;
    throw new Error(`DB chyba (payroll locks overlap): ${error.message}`);
  }
  return (data as PayrollLock | null) || null;
}

export async function listPayrollLocks() {
  const db = supabaseAdmin();
  const { data, error } = await db
    .from("attendance_payroll_locks")
    .select("id,from_day,to_day,note,closed_at,closed_by")
    .order("from_day", { ascending: false });

  if (error) {
    if (isMissingPayrollLocksTableMessage(error.message || "")) return [];
    throw new Error(`DB chyba (list payroll locks): ${error.message}`);
  }
  return (data as PayrollLock[]) || [];
}
