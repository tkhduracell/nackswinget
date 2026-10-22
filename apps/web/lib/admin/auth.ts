import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getAdminAuth, getDb } from "@/lib/firebase/admin";

export type Role = "admin" | "editor";
export interface AdminUser {
  uid: string;
  email: string;
  role: Role;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Bootstrap admins (Secret Manager ADMIN_EMAILS, comma separated); everyone else is in Firestore users/{email}. */
function bootstrapAdmins(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

const roleCache = new Map<string, { role: Role | null; at: number }>();

/** The allowlisted role for an email, or null (used for sign-in links too). */
export async function roleFor(email: string): Promise<Role | null> {
  if (bootstrapAdmins().has(email)) return "admin";
  const hit = roleCache.get(email);
  if (hit && Date.now() - hit.at < 30_000) return hit.role;
  const snap = await getDb().collection("users").doc(email).get();
  const data = snap.data();
  const role = snap.exists && data?.active !== false && (data?.role === "admin" || data?.role === "editor") ? (data.role as Role) : null;
  roleCache.set(email, { role, at: Date.now() });
  return role;
}

export function clearRoleCache() {
  roleCache.clear();
}

/** Verifies the Firebase ID token in `Authorization: Bearer` and the allowlist. */
export async function requireUser(req: Request, minRole: Role = "editor"): Promise<AdminUser> {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) throw new HttpError(401, "Inte inloggad");
  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch {
    throw new HttpError(401, "Sessionen har gått ut, logga in igen");
  }
  const email = (decoded.email ?? "").toLowerCase();
  if (!email || !decoded.email_verified) throw new HttpError(403, "E-postadressen är inte verifierad");
  const role = await roleFor(email);
  if (!role) throw new HttpError(403, "Du har inte behörighet till administrationen");
  if (minRole === "admin" && role !== "admin") throw new HttpError(403, "Kräver administratörsbehörighet");
  return { uid: decoded.uid, email, role };
}

/** Wraps a route handler with auth + JSON error responses. */
export function adminRoute<C>(minRole: Role, handler: (req: Request, user: AdminUser, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      const user = await requireUser(req, minRole);
      return await handler(req, user, ctx);
    } catch (e) {
      // Let Next's own control-flow errors (dynamic bail-out, redirect) through.
      unstable_rethrow(e);
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: "Något gick fel på servern" }, { status: 500 });
    }
  };
}
