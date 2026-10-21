import { PostCard } from "@/components/PostCard";
import { listPosts } from "@/lib/content/cached";

export const PAGE_SIZE = 12;

export async function PostArchive({ title, category, page, basePath }: { title: string; category?: string; page: number; basePath: string }) {
  const { posts, total } = await listPosts(category, PAGE_SIZE, (page - 1) * PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const href = (n: number) => (n === 1 ? basePath : `${basePath}sida/${n}/`);
  return (
    <article className="page">
      <header className="page-header">
        <div className="container">
          <h1>{title}</h1>
        </div>
      </header>
      <div className="container page-body">
        <ul className="posts">
          {posts.map((p) => (
            <li key={p.id}>
              <PostCard post={p} />
            </li>
          ))}
        </ul>
        {pages > 1 && (
          <nav className="pagination" aria-label="Sidor">
            {page > 1 && (
              <a href={href(page - 1)} rel="prev">
                ← Nyare
              </a>
            )}
            <span>
              Sida {page} av {pages}
            </span>
            {page < pages && (
              <a href={href(page + 1)} rel="next">
                Äldre →
              </a>
            )}
          </nav>
        )}
      </div>
    </article>
  );
}

export async function archivePageCount(category?: string): Promise<number> {
  const { total } = await listPosts(category, 1);
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}
