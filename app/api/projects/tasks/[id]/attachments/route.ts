import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { addTaskActivity, ensureProjectAccess, requireProjectSession } from "@/lib/projects-server";

type RouteContext = { params: Promise<{ id: string }> };

const BUCKET = "project-files";

async function loadAttachmentContext(id: string, attachmentId: string, userId: string, role: "admin" | "worker") {
  const db = supabaseAdmin();
  const task = await db.from("project_tasks").select("id,project_id").eq("id", id).single();
  if (task.error || !task.data) return { error: json({ error: "Úkol nebyl nalezen." }, { status: 404 }) };

  const access = await ensureProjectAccess(task.data.project_id, userId, role);
  if (!access) return { error: json({ error: "K projektu nemáš přístup." }, { status: 403 }) };

  const attachment = await db
    .from("project_attachments")
    .select("id,file_name,file_path,content_type,size_bytes,uploaded_by,created_at")
    .eq("id", attachmentId)
    .eq("task_id", id)
    .single();

  if (attachment.error || !attachment.data) {
    return { error: json({ error: "Příloha nebyla nalezena." }, { status: 404 }) };
  }

  return { db, attachment: attachment.data };
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");

  if (!(file instanceof File)) {
    return json({ error: "Chybí soubor k nahrání." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const task = await db.from("project_tasks").select("id,project_id,title").eq("id", id).single();
  if (task.error || !task.data) return json({ error: "Úkol nebyl nalezen." }, { status: 404 });

  const access = await ensureProjectAccess(task.data.project_id, auth.session.userId, auth.session.role);
  if (!access) return json({ error: "K projektu nemáš přístup." }, { status: 403 });

  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const safeExt = ext ? `.${String(ext).toLowerCase()}` : "";
  const safeName = `${id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const upload = await db.storage.from(BUCKET).upload(safeName, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (upload.error) {
    return json({ error: "Nešlo nahrát soubor. Zkontroluj bucket project-files v Supabase Storage." }, { status: 500 });
  }

  const insert = await db
    .from("project_attachments")
    .insert({
      task_id: id,
      file_name: file.name,
      file_path: safeName,
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: auth.session.userId,
    })
    .select("id,task_id,file_name,file_path,content_type,size_bytes,uploaded_by,created_at")
    .single();

  if (insert.error || !insert.data) {
    await db.storage.from(BUCKET).remove([safeName]);
    return json({ error: "Soubor se nahrál, ale nepodařilo se uložit metadata." }, { status: 500 });
  }

  const signed = await db.storage.from(BUCKET).createSignedUrl(safeName, 60 * 60);
  await addTaskActivity(id, auth.session.userId, "attachment_added", {
    file_name: file.name,
    size_bytes: file.size,
  });

  return json({
    attachment: insert.data,
    signed_url: signed.data?.signedUrl || null,
  });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "admin") return json({ error: "Jen admin může mazat přílohy." }, { status: 403 });

  const { id } = await context.params;
  const url = new URL(req.url);
  const attachmentId = url.searchParams.get("attachment_id");
  if (!attachmentId) return json({ error: "Chybí attachment_id." }, { status: 400 });

  const loaded = await loadAttachmentContext(id, attachmentId, auth.session.userId, auth.session.role);
  if ("error" in loaded) return loaded.error;
  const { db, attachment } = loaded;

  await db.storage.from(BUCKET).remove([attachment.file_path]);
  const removeMeta = await db.from("project_attachments").delete().eq("id", attachmentId);
  if (removeMeta.error) return json({ error: "Nešlo smazat metadata přílohy." }, { status: 500 });

  await addTaskActivity(id, auth.session.userId, "attachment_deleted", {
    file_name: attachment.file_name,
  });
  return json({ ok: true });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const url = new URL(req.url);
  const attachmentId = url.searchParams.get("attachment_id");
  if (!attachmentId) return json({ error: "Chybí attachment_id." }, { status: 400 });

  const loaded = await loadAttachmentContext(id, attachmentId, auth.session.userId, auth.session.role);
  if ("error" in loaded) return loaded.error;
  const { db, attachment } = loaded;

  const signed = await db.storage.from(BUCKET).createSignedUrl(attachment.file_path, 60 * 30);
  if (signed.error || !signed.data?.signedUrl) return json({ error: "Nešlo otevřít přílohu." }, { status: 500 });

  return json({
    attachment,
    signed_url: signed.data.signedUrl,
  });
}
