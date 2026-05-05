import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { supabaseAdmin } from "@/lib/supabase";

const DEFAULT_BUCKET = "project-files";

type UploadInput = {
  key: string;
  bytes: Uint8Array;
  contentType?: string | null;
};

type UploadResult = {
  provider: "r2" | "supabase";
  key: string;
};

function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET || DEFAULT_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
  };
}

function r2Client() {
  const config = r2Config();
  if (!config) return null;

  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

export function storageProviderLabel() {
  return r2Config() ? "Cloudflare R2" : "Supabase Storage";
}

export async function uploadProjectObject(input: UploadInput): Promise<UploadResult> {
  const config = r2Config();
  const client = r2Client();

  if (config && client) {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: input.key,
        Body: input.bytes,
        ContentType: input.contentType || "application/octet-stream",
      }),
    );

    return { provider: "r2", key: input.key };
  }

  const db = supabaseAdmin();
  const upload = await db.storage.from(DEFAULT_BUCKET).upload(input.key, input.bytes, {
    contentType: input.contentType || "application/octet-stream",
    upsert: false,
  });

  if (upload.error) {
    throw new Error(upload.error.message || "Upload failed");
  }

  return { provider: "supabase", key: input.key };
}

export async function removeProjectObject(key: string) {
  const config = r2Config();
  const client = r2Client();

  if (config && client) {
    await client.send(
      new DeleteObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
    );
    return;
  }

  const db = supabaseAdmin();
  await db.storage.from(DEFAULT_BUCKET).remove([key]);
}

export async function createProjectSignedUrl(key: string, expiresInSeconds = 1800) {
  const config = r2Config();
  const client = r2Client();

  if (config && client) {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({
        Bucket: config.bucket,
        Key: key,
      }),
      { expiresIn: expiresInSeconds },
    );
    return url;
  }

  const db = supabaseAdmin();
  const signed = await db.storage.from(DEFAULT_BUCKET).createSignedUrl(key, expiresInSeconds);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(signed.error?.message || "Signed URL failed");
  }
  return signed.data.signedUrl;
}
