import { NextRequest } from "next/server";
import { json } from "@/lib/http";
import { supabaseAdmin } from "@/lib/supabase";
import { addProjectFileActivity, ensureProjectAccess, requireProjectSession } from "@/lib/projects-server";
import { projectFileCategorySchema, type ProjectFileCategory } from "@/lib/projects";

type RouteContext = { params: Promise<{ id: string }> };

const BUCKET = "project-files";

function inferProjectFileCategory(file: File): ProjectFileCategory {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".dwg") || name.endsWith(".dxf") || name.endsWith(".ifc")) return "drawing";
  return "other";
}

async function loadProjectFileContext(id: string, fileId: string, userId: string, role: "admin" | "worker") {
  const access = await ensureProjectAccess(id, userId, role);
  if (!access) return { error: json({ error: "K projektu nemáš přístup." }, { status: 403 }) };

  const db = supabaseAdmin();
  const file = await db
    .from("project_files")
    .select("id,project_id,file_name,file_path,category,content_type,size_bytes,uploaded_by,created_at")
    .eq("id", fileId)
    .eq("project_id", id)
    .single();

  if (file.error || !file.data) {
    return { error: json({ error: "Soubor projektu nebyl nalezen." }, { status: 404 }) };
  }

  return { db, file: file.data };
}

export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const access = await ensureProjectAccess(id, auth.session.userId, auth.session.role);
  if (!access) return json({ error: "K projektu nemáš přístup." }, { status: 403 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return json({ error: "Chybí soubor k nahrání." }, { status: 400 });
  }

  const categoryRaw = typeof form?.get("category") === "string" ? String(form?.get("category")) : "";
  const categoryParsed = projectFileCategorySchema.safeParse(categoryRaw || inferProjectFileCategory(file));
  if (!categoryParsed.success) {
    return json({ error: "Neplatná kategorie souboru." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  const safeExt = ext ? `.${String(ext).toLowerCase()}` : "";
  const safeName = `project-${id}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const upload = await db.storage.from(BUCKET).upload(safeName, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (upload.error) {
    return json({ error: "Nešlo nahrát soubor. Zkontroluj bucket project-files v Supabase Storage." }, { status: 500 });
  }

  const insert = await db
    .from("project_files")
    .insert({
      project_id: id,
      file_name: file.name,
      file_path: safeName,
      category: categoryParsed.data,
      content_type: file.type || null,
      size_bytes: file.size,
      uploaded_by: auth.session.userId,
    })
    .select("id,project_id,file_name,file_path,category,content_type,size_bytes,uploaded_by,created_at")
    .single();

  if (insert.error || !insert.data) {
    await db.storage.from(BUCKET).remove([safeName]);
    return json({ error: "Soubor se nahrál, ale nepodařilo se uložit metadata projektu." }, { status: 500 });
  }

  const signed = await db.storage.from(BUCKET).createSignedUrl(safeName, 60 * 60);
  await addProjectFileActivity(id, auth.session.userId, "project_file_added", {
    file_name: file.name,
    category: categoryParsed.data,
    size_bytes: file.size,
  });
  return json({
    file: insert.data,
    signed_url: signed.data?.signedUrl || null,
  });
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;
  if (auth.session.role !== "admin") return json({ error: "Jen admin může mazat soubory projektu." }, { status: 403 });

  const { id } = await context.params;
  const url = new URL(req.url);
  const fileId = url.searchParams.get("file_id");
  if (!fileId) return json({ error: "Chybí file_id." }, { status: 400 });

  const loaded = await loadProjectFileContext(id, fileId, auth.session.userId, auth.session.role);
  if ("error" in loaded) return loaded.error;
  const { db, file } = loaded;

  await db.storage.from(BUCKET).remove([file.file_path]);
  const removeMeta = await db.from("project_files").delete().eq("id", fileId);
  if (removeMeta.error) return json({ error: "Nešlo smazat metadata souboru projektu." }, { status: 500 });

  await addProjectFileActivity(id, auth.session.userId, "project_file_deleted", {
    file_name: file.file_name,
    category: file.category,
  });
  return json({ ok: true });
}

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = await requireProjectSession(req);
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const url = new URL(req.url);
  const fileId = url.searchParams.get("file_id");
  if (!fileId) return json({ error: "Chybí file_id." }, { status: 400 });

  const loaded = await loadProjectFileContext(id, fileId, auth.session.userId, auth.session.role);
  if ("error" in loaded) return loaded.error;
  const { db, file } = loaded;

  const signed = await db.storage.from(BUCKET).createSignedUrl(file.file_path, 60 * 30);
  if (signed.error || !signed.data?.signedUrl) return json({ error: "Nešlo otevřít soubor projektu." }, { status: 500 });

  return json({
    file,
    signed_url: signed.data.signedUrl,
  });
}
