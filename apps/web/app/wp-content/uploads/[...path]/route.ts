import { publicUrl, wpUploadPath } from "@/lib/media/urls";

// Old WordPress upload URLs (linked from Facebook, Google, mail) keep working:
// they redirect to the copied original in Cloud Storage. WP's resized
// variants ("-300x200") map back to the original.
export async function GET(_req: Request, ctx: RouteContext<"/wp-content/uploads/[...path]">) {
  const { path } = await ctx.params;
  const rel = path
    .map((p) => decodeURIComponent(p))
    .join("/")
    .replace(/-\d+x\d+(\.[a-z0-9]+)$/i, "$1")
    .replace(/-scaled(\.[a-z0-9]+)$/i, "$1");
  return new Response(null, {
    status: 308,
    headers: { Location: publicUrl(wpUploadPath(rel)), "Cache-Control": "public, max-age=86400, s-maxage=31536000" },
  });
}
