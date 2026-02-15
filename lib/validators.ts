import { z } from "zod";

// ✅ LOGIN PIN
export const pinLoginSchema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
});

// společné: pozice z mobilu
export const positionSchema = z.object({
  lat: z.number(),
  lng: z.number(),
  accuracy_m: z.number().optional(),
});

// ===== DOCHÁZKA =====

// PŘÍCHOD
export const attendanceInSchema = z.object({
  site_id: z.string().uuid(),
  ...positionSchema.shape,
});

// ODCHOD (+ práce, km, materiál)
export const attendanceOutSchema = z.object({
  site_id: z.string().uuid(),
  ...positionSchema.shape,

  note_work: z.string().min(2).max(2000),

  km: z.number().min(0).max(2000).optional(),

  // ✅ materiál ze svého
  material_desc: z.string().max(500).optional(),
  material_amount: z.number().min(0).max(200000).optional(),
});

// OFFSITE (mimo stavbu) – pokud bys chtěl používat schema i tady
export const attendanceOffsiteSchema = z.object({
  site_id: z.string().uuid().optional(),

  offsite_hours: z.number().min(0.25).max(24),
  offsite_reason: z.string().min(2).max(500),

  // ✅ materiál ze svého
  material_desc: z.string().max(500).optional(),
  material_amount: z.number().min(0).max(200000).optional(),
});

// ===== ADMIN: USERS =====

export const adminUserCreateSchema = z.object({
  name: z.string().min(2).max(80),
  pin: z.string().regex(/^\d{4,8}$/), // 4–8 číslic
  role: z.enum(["admin", "worker"]).default("worker"),
  is_active: z.boolean().default(true),
});

export const adminUserUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(80).optional(),
  pin: z.string().regex(/^\d{4,8}$/).optional(),
  role: z.enum(["admin", "worker"]).optional(),
  is_active: z.boolean().optional(),
});

// ===== ADMIN: SITES =====

export const adminSiteCreateSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().max(200).nullable().optional(),
  lat: z.number(),
  lng: z.number(),
  radius_m: z.number().min(20).max(5000).default(250),
  is_active: z.boolean().default(true),
});

export const adminSiteUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(2).max(120).optional(),
  address: z.string().max(200).nullable().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  radius_m: z.number().min(20).max(5000).optional(),
  is_active: z.boolean().optional(),
});
