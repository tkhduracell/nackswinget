import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/firebase/admin", () => ({ getDb: vi.fn() }));
vi.mock("./auth", () => ({ clearRoleCache: vi.fn(), HttpError: class extends Error {} }));
vi.mock("./content", () => ({ audit: vi.fn() }));

const ts = (iso: string) => ({ toDate: () => new Date(iso) });

describe("toUserAuditEntries", () => {
  it("keeps user changes only, newest first, skipping pending timestamps", async () => {
    const { toUserAuditEntries } = await import("./users");
    const rows = toUserAuditEntries([
      { who: "a@x.se", action: "create", ref: "users/b@x.se", summary: "editor", at: ts("2026-10-20T10:00:00Z") },
      { who: "a@x.se", action: "update", ref: "users/b@x.se", summary: "admin", at: ts("2026-10-21T10:00:00Z") },
      { who: "a@x.se", action: "publish", ref: "pages/1", summary: "Hem", at: ts("2026-10-22T10:00:00Z") },
      { who: "a@x.se", action: "delete", ref: "users/c@x.se", summary: "" },
    ]);
    expect(rows).toEqual([
      { at: "2026-10-21T10:00:00.000Z", who: "a@x.se", action: "update", email: "b@x.se", role: "admin" },
      { at: "2026-10-20T10:00:00.000Z", who: "a@x.se", action: "create", email: "b@x.se", role: "editor" },
    ]);
  });

  it("caps the list at 50", async () => {
    const { toUserAuditEntries } = await import("./users");
    const docs = Array.from({ length: 60 }, (_, i) => ({ who: "a", action: "update", ref: `users/u${i}`, summary: "editor", at: ts(new Date(2026, 0, 1, 0, i).toISOString()) }));
    const rows = toUserAuditEntries(docs);
    expect(rows).toHaveLength(50);
    expect(rows[0].email).toBe("u59");
  });
});
