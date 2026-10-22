import type { Metadata, Viewport } from "next";
import { Open_Sans } from "next/font/google";
import { publicUrl, wpUploadPath } from "@/lib/media/urls";
import "./globals.css";

// Self-hosted at build time by next/font; latin subset, two weights (plan Q31).
// Not preloaded: with display=swap the metric-matched fallback paints first,
// so the font shouldn't compete with the HTML for bandwidth on slow mobiles.
const openSans = Open_Sans({
  subsets: ["latin"],
  // Variable font: one file covers the 400-800 weights the old theme used.
  display: "swap",
  preload: false,
  variable: "--font-sans",
});

const favicon = publicUrl(wpUploadPath("2022/10/favicon.png"));

export const metadata: Metadata = {
  metadataBase: new URL("https://nackswinget.se"),
  title: { default: "Dansklubben Nackswinget", template: "%s | Nackswinget" },
  description: "Danskurser och socialdans med bugg & fox i Stockholm/Nacka.",
  icons: { icon: favicon, apple: favicon },
  alternates: { types: { "application/rss+xml": "/feed/" } },
  // Set SITE_INDEXABLE=true in apphosting.yaml at cutover.
  robots:
    process.env.SITE_INDEXABLE === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className={openSans.variable}>
      <body>{children}</body>
    </html>
  );
}
