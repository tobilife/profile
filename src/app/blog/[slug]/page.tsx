import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TagList } from "@/components/blog/TagList";
import { PageShell } from "@/components/site/PageShell";
import { renderMarkdown } from "@/lib/markdown";
import { getAllPosts, getPostBySlug } from "@/lib/posts";
import { DEFAULT_OG_IMAGE, SITE, absoluteUrl, withBase } from "@/lib/site";

export const dynamicParams = false;

export function generateStaticParams() {
  return getAllPosts().map((p) => ({ slug: p.slug }));
}


export async function generateMetadata({ params }: PageProps<"/blog/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.description,
    alternates: { canonical: `/blog/${post.slug}/` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.description,
      url: `/blog/${post.slug}/`,
      publishedTime: post.date,
      authors: [SITE.name],
      tags: post.tags,
      images: [absoluteUrl(post.cover ?? DEFAULT_OG_IMAGE)],
    },
  };
}

export default async function PostPage({ params }: PageProps<"/blog/[slug]">) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();
  const { html, headings } = await renderMarkdown(post.body);
  const article = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    author: { "@type": "Person", name: SITE.name, alternateName: SITE.handle },
    url: absoluteUrl(`/blog/${post.slug}/`),
  };

  return (
    <PageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(article) }} />
      <article className="post container" aria-labelledby="post-title">
        <header className="post-head">
          <p className="crumb mono">
            <Link href="/blog/">posts/</Link>
            {post.slug}.md
          </p>
          <h1 id="post-title">{post.title}</h1>
          <p className="post-meta mono">
            <time dateTime={post.date}>{post.date.slice(0, 10)}</time>
            <span className="cat">{post.category}</span>
          </p>
          <TagList tags={post.tags} />
        </header>

        <div className="post-grid">
          {headings.length > 2 && (
            <nav className="toc mono" aria-label="목차">
              <p className="toc-title">목차</p>
              <ol>
                {headings.map((h) => (
                  <li key={h.id} className={h.depth === 3 ? "sub" : undefined}>
                    <a href={`#${h.id}`}>{h.text}</a>
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <div className="prose" dangerouslySetInnerHTML={{ __html: html }} />
        </div>

        <footer className="post-foot">
          <p className="mono">
            {SITE.name} ({SITE.handle}) &lt;<a href={`mailto:${SITE.email}`}>{SITE.email}</a>&gt;
          </p>
          <p>
            <Link href="/blog/">글 목록으로</Link>
          </p>
        </footer>
      </article>
      {post.cover && <link rel="preload" as="image" href={withBase(post.cover)} />}
    </PageShell>
  );
}
