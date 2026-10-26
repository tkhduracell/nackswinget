import { Img } from "@/components/Img";
import { RichText } from "@/components/RichText";
import { getSite, listPosts } from "@/lib/content/cached";
import type { Post } from "@/lib/content/types";
import { formatShortDate } from "@/lib/format";
import { JsonLd } from "@/components/JsonLd";
import { Breadcrumbs } from "@/components/views/Breadcrumbs";
import { articleJsonLd } from "@/lib/seo";

/** A post the way the old theme showed it: title and meta above the text, recent posts in a ruled-off sidebar. */
export async function PostView({ post }: { post: Post }) {
  const [{ settings, categories }, latest] = await Promise.all([getSite(), listPosts(undefined, 6)]);
  const cats = post.categories.map((slug) => categories.find((c) => c.slug === slug)).filter((c) => !!c);
  const crumbs = [
    { name: "Nyheter", path: "/nyheter/" },
    { name: post.title, path: `/${post.slug}/` },
  ];
  return (
    <article className="post">
      <Breadcrumbs crumbs={crumbs} settings={settings} />
      <div className="container post-layout">
        <div className="post-main">
          <h1 className="post-title">{post.title}</h1>
          <p className="post-meta">
            <time dateTime={post.publishedAt}>{formatShortDate(post.publishedAt)}</time>
            {cats.map((c, i) => (
              <span key={c.slug}>
                {i === 0 ? " | " : ", "}
                <a href={`/category/${c.slug}/`}>{c.name}</a>
              </span>
            ))}
          </p>
          {post.image && (
            <figure className="post-image">
              <Img image={post.image} alt={post.image.alt || post.title} priority sizes="(min-width: 1080px) 760px, 80vw" />
            </figure>
          )}
          <RichText doc={post.body} />
        </div>
        <aside className="post-sidebar" aria-label="Senaste nyheter">
          <h2 className="widget-title">Senaste nyheter</h2>
          <ul className="recent-posts">
            {latest.posts.slice(0, 5).map((p) => (
              <li key={p.id}>
                <a href={`/${p.slug}/`}>{p.title}</a>
              </li>
            ))}
          </ul>
        </aside>
      </div>
      <JsonLd data={articleJsonLd(settings, post)} />
    </article>
  );
}
