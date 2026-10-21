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
  await getDb().collection("users").doc(parsed.data.email).set(parsed.data);
  clearRoleCache();
  await audit(user, "update", `users/${parsed.data.email}`, parsed.data.role);
  return parsed.data;
}

export async function deleteUser(email: string, user: AdminUser) {
  if (email.toLowerCase() === user.email) throw new HttpError(400, "Du kan inte ta bort dig själv");
  await getDb().collection("users").doc(email.toLowerCase()).delete();
  clearRoleCache();
  await audit(user, "delete", `users/${email}`);
}
