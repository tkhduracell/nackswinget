import { Suspense } from "react";
import { AdminApp } from "@/components/admin/AdminApp";

// The admin is a client-side app (auth, editors); this page is just its shell.
export function generateStaticParams() {
  return [{ path: [] }];
}

export default function AdminPage() {
  return (
    <Suspense fallback={<p className="admin-loading">Laddar…</p>}>
      <AdminApp />
    </Suspense>
  );
}
