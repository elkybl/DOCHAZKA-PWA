import { SignJWT, jwtVerify } from "jose";

export type Session = {
  userId: string;
  role: "admin" | "worker";
  name?: string;
};

function getJwtSecret(): Uint8Array {
  const raw =
    process.env.APP_JWT_SECRET ??
    process.env.JWT_SECRET ??
    process.env.NEXTAUTH_SECRET ??
    "";

  const secret = raw.trim();

  if (!secret) {
    throw new Error(
      "Chybí JWT secret. Nastav APP_JWT_SECRET (nebo JWT_SECRET) v prostředí (Vercel/HA/.env.local)."
    );
  }

  return new TextEncoder().encode(secret);
}

export async function signSession(session: Session) {
  const secret = getJwtSecret();
  return await new SignJWT(session as any)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

export async function verifySession(token: string): Promise<Session | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret);

    const userId = String((payload as any).userId || "");
    const role = (payload as any).role as any;
    const name = (payload as any).name ? String((payload as any).name) : undefined;

    if (!userId) return null;
    if (role !== "admin" && role !== "worker") return null;

    return { userId, role, name };
  } catch {
    return null;
  }
}
