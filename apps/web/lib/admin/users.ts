import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/firebase/admin";
import { type AdminUser, clearRoleCache, HttpError } from "./auth";
import { audit } from "./content";

export const userSchema = z.object({
  email: z.email().transform((e) => e.toLowerCase()),
  name: z.string().max(120).default(""),
  role: z.enum(["admin", "editor"]),
  active: z.boolean().default(true),
});

export async function listUsers() {
  const snap = await getDb().collection("users").get();
  return snap.docs.map((d) => ({ email: d.id, ...d.data() }));
}

export async function putUser(data: unknown, user: AdminUser) {
  const parsed = userSchema.safeParse(data);
  if (!parsed.success) throw new HttpError(400, "Ogiltig användare");
  const ref = getDb().collection("users").doc(parsed.data.email);
  const existed = (await ref.get()).exists;
  await ref.set(parsed.data);
  clearRoleCache();
  await audit(user, existed ? "update" : "create", `users/${parsed.data.email}`, parsed.data.role);
  return parsed.data;
}

export async function deleteUser(email: string, user: AdminUser) {
  if (email.toLowerCase() === user.email) throw new HttpError(400, "Du kan inte ta bort dig själv");
  await getDb().collection("users").doc(email.toLowerCase()).delete();
  clearRoleCache();
  await audit(user, "delete", `users/${email}`);
}

export interface UserAuditEntry {
  at: string;
  who: string;
  action: string;
  email: string;
  role: string;
}

const AUDIT_LIMIT = 50;

/** Newest first. `at` is a Firestore Timestamp (or missing while the server timestamp is pending). */
export function toUserAuditEntries(docs: { who?: string; action?: string; ref?: string; summary?: string; at?: { toDate(): Date } }[]): UserAuditEntry[] {
  return docs
    .filter((d) => d.ref?.startsWith("users/") && d.at)
    .map((d) => ({ at: d.at!.toDate().toISOString(), who: d.who ?? "", action: d.action ?? "", email: d.ref!.slice("users/".length), role: d.summary ?? "" }))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, AUDIT_LIMIT);
}

export async function listUserAudit() {
  // Range on ref only (single-field index); the log is small, so sort in memory.
  const snap = await getDb().collection("audit").where("ref", ">=", "users/").where("ref", "<", "users0").get();
  return toUserAuditEntries(snap.docs.map((d) => d.data()));
}
