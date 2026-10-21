import { adminRoute, HttpError } from "@/lib/admin/auth";
import { audit } from "@/lib/admin/content";

// functions/news-api sends the app push for the newest /feed/ item on its
// 30-minute schedule; this asks it to run now so a fresh post goes out at once.
const NEWS_API = "https://europe-north1-nackswinget-af7ef.cloudfunctions.net/news-api";

export const POST = adminRoute("editor", async (_req, user) => {
  const res = await fetch(`${NEWS_API}/update`, { method: "POST" });
  if (!res.ok) throw new HttpError(502, `news-api svarade ${res.status}`);
  await audit(user, "push", "news-api/update");
  return Response.json(await res.json());
});
