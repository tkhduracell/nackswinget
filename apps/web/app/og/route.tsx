import { ImageResponse } from "next/og";

// Generated share image (1200x630) for pages/posts without their own image.
export async function GET(req: Request) {
  const title = (new URL(req.url).searchParams.get("title") ?? "Dansklubben Nackswinget").slice(0, 120);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#000", color: "#fff", padding: 72 }}>
        <div style={{ display: "flex", fontSize: 34, color: "#f9064b", fontWeight: 700, letterSpacing: 2 }}>DANSKLUBBEN NACKSWINGET</div>
        <div style={{ display: "flex", fontSize: title.length > 60 ? 64 : 80, fontWeight: 700, lineHeight: 1.1 }}>{title}</div>
        <div style={{ display: "flex", height: 12, width: 220, background: "#f9064b" }} />
      </div>
    ),
    { width: 1200, height: 630, headers: { "Cache-Control": "public, max-age=86400, s-maxage=2592000", "X-Robots-Tag": "noindex" } },
  );
}
