import { adminRoute, HttpError } from "@/lib/admin/auth";
import { EDITOR_SITE_DOCS, getSiteDoc, putSiteDoc, SITE_DOC_KEYS, type SiteDoc } from "@/lib/admin/content";

type Ctx = { params: Promise<{ doc: string }> };

function docOf(value: string): SiteDoc {
  if ((SITE_DOC_KEYS as string[]).includes(value)) return value as SiteDoc;
  throw new HttpError(404, "Okänt dokument");
}

export const GET = adminRoute<Ctx>("editor", async (_req, _user, { params }) => Response.json(await getSiteDoc(docOf((await params).doc))));

export const PUT = adminRoute<Ctx>("editor", async (req, user, { params }) => {
  const doc = docOf((await params).doc);
  if (!EDITOR_SITE_DOCS.includes(doc) && user.role !== "admin") throw new HttpError(403, "Kräver administratörsbehörighet");
  return Response.json(await putSiteDoc(doc, await req.json(), user));
});
