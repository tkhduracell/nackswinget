import type { Metadata } from "next";
import { Suspense } from "react";
import { ScreenPlayer } from "@/components/bigscreen/ScreenPlayer";

export const metadata: Metadata = {
  title: "Storbild",
  robots: { index: false, follow: false },
};

// The TV player. piSignage shows this page as an embedded web link; the
// key in the URL identifies the screen (docs/bigscreen-plan.md).
export default function StorbildPage({ params }: PageProps<"/storbild/[key]">) {
  return (
    <main className="bs-screen">
      <Suspense>
        <Screen params={params} />
      </Suspense>
    </main>
  );
}

async function Screen({ params }: { params: PageProps<"/storbild/[key]">["params"] }) {
  const { key } = await params;
  return <ScreenPlayer screenKey={key} />;
}
