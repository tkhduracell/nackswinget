import { beforeEach, describe, expect, it, vi } from "vitest";

const afterTasks: (() => Promise<void>)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => afterTasks.push(fn) }));
const roleFor = vi.fn();
vi.mock("@/lib/admin/auth", () => ({ roleFor }));
const sendLoginMail = vi.fn();
vi.mock("@/lib/admin/login-mail", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin/login-mail")>()),
  sendLoginMail,
  signInLink: async (_email: string, origin: string) => `${origin}/admin/?mode=signIn&oobCode=x`,
}));

const ORIGIN = "https://nackswinget.se";
const post = (email: string, origin: string | null = ORIGIN) =>
  import("./route").then(({ POST }) =>
    POST(new Request(`${ORIGIN}/api/admin/login-link/`, { method: "POST", headers: origin ? { origin } : {}, body: JSON.stringify({ email }) })),
  );
const runAfter = () => Promise.all(afterTasks.splice(0).map((fn) => fn()));

describe("POST /api/admin/login-link/", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SMTP_URL", "smtps://u:p@host:465");
    roleFor.mockReset();
    sendLoginMail.mockReset();
    afterTasks.length = 0;
  });

  it("falls back to Firebase while SMTP is unset", async () => {
    vi.stubEnv("SMTP_URL", "unset");
    const res = await post("a@b.se");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ fallback: true });
  });

  it("rejects other origins", async () => {
    expect((await post("a@b.se", "https://evil.example")).status).toBe(403);
    expect((await post("a@b.se", null)).status).toBe(403);
  });

  it("answers the same for allowlisted and unknown addresses and mails only the former", async () => {
    roleFor.mockImplementation(async (e: string) => (e === "admin@b.se" ? "admin" : null));
    const [a, b] = await Promise.all([post("Admin@B.se"), post("nobody@b.se")]);
    expect([a.status, b.status]).toEqual([200, 200]);
    await runAfter();
    expect(sendLoginMail).toHaveBeenCalledExactlyOnceWith("admin@b.se", `${ORIGIN}/admin/?mode=signIn&oobCode=x`);
  });

  it("rate limits per address, but not after a failed send", async () => {
    roleFor.mockResolvedValue("admin");
    sendLoginMail.mockRejectedValueOnce(new Error("smtp down"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");
    const req = () => new Request(`${ORIGIN}/api/admin/login-link/`, { method: "POST", headers: { origin: ORIGIN }, body: JSON.stringify({ email: "a@b.se" }) });
    await POST(req());
    await runAfter();
    await POST(req());
    await runAfter();
    await POST(req());
    await runAfter();
    expect(sendLoginMail).toHaveBeenCalledTimes(2);
  });
});
