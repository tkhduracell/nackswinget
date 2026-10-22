import { z } from "zod";

// ---------------------------------------------------------------------------
// Rich text: a restricted ProseMirror/TipTap-compatible JSON document.
// Editors can't pick fonts, sizes or colours; the theme decides.
// ---------------------------------------------------------------------------

export const markSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }),
  z.object({ type: z.literal("italic") }),
  z.object({
    type: z.literal("link"),
    attrs: z.object({ href: z.string() }),
  }),
]);
export type Mark = z.infer<typeof markSchema>;

export type RichNode =
  | { type: "text"; text: string; marks?: Mark[] }
  | { type: "paragraph"; content?: RichNode[] }
  | { type: "heading"; attrs: { level: 2 | 3 }; content?: RichNode[] }
  | { type: "bulletList"; content: RichNode[] }
  | { type: "orderedList"; content: RichNode[] }
  | { type: "listItem"; content: RichNode[] }
  | { type: "blockquote"; content: RichNode[] }
  | { type: "hardBreak" }
  | { type: "horizontalRule" }
  | { type: "image"; attrs: ImageAttrs }
  | { type: "video"; attrs: VideoAttrs }
  | { type: "button"; attrs: { href: string; label: string } }
  | { type: "table"; content: RichNode[] }
  | { type: "tableRow"; content: RichNode[] }
  | { type: "tableCell"; attrs?: { header?: boolean }; content: RichNode[] };

export const imageAttrsSchema = z.object({
  // Storage path of the original, e.g. "web/uploads/2022/11/logo.png".
  src: z.string(),
  alt: z.string().default(""),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  // Widths that exist as WebP variants (see lib/media/urls.ts).
  variants: z.array(z.number().int().positive()).default([]),
  focal: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type ImageAttrs = z.infer<typeof imageAttrsSchema>;

export const videoAttrsSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("youtube"), id: z.string(), title: z.string().default("") }),
  z.object({
    provider: z.literal("file"),
    // Storage paths of the transcoded renditions and poster.
    src720: z.string(),
    src1080: z.string().optional(),
    poster: z.string().optional(),
    title: z.string().default(""),
  }),
]);
export type VideoAttrs = z.infer<typeof videoAttrsSchema>;

const richNodeSchema: z.ZodType<RichNode> = z.lazy(() =>
  z.union([
    z.object({ type: z.literal("text"), text: z.string(), marks: z.array(markSchema).optional() }),
    z.object({ type: z.literal("paragraph"), content: z.array(richNodeSchema).optional() }),
    z.object({
      type: z.literal("heading"),
      attrs: z.object({ level: z.union([z.literal(2), z.literal(3)]) }),
      content: z.array(richNodeSchema).optional(),
    }),
    z.object({ type: z.literal("bulletList"), content: z.array(richNodeSchema) }),
    z.object({ type: z.literal("orderedList"), content: z.array(richNodeSchema) }),
    z.object({ type: z.literal("listItem"), content: z.array(richNodeSchema) }),
    z.object({ type: z.literal("blockquote"), content: z.array(richNodeSchema) }),
    z.object({ type: z.literal("hardBreak") }),
    z.object({ type: z.literal("horizontalRule") }),
    z.object({ type: z.literal("image"), attrs: imageAttrsSchema }),
    z.object({ type: z.literal("video"), attrs: videoAttrsSchema }),
    z.object({ type: z.literal("button"), attrs: z.object({ href: z.string(), label: z.string() }) }),
    z.object({ type: z.literal("table"), content: z.array(richNodeSchema) }),
    z.object({ type: z.literal("tableRow"), content: z.array(richNodeSchema) }),
    z.object({
      type: z.literal("tableCell"),
      attrs: z.object({ header: z.boolean().optional() }).optional(),
      content: z.array(richNodeSchema),
    }),
  ]) as z.ZodType<RichNode>,
);

export const richDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(richNodeSchema),
});
export type RichDoc = z.infer<typeof richDocSchema>;

// ---------------------------------------------------------------------------
// Page sections (the fixed set from the plan, Q24).
// ---------------------------------------------------------------------------

const linkSchema = z.object({ label: z.string(), href: z.string() });

export const calendarViewSchema = z.enum(["list", "month", "week"]);

export type Section =
  | { type: "hero"; title: string; subtitle?: string; image?: ImageAttrs; buttons: { label: string; href: string }[] }
  | { type: "richText"; doc: RichDoc; variant?: "plain" | "boxTop" | "boxLeft"; needsReview?: boolean }
  | { type: "columns"; columns: { width: ColumnWidth; sections: Section[] }[] }
  | { type: "linkBoxes"; items: { title: string; href: string; icon?: string }[] }
  | { type: "postList"; title?: string; category?: string; count: number; showMore: boolean }
  | {
      type: "calendar";
      title?: string;
      feeds: string[];
      hiddenByDefault: string[];
      view: z.infer<typeof calendarViewSchema>;
      pastDays: number;
      count?: number;
      showLegend: boolean;
      /** Grey box with a red top border (the start page's "På gång"). */
      variant?: "boxTop";
    }
  | { type: "embed"; url: string; title: string; aspect: "16/9" | "4/3" | "1/1" | "auto"; height?: number }
  | { type: "dansSeWidget"; href: string; label: string }
  | { type: "fileList"; title?: string; items: { title: string; href: string; date?: string }[] }
  | { type: "image"; image: ImageAttrs; caption?: string; href?: string }
  | { type: "divider" }
  | { type: "pushSubscribe" };

export const columnWidthSchema = z.enum(["1/4", "1/3", "2/5", "1/2", "3/5", "2/3", "3/4", "1/1"]);
export type ColumnWidth = z.infer<typeof columnWidthSchema>;

export const sectionSchema: z.ZodType<Section> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.object({
      type: z.literal("hero"),
      title: z.string(),
      subtitle: z.string().optional(),
      image: imageAttrsSchema.optional(),
      buttons: z.array(linkSchema).max(2).default([]),
    }),
    z.object({
      type: z.literal("richText"),
      doc: richDocSchema,
      variant: z.enum(["plain", "boxTop", "boxLeft"]).optional(),
      needsReview: z.boolean().optional(),
    }),
    z.object({
      type: z.literal("columns"),
      columns: z.array(z.object({ width: columnWidthSchema, sections: z.array(sectionSchema) })).min(1).max(4),
    }),
    z.object({
      type: z.literal("linkBoxes"),
      items: z.array(z.object({ title: z.string(), href: z.string(), icon: z.string().optional() })),
    }),
    z.object({
      type: z.literal("postList"),
      title: z.string().optional(),
      category: z.string().optional(),
      count: z.number().int().min(1).max(50),
      showMore: z.boolean().default(false),
    }),
    z.object({
      type: z.literal("calendar"),
      title: z.string().optional(),
      feeds: z.array(z.string()).min(1),
      hiddenByDefault: z.array(z.string()).default([]),
      view: calendarViewSchema,
      pastDays: z.number().int().min(0).max(365).default(0),
      count: z.number().int().min(1).max(100).optional(),
      showLegend: z.boolean().default(true),
      variant: z.literal("boxTop").optional(),
    }),
    z.object({
      type: z.literal("embed"),
      url: z.url(),
      title: z.string(),
      aspect: z.enum(["16/9", "4/3", "1/1", "auto"]).default("16/9"),
      height: z.number().int().positive().optional(),
    }),
    z.object({ type: z.literal("dansSeWidget"), href: z.url(), label: z.string() }),
    z.object({
      type: z.literal("fileList"),
      title: z.string().optional(),
      items: z.array(z.object({ title: z.string(), href: z.string(), date: z.string().optional() })),
    }),
    z.object({
      type: z.literal("image"),
      image: imageAttrsSchema,
      caption: z.string().optional(),
      href: z.string().optional(),
    }),
    z.object({ type: z.literal("divider") }),
    z.object({ type: z.literal("pushSubscribe") }),
  ]) as z.ZodType<Section>,
);

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export const seoSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  image: z.string().optional(),
});
export type Seo = z.infer<typeof seoSchema>;

export const pageSchema = z.object({
  id: z.string(),
  // Full path without leading/trailing slash, e.g. "om-oss/antidoping". "" = home.
  path: z.string(),
  title: z.string(),
  /** Text in the red title band when it should differ from the title (e.g. "Hitta hit" on Kontakt). */
  bandTitle: z.string().optional(),
  parentId: z.string().nullable().default(null),
  template: z.enum(["default", "blank"]).default("default"),
  sections: z.array(sectionSchema),
  seo: seoSchema.default({}),
  status: z.enum(["draft", "published"]).default("published"),
  publishedAt: z.string(),
  updatedAt: z.string(),
  legacyId: z.number().int().optional(),
});
export type Page = z.infer<typeof pageSchema>;

export const categorySchema = z.object({
  slug: z.string(),
  name: z.string(),
});
export type Category = z.infer<typeof categorySchema>;

export const postSchema = z.object({
  id: z.string(),
  slug: z.string(),
  title: z.string(),
  excerpt: z.string().default(""),
  body: richDocSchema,
  categories: z.array(z.string()).default([]),
  image: imageAttrsSchema.optional(),
  status: z.enum(["draft", "scheduled", "published"]).default("published"),
  publishedAt: z.string(),
  updatedAt: z.string(),
  seo: seoSchema.default({}),
  legacyId: z.number().int().optional(),
});
export type Post = z.infer<typeof postSchema>;

export type PostSummary = Pick<Post, "id" | "slug" | "title" | "excerpt" | "categories" | "image" | "publishedAt">;

export const navItemSchema = z.object({
  label: z.string(),
  href: z.string(),
  children: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
});
export type NavItem = z.infer<typeof navItemSchema>;

export const calendarFeedSchema = z.object({
  key: z.string(),
  name: z.string(),
  color: z.string(),
  url: z.url(),
});
export type CalendarFeed = z.infer<typeof calendarFeedSchema>;

export const settingsSchema = z.object({
  siteName: z.string(),
  tagline: z.string(),
  siteUrl: z.url(),
  logo: z.string().optional(),
  defaultOgImage: z.string().optional(),
  social: z.object({ facebook: z.string().optional(), instagram: z.string().optional() }).default({}),
  footer: z.object({
    address: z.string().default(""),
    email: z.string().default(""),
    links: z.array(linkSchema).default([]),
    badges: z.array(z.object({ image: z.string(), href: z.string(), alt: z.string() })).default([]),
  }),
  calendarFeeds: z.array(calendarFeedSchema),
  orgNumber: z.string().optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const bannerSchema = z.object({
  text: z.string().max(120),
  href: z.string().optional(),
  startAt: z.string(),
  days: z.number().int().min(0).max(365),
});
export type Banner = z.infer<typeof bannerSchema>;

export const redirectSchema = z.object({
  from: z.string(),
  to: z.string(),
  status: z.union([z.literal(301), z.literal(308)]).default(308),
});
export type Redirect = z.infer<typeof redirectSchema>;

/** A full export of the site's content, used by the importer and local dev. */
export const snapshotSchema = z.object({
  generatedAt: z.string(),
  pages: z.array(pageSchema),
  posts: z.array(postSchema),
  categories: z.array(categorySchema),
  nav: z.array(navItemSchema),
  settings: settingsSchema,
  banners: z.array(bannerSchema),
  redirects: z.array(redirectSchema),
  // WordPress upload paths (relative to /wp-content/uploads/) to copy to Storage.
  media: z.array(z.string()),
});
export type Snapshot = z.infer<typeof snapshotSchema>;

export function bannerExpiresAt(b: Banner): Date {
  return new Date(new Date(b.startAt).getTime() + b.days * 86_400_000);
}

export function isBannerActive(b: Banner, now: Date): boolean {
  const start = new Date(b.startAt).getTime();
  return now.getTime() >= start && now.getTime() < bannerExpiresAt(b).getTime();
}
