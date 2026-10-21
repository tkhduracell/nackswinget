import type { Section } from "@/lib/content/types";
import { listPosts } from "@/lib/content/cached";
import { PostCard } from "@/components/PostCard";

type PostListSection = Extract<Section, { type: "postList" }>;

export async function PostList({ section }: { section: PostListSection }) {
  const { posts, total } = await listPosts(section.category, section.count);
  const more = section.category ? `/category/${section.category}/` : "/nyheter/sida/2/";
  return (
    <div className="post-list">
      {section.title && <h2>{section.title}</h2>}
      <ul className={section.count <= 3 ? "posts posts-compact" : "posts"}>
        {posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} compact={section.count <= 3} />
          </li>
        ))}
      </ul>
      {section.showMore && total > posts.length && (
        <p>
          <a className="button button-ghost" href={more}>
            Fler nyheter
          </a>
        </p>
      )}
    </div>
  );
}
