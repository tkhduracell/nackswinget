import { getSite, listAllPosts, listPages } from "@/lib/content/cached";

// https://llmstxt.org: a short Markdown index pointing at the .md twins.
export async function GET() {
  const [{ settings }, pages, posts] = await Promise.all([getSite(), listPages(), listAllPosts()]);
  const base = settings.siteUrl.replace(/\/$/, "");
  const md = (p: string) => `${base}/md/${p || "index"}.md`;
  const lines = [
    `# ${settings.siteName}`,
    "",
    `> ${settings.tagline}. Dansklubb i Nacka/Stockholm med kurser, friträning, tävlingsdans och socialdans (bugg, fox, lindy hop m.m.).`,
    "",
    "## Sidor",
    ...pages
      .filter((p) => p.template !== "blank")
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((p) => `- [${p.title}](${md(p.path)})`),
    "",
    "## Senaste nyheter",
    ...posts.slice(0, 30).map((p) => `- [${p.title}](${md(p.slug)}): ${p.publishedAt.slice(0, 10)}`),
    "",
    "## Övrigt",
    `- [Kalender](${base}/kalender/): aktuella kurser, friträningar och tävlingar`,
    `- [RSS](${base}/feed/)`,
    "",
  ];
  return new Response(lines.join("\n"), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
