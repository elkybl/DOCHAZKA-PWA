import { createClient } from "@supabase/supabase-js";

export function supabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) throw new Error("Chybí SUPABASE_URL v .env.local");
  if (!key) throw new Error("Chybí SUPABASE_SERVICE_ROLE_KEY v .env.local");

  return createClient(url, key, {
    auth: { persistSession: false },
  });
}
