import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { UserRole } from "@/lib/db/models/User";

export type SessionPayload = {
  sub: string;
  role: UserRole;
  roomId: string | null;
};

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  throw new Error("JWT_SECRET is not set");
}
const SECRET_KEY = new TextEncoder().encode(SECRET);

export const SESSION_COOKIE = "session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ role: payload.role, roomId: payload.roomId })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET_KEY);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    if (!isSessionPayload(payload)) return null;
    return {
      sub: payload.sub as string,
      role: payload.role,
      roomId: payload.roomId,
    };
  } catch {
    return null;
  }
}

function isSessionPayload(payload: JWTPayload): payload is JWTPayload & {
  sub: string;
  role: UserRole;
  roomId: string | null;
} {
  if (typeof payload.sub !== "string") return false;
  const role = (payload as { role?: unknown }).role;
  if (role !== "owner" && role !== "roomAdmin" && role !== "user") return false;
  const roomId = (payload as { roomId?: unknown }).roomId;
  if (roomId !== null && typeof roomId !== "string") return false;
  return true;
}
