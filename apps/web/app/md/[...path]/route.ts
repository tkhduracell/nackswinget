import { getPage, getPost, getSite } from "@/lib/content/cached";
import { pageToMarkdown, postToMarkdown } from "@/lib/markdown";

// Markdown twin of every page/post for LLMs: /md/index.md, /md/kalender.md,
// /md/om-oss/antidoping.md, /md/<post-slug>.md
export async function GET(_req: Request, ctx: RouteContext<"/md/[...path]">) {
  const segs = (await ctx.params).path.map((s) => decodeURIComponent(s));
  const last = segs[segs.length - 1] ?? "";
  if (!last.endsWith(".md")) return new Response("Not found", { status: 404 });
  segs[segs.length - 1] = last.slice(0, -3);
  const path = segs.join("/") === "index" ? "" : segs.join("/");
  const { settings } = await getSite();
  const page = await getPage(path);
  const body = page ? pageToMarkdown(page, settings.siteUrl) : !path.includes("/") ? await getPost(path).then((p) => (p ? postToMarkdown(p, settings.siteUrl) : null)) : null;
  if (!body) return new Response("Not found", { status: 404 });
  return new Response(body, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
