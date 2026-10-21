import type { Metadata } from "next";
import { Open_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font; latin subset only, two weights.
const openSans = Open_Sans({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  variable: "--font-sans",
});

export const metadata: Metadata = {
  title: "Dansklubben Nackswinget",
  description: "Danskurser och socialdans med bugg & fox i Stockholm/Nacka.",
  // Set SITE_INDEXABLE=true in apphosting.yaml at cutover.
  robots:
    process.env.SITE_INDEXABLE === "true"
      ? { index: true, follow: true }
      : { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sv" className={openSans.variable}>
      <body>{children}</body>
    </html>
  );
}
