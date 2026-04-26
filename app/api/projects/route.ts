import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { loadProjectBundle, requireProjectAdmin, requireProjectSession } from "@/lib/projects-server";
import { projectCreateSchema } from "@/lib/projects";

export async function GET(req: NextRequest) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  try {
    const bundle = await loadProjectBundle(auth.session.userId, auth.session.role);
    return json(bundle);
  } catch {
    return json({ error: "Nepodařilo se načíst projekty." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireProjectAdmin(req);
  if ("error" in auth) return auth.error;

  const body = await req.json().catch(() => null);
  const parsed = projectCreateSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data projektu." }, { status: 400 });

  const db = supabaseAdmin();

  const insertProject = await db
    .from("projects")
    .insert({
      title: parsed.data.title.trim(),
      description: parsed.data.description?.trim() || null,
      site_id: parsed.data.site_id || null,
      status: parsed.data.status,
      created_by: auth.session.userId,
      updated_by: auth.session.userId,
    })
    .select("id,title,description,site_id,status,created_by,updated_by,created_at,updated_at")
    .single();

  if (insertProject.error || !insertProject.data) {
    return json({ error: "Nešlo uložit projekt." }, { status: 500 });
  }

  const memberIds = [...new Set([auth.session.userId, ...parsed.data.member_ids])];
  if (memberIds.length) {
    const memberRows = memberIds.map((userId) => ({
      project_id: insertProject.data.id,
      user_id: userId,
      role: userId === auth.session.userId ? "owner" : "member",
    }));
    const membersInsert = await db.from("project_members").insert(memberRows);
    if (membersInsert.error) {
      await db.from("projects").delete().eq("id", insertProject.data.id);
      return json({ error: "Projekt se uložil, ale nepodařilo se přidat členy." }, { status: 500 });
    }
  }

  return json({ project: insertProject.data });
}

