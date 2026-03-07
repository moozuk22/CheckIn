import { SignJWT, jwtVerify } from "jose";

function getAdminSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  if (!secret) {
    throw new Error("Missing ADMIN_SESSION_SECRET");
  }

  return new TextEncoder().encode(secret);
}

export async function createAdminToken() {
  const secret = getAdminSecret();

  return await new SignJWT({ role: "ADMIN" })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
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
