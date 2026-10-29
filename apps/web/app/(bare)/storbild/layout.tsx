import type { Metadata } from "next";

// The TVs run Chromium in English; without this it offers to translate the
// Swedish pages and leaves a "Swedish / English" bar over the picture.
export const metadata: Metadata = { other: { google: "notranslate" } };

export default function StorbildLayout({ children }: LayoutProps<"/storbild">) {
  return children;
}
