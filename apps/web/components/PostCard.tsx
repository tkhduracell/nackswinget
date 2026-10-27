import type { Category, PostSummary } from "@/lib/content/types";
import { formatShortDate } from "@/lib/format";
import { Img } from "./Img";

/**
 * A post in a list. Full: the old blog module (big image, title, "date | categories",
 * excerpt, "läs mer"). Compact: just the linked title (sidebar lists).
 */
export function PostCard({ post, compact, categories = [], priority }: { post: PostSummary; compact?: boolean; categories?: Category[]; priority?: boolean }) {
  const href = `/${post.slug}/`;
  if (compact) {
    return (
      <article className="post-card compact">
        <h2>
          <a href={href}>{post.title}</a>
        </h2>
      </article>
    );
  }
  const names = post.categories.map((slug) => categories.find((c) => c.slug === slug)?.name).filter(Boolean);
  return (
    <article className="post-card">
      {post.image && (
        <a href={href} className="post-card-img" tabIndex={-1} aria-hidden="true">
          <Img image={post.image} priority={priority} sizes="(min-width: 1440px) 795px, (min-width: 981px) 55vw, 80vw" />
        </a>
      )}
      <h2>
        <a href={href}>{post.title}</a>
      </h2>
      <p className="post-meta">
        <time dateTime={post.publishedAt}>{formatShortDate(post.publishedAt)}</time>
        {names.length > 0 && ` | ${names.join(", ")}`}
      </p>
      {post.excerpt && <p className="post-excerpt">{/[.!?…]$/.test(post.excerpt.trim()) ? post.excerpt : `${post.excerpt.trim()}…`}</p>}
      <a href={href} className="more-link">
        läs mer<span className="sr-only"> om {post.title}</span>
      </a>
    </article>
  );
}
