import { z } from "zod";

export const calendarItemTypes = [
  "work_shift",
  "service_visit",
  "installation_job",
  "meeting",
  "training",
  "vacation",
  "sick_leave",
  "doctor",
  "personal_leave",
  "obstacle",
  "custom",
  "availability",
] as const;

export const calendarStatuses = ["planned", "in_progress", "done", "cancelled"] as const;
export const calendarAttendanceStatuses = ["pending", "checked_in", "confirmed", "missed", "excused"] as const;

export type CalendarItemType = (typeof calendarItemTypes)[number];
export type CalendarStatus = (typeof calendarStatuses)[number];
export type CalendarAttendanceStatus = (typeof calendarAttendanceStatuses)[number];

export const calendarTypeLabels: Record<CalendarItemType, string> = {
  work_shift: "Práce",
  service_visit: "Servis",
  installation_job: "Montáž",
  meeting: "Schůzka",
  training: "Školení",
  vacation: "Dovolená",
  sick_leave: "Nemoc",
  doctor: "Lékař",
  personal_leave: "Osobní volno",
  obstacle: "Překážka",
  custom: "Vlastní",
  availability: "Dostupnost",
};

export const workRelatedTypes: CalendarItemType[] = ["work_shift", "service_visit", "installation_job", "meeting", "training"];
export const weekdayOptions = [
  { value: 1, label: "Po" },
  { value: 2, label: "Út" },
  { value: 3, label: "St" },
  { value: 4, label: "Čt" },
  { value: 5, label: "Pá" },
  { value: 6, label: "So" },
  { value: 7, label: "Ne" },
] as const;

const timeSchema = z
  .string()
  .regex(/^\d{2}:\d{2}$/)
  .nullable()
  .optional();

const decimalSchema = z.number().min(0).max(1000).nullable().optional();
const bulkCreateSchema = z
  .object({
    from_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  })
  .optional();

export const calendarCreateSchema = z.object({
  user_id: z.string().uuid().optional(),
  user_ids: z.array(z.string().uuid()).min(1).max(50).optional(),
  type: z.enum(calendarItemTypes),
  title: z.string().min(2).max(160),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: timeSchema,
  end_time: timeSchema,
  all_day: z.boolean().default(false),
  location: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  planned_hours: decimalSchema,
  actual_hours: decimalSchema,
  status: z.enum(calendarStatuses).default("planned"),
  attendance_status: z.enum(calendarAttendanceStatuses).nullable().optional(),
  bulk_create: bulkCreateSchema,
});

export const calendarUpdateSchema = calendarCreateSchema.partial().extend({
  id: z.string().uuid().optional(),
  seen_confirmed: z.boolean().optional(),
  attendance_status: z.enum(calendarAttendanceStatuses).nullable().optional(),
  check_in_at: z.string().datetime().nullable().optional(),
  check_out_at: z.string().datetime().nullable().optional(),
  attendance_note: z.string().max(1000).nullable().optional(),
  approved: z.boolean().optional(),
});

export function isWorkRelated(type: string | null | undefined) {
  return workRelatedTypes.includes(type as CalendarItemType);
}

export function isAvailability(type: string | null | undefined) {
  return type === "availability";
}

export function deriveHours(date: string, startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return null;
  const start = new Date(`${date}T${startTime}:00`);
  const end = new Date(`${date}T${endTime}:00`);
  const diff = (end.getTime() - start.getTime()) / 3600000;
  if (!Number.isFinite(diff) || diff < 0) return null;
  return Math.round(diff * 100) / 100;
}

export function normalizeCalendarPayload<T extends { date?: string; start_time?: string | null; end_time?: string | null; planned_hours?: number | null; all_day?: boolean }>(payload: T) {
  const next = { ...payload };
  if (next.all_day) {
    next.start_time = null;
    next.end_time = null;
  }
  if ((next.planned_hours == null || Number(next.planned_hours) === 0) && next.date) {
    const derived = deriveHours(next.date, next.start_time, next.end_time);
    if (derived != null) next.planned_hours = derived;
  }
  return next;
}

