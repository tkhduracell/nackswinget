import { PostCard } from "@/components/PostCard";
import { getSite, listPosts } from "@/lib/content/cached";

export const PAGE_SIZE = 12;

/** The old blog index: full post cards on the left, recent posts in a ruled-off sidebar. */
export async function PostArchive({ title, category, page, basePath }: { title: string; category?: string; page: number; basePath: string }) {
  const [{ posts, total }, latest, { categories }] = await Promise.all([
    listPosts(category, PAGE_SIZE, (page - 1) * PAGE_SIZE),
    listPosts(undefined, 5),
    getSite(),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (n: number) => (n === 1 ? basePath : `${basePath}sida/${n}/`);
  return (
    <article className="page">
      <div className="container post-layout">
        <div className="post-main">
          <h1 className="post-title">{title}</h1>
          <ul className="posts">
            {posts.map((p) => (
              <li key={p.id}>
                <PostCard post={p} categories={categories} />
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav className="pagination" aria-label="Sidor">
              {page < pages ? (
                <a href={href(page + 1)} rel="next">
                  « Äldre inlägg
                </a>
              ) : (
                <span />
              )}
              {page > 1 && (
                <a href={href(page - 1)} rel="prev">
                  Nyare inlägg »
                </a>
              )}
            </nav>
          )}
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

export async function archivePageCount(category?: string): Promise<number> {
  const { total } = await listPosts(category, 1);
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
