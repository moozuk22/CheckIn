import { SignJWT, jwtVerify } from "jose";

function getAdminSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing ADMIN_SESSION_SECRET");
  }

  return new TextEncoder().encode(secret);
}

export type AdminRole = "ADMIN" | "MEDIA_MANAGER";

export async function createAdminToken(role: AdminRole = "ADMIN") {
  const secret = getAdminSecret();

  return await new SignJWT({ role })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("365d")
      .sign(secret);
}

export async function verifyAdminToken(token: string) {
  try {
    const secret = getAdminSecret();
    const { payload } = await jwtVerify(token, secret);
    return payload;
  } catch {
    return null;
  }
}
