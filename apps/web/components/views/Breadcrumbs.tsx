import type { Settings } from "@/lib/content/types";
import { JsonLd } from "@/components/JsonLd";
import { breadcrumbJsonLd } from "@/lib/seo";

export function Breadcrumbs({ crumbs, settings }: { crumbs: { name: string; path: string }[]; settings: Settings }) {
  const all = [{ name: "Hem", path: "/" }, ...crumbs];
  return (
    <div className="breadcrumbs-bar">
      <nav className="breadcrumbs container" aria-label="Brödsmulor">
      <ol>
        {all.map((c, i) => (
          <li key={c.path}>{i === all.length - 1 ? <span aria-current="page">{c.name}</span> : <a href={c.path}>{c.name}</a>}</li>
        ))}
      </ol>
        <JsonLd data={breadcrumbJsonLd(settings, all)} />
      </nav>
    </div>
  );
}
