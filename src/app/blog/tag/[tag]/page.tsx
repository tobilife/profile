import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PostIndex } from "@/components/blog/PostIndex";
import { PageShell } from "@/components/site/PageShell";
import { collectTags, getAllPosts, getPostsByTagSlug } from "@/lib/posts";

export const dynamicParams = false;

export function generateStaticParams() {
  return collectTags(getAllPosts()).map((t) => ({ tag: t.slug }));
}

// Hangul tag slugs can arrive percent-encoded; compare on the decoded form.
const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

function labelFor(slug: string) {
  return collectTags(getAllPosts()).find((t) => t.slug === slug)?.tag;
}

export async function generateMetadata({ params }: PageProps<"/blog/tag/[tag]">): Promise<Metadata> {
  const slug = decode((await params).tag);
  const label = labelFor(slug);
  return label ? { title: `#${label}`, description: `${label} 태그가 붙은 글`, alternates: { canonical: `/blog/tag/${slug}/` } } : {};
}

export default async function TagPage({ params }: PageProps<"/blog/tag/[tag]">) {
  const slug = decode((await params).tag);
  const label = labelFor(slug);
  if (!label) notFound();
  const posts = getPostsByTagSlug(slug);
  return (
    <PageShell>
      <section className="section container" aria-labelledby="tag-title">
        <p className="crumb mono">
          <Link href="/blog/">posts/</Link>tag/{slug}
        </p>
        <h1 id="tag-title" className="page-title">
          #{label}
        </h1>
        <p className="cmd mono" data-cmd={`$ grep -l "${label}" posts/*.md | wc -l`}>
          $ grep -l &quot;{label}&quot; posts/*.md | wc -l
        </p>
        <p className="page-lead">{posts.length}편</p>
        <PostIndex posts={posts} />
      </section>
    </PageShell>
  );
}
