import { getPost, listAllPosts, listPages } from "@/lib/content/cached";
import { docToText } from "@/lib/import/html";
import { sectionsText } from "@/lib/seo";

// Static search index, fetched by the search dialog only when opened.
export async function GET() {
  const [pages, summaries] = await Promise.all([listPages(), listAllPosts()]);
  const posts = await Promise.all(summaries.map((s) => getPost(s.slug)));
  const docs = [
    ...pages
      .filter((p) => p.template !== "blank")
      .map((p) => ({ id: p.id, url: p.path ? `/${p.path}/` : "/", title: p.title, text: sectionsText(p.sections).slice(0, 2000) })),
    ...posts
      .filter((p) => p !== null)
      .map((p) => ({ id: p.id, url: `/${p.slug}/`, title: p.title, text: docToText(p.body).slice(0, 1500), date: p.publishedAt.slice(0, 10) })),
  ];
  return Response.json(docs);
}
