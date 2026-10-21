import { Calendar } from "@/components/calendar/Calendar";
import { Img } from "@/components/Img";
import { PostCard } from "@/components/PostCard";
import { RichText } from "@/components/RichText";
import { Breadcrumbs } from "@/components/views/Breadcrumbs";
import { getSite, listPosts } from "@/lib/content/cached";
import type { Post } from "@/lib/content/types";
import { formatDate } from "@/lib/format";
import { articleJsonLd } from "@/lib/seo";

export async function PostView({ post }: { post: Post }) {
  const [{ settings, categories }, latest] = await Promise.all([getSite(), listPosts(undefined, 6)]);
  const cats = post.categories.map((slug) => categories.find((c) => c.slug === slug)).filter((c) => !!c);
  return (
    <article className="post">
      <header className="page-header">
        <div className="container">
          <h1>{post.title}</h1>
          <p className="post-meta">
            <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
            {cats.map((c) => (
              <a key={c.slug} href={`/category/${c.slug}/`} className="tag">
                {c.name}
              </a>
            ))}
          </p>
        </div>
      </header>
      <Breadcrumbs crumbs={[{ name: "Nyheter", path: "/nyheter/" }, { name: post.title, path: `/${post.slug}/` }]} settings={settings} />
      <div className="container with-sidebar">
        <div className="main-col">
          {post.image && (
            <figure className="post-image">
              <Img image={post.image} priority sizes="(min-width: 1080px) 760px, 100vw" />
            </figure>
          )}
          <RichText doc={post.body} />
        </div>
        <aside className="sidebar" aria-label="Mer från Nackswinget">
          <div className="box boxTop">
            <Calendar
              section={{ type: "calendar", title: "På gång", feeds: ["huvud", "kurs", "tavlingskalender", "event", "fritraning"], hiddenByDefault: [], view: "list", pastDays: 0, count: 5, showLegend: false }}
              feeds={settings.calendarFeeds}
              siteUrl={settings.siteUrl}
              id={`${post.id}-side`}
            />
          </div>
          <div className="box boxTop">
            <h2>Senaste nyheterna</h2>
            <ul className="posts posts-compact">
              {latest.posts
                .filter((p) => p.id !== post.id)
                .slice(0, 5)
                .map((p) => (
                  <li key={p.id}>
                    <PostCard post={p} compact />
                  </li>
                ))}
            </ul>
          </div>
        </aside>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd(settings, post)) }} />
    </article>
  );
}
