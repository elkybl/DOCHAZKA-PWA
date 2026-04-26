import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { ensureProjectAccess, getProjectMembers, requireProjectAdmin, requireProjectSession } from "@/lib/projects-server";
import { projectUpdateSchema } from "@/lib/projects";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const body = await req.json().catch(() => null);
  const parsed = projectUpdateSchema.safeParse(body);
  if (!parsed.success) return json({ error: "Neplatná data projektu." }, { status: 400 });

  const db = supabaseAdmin();

  const updatePayload = {
    ...(parsed.data.title != null ? { title: parsed.data.title.trim() } : {}),
    ...(parsed.data.description !== undefined ? { description: parsed.data.description?.trim() || null } : {}),
    ...(parsed.data.site_id !== undefined ? { site_id: parsed.data.site_id || null } : {}),
    ...(parsed.data.status ? { status: parsed.data.status } : {}),
    updated_by: auth.session.userId,
    updated_at: new Date().toISOString(),
  };

  const projectUpdate = await db
    .from("projects")
    .update(updatePayload)
    .eq("id", id)
    .select("id,title,description,site_id,status,created_by,updated_by,created_at,updated_at")
    .single();

  if (projectUpdate.error || !projectUpdate.data) {
    return json({ error: "Nešlo upravit projekt." }, { status: 500 });
  }

  if (parsed.data.member_ids) {
    const currentMembers = await getProjectMembers(id);
    const ownerIds = currentMembers.filter((member) => member.role === "owner").map((member) => member.user_id);
    const desiredIds = [...new Set([auth.session.userId, ...ownerIds, ...parsed.data.member_ids])];

    const toRemove = currentMembers
      .filter((member) => !desiredIds.includes(member.user_id) && member.role !== "owner")
      .map((member) => member.user_id);

    if (toRemove.length) {
      await db.from("project_members").delete().eq("project_id", id).in("user_id", toRemove);
    }

    const currentIds = currentMembers.map((member) => member.user_id);
    const toInsert = desiredIds.filter((userId) => !currentIds.includes(userId));

    if (toInsert.length) {
      await db.from("project_members").insert(
        toInsert.map((userId) => ({
          project_id: id,
          user_id: userId,
          role: userId === auth.session.userId ? "owner" : "member",
        })),
      );
    }
  }

  return json({ project: projectUpdate.data });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectAdmin(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const db = supabaseAdmin();
  const { error } = await db.from("projects").delete().eq("id", id);
  if (error) return json({ error: "Nešlo smazat projekt." }, { status: 500 });
  return json({ ok: true });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const access = await ensureProjectAccess(id, auth.session.userId, auth.session.role);
  if (!access) return json({ error: "K projektu nemáš přístup." }, { status: 403 });

  const db = supabaseAdmin();
  const project = await db
    .from("projects")
    .select("id,title,description,site_id,status,created_by,updated_by,created_at,updated_at")
    .eq("id", id)
    .single();

  if (project.error || !project.data) return json({ error: "Projekt nebyl nalezen." }, { status: 404 });
  return json({ project: project.data });
}

