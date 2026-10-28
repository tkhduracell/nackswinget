import type { ImageAttrs } from "@/lib/content/types";

/** A row from GET /api/admin/docs/{pages|posts} (lib/admin/content.ts listDocs). */
export interface DocRow {
  id: string;
  title: string;
  path?: string;
  slug?: string;
  status?: string;
  publishedAt?: string;
  updatedAt?: string;
  image?: ImageAttrs;
  draft: { updatedAt: string; updatedBy: string } | null;
}
