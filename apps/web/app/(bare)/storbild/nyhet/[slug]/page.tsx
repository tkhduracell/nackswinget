import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RichText } from "@/components/RichText";
import { getPost } from "@/lib/content/cached";
import { imageUrl } from "@/lib/media/urls";

export const metadata: Metadata = { title: "Nyhet för storbild", robots: { index: false, follow: false } };

// One news post at TV size (the "Senaste nyheterna" and "Nyhet" blocks):
// the featured image on the left, title and text on the right.
export default function StorbildPost({ params }: PageProps<"/storbild/nyhet/[slug]">) {
  return (
    <main className="bs-content">
      <Suspense>
        <PostScreen params={params} />
      </Suspense>
    </main>
  );
}

async function PostScreen({ params }: { params: PageProps<"/storbild/nyhet/[slug]">["params"] }) {
  const { slug } = await params;
  const post = await getPost(decodeURIComponent(slug));
  if (!post) notFound();
  return (
    <article className={post.image ? "bs-post" : "bs-post no-image"}>
      {post.image && (
        // eslint-disable-next-line @next/next/no-img-element -- full-screen TV image, no layout shift to avoid
        <img className="bs-post-image" src={imageUrl(post.image.src, post.image.variants)} alt="" />
      )}
      <div className="bs-post-text">
        <p className="bs-kicker">Nyheter från Nackswinget</p>
        <h1>{post.title}</h1>
        {post.excerpt ? <p className="bs-excerpt">{post.excerpt}</p> : <RichText doc={post.body} className="bs-body" />}
      </div>
    </article>
  );
}
