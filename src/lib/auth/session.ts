import { cookies } from "next/headers";
import { forbidden, unauthorized } from "next/navigation";
import { SESSION_COOKIE, verifySession, type SessionPayload } from "@/lib/auth/jwt";

export type Session = SessionPayload;

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}

export async function requireUser(): Promise<Session> {
  const session = await getSession();
  if (!session) unauthorized();
  return session;
}

export async function requireOwner(): Promise<Session> {
  const session = await requireUser();
  if (session.role !== "owner") forbidden();
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireUser();
  if (session.role !== "owner" && session.role !== "roomAdmin") forbidden();
  return session;
}

export async function requireAdminForRoom(targetRoomId: string): Promise<Session> {
  const session = await requireAdmin();
  if (session.role === "owner") return session;
  if (session.roomId !== targetRoomId) forbidden();
  return session;
}
