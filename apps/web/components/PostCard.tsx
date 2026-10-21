import type { PostSummary } from "@/lib/content/types";
import { formatDate } from "@/lib/format";
import { Img } from "./Img";

export function PostCard({ post, compact }: { post: PostSummary; compact?: boolean }) {
  return (
    <article className={compact ? "post-card compact" : "post-card"}>
      {!compact && post.image && (
        <a href={`/${post.slug}/`} className="post-card-img" tabIndex={-1} aria-hidden="true">
          <Img image={post.image} sizes="(min-width: 768px) 240px, 100vw" />
        </a>
      )}
      <div className="post-card-body">
        <h3>
          <a href={`/${post.slug}/`}>{post.title}</a>
        </h3>
        <p className="muted">
          <time dateTime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
        </p>
        {!compact && post.excerpt && <p>{post.excerpt}</p>}
      </div>
    </article>
  );
}
