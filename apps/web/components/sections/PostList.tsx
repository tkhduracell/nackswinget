import type { Section } from "@/lib/content/types";
import { getSite, listPosts } from "@/lib/content/cached";
import { PostCard } from "@/components/PostCard";

type PostListSection = Extract<Section, { type: "postList" }>;

export async function PostList({ section }: { section: PostListSection }) {
  const [{ posts, total }, { categories }] = await Promise.all([listPosts(section.category, section.count), getSite()]);
  const more = section.category ? `/category/${section.category}/` : "/nyheter/sida/2/";
  const compact = section.count <= 3;
  return (
    <div className={compact ? "post-list post-list-compact" : "post-list"}>
      {section.title && <h2>{section.title}</h2>}
      <ul className="posts">
        {posts.map((p) => (
          <li key={p.id}>
            <PostCard post={p} compact={compact} categories={categories} />
          </li>
        ))}
      </ul>
      {section.showMore && total > posts.length && (
        <p className="older-posts">
          <a href={more}>{compact ? "Fler nyheter »" : "« Äldre inlägg"}</a>
        </p>
      )}
    </div>
  );
}
