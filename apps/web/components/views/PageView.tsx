import { Sections } from "@/components/sections/Sections";
import { StarBanner } from "@/components/StarBanner";
import { Breadcrumbs } from "@/components/views/Breadcrumbs";
import { getLiveBanners, getSite, listPages, listPosts } from "@/lib/content/cached";
import type { Page } from "@/lib/content/types";

export async function PageView({ page }: { page: Page }) {
  const [{ settings }, banners] = await Promise.all([getSite(), getLiveBanners()]);
  const isHome = page.path === "";
  const hasHero = page.sections[0]?.type === "hero";
  const banner = isHome ? banners[0] : undefined;
  const env = { feeds: settings.calendarFeeds, siteUrl: settings.siteUrl, siteName: settings.siteName, idPrefix: page.id };

  // Parents for breadcrumbs, e.g. "tavlingsdans/smidans" -> Tävlingsdans > SM i dans.
  const crumbs: { name: string; path: string }[] = [];
  if (!isHome) {
    const pages = await listPages();
    const segs = page.path.split("/");
    for (let i = 1; i < segs.length; i++) {
      const parentPath = segs.slice(0, i).join("/");
      const parent = pages.find((p) => p.path === parentPath);
      if (parent) crumbs.push({ name: parent.title, path: `/${parent.path}/` });
    }
    crumbs.push({ name: page.title, path: `/${page.path}/` });
  }

  // Pages that weren't built with Divi: WordPress's default page layout.
  if (page.template === "sidebar") {
    const latest = await listPosts(undefined, 5);
    return (
      <article className="page">
        <div className="container post-layout">
          <div className="post-main">
            <h1 className="post-title">{page.title}</h1>
            <Sections sections={page.sections} env={env} />
          </div>
          <aside className="post-sidebar" aria-label="Senaste nyheter">
            <h2 className="widget-title">Senaste nyheter</h2>
            <ul className="recent-posts">
              {latest.posts.map((p) => (
                <li key={p.id}>
                  <a href={`/${p.slug}/`}>{p.title}</a>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </article>
    );
  }

  return (
    <article className={isHome ? "page page-home" : "page"}>
      {!hasHero && page.template !== "plain" && (
        <header className="page-header">
          <div className="container">
            <h1>{page.bandTitle || page.title}</h1>
          </div>
        </header>
      )}
      {crumbs.length > 0 && page.template !== "plain" && <Breadcrumbs crumbs={crumbs} settings={settings} />}
      {hasHero && (
        <>
          <Sections sections={page.sections.slice(0, 1)} env={env} />
          {banner && <StarBanner banner={banner} />}
        </>
      )}
      <div className="container page-body">
        {!hasHero && page.template === "plain" && <h1 className="sr-only">{page.title}</h1>}
        <Sections sections={hasHero ? page.sections.slice(1) : page.sections} env={env} prefix={hasHero ? "b" : "s"} />
      </div>
    </article>
  );
}
