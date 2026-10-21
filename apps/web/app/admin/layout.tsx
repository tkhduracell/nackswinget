import type { Metadata } from "next";
import "./admin.css";

export const metadata: Metadata = { title: "Administration", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return children;
}
