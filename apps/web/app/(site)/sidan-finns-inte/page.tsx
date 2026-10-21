import type { Metadata } from "next";
import NotFound from "../not-found";

// Target of the proxy's 404 rewrite (see proxy.ts).
export const metadata: Metadata = { title: "Sidan hittades inte", robots: { index: false, follow: false } };

export default function NotFoundPage() {
  return <NotFound />;
}
