import type { Metadata } from "next";
import { PostIndex } from "@/components/blog/PostIndex";
import { TagList } from "@/components/blog/TagList";
import { PageShell } from "@/components/site/PageShell";
import { CATEGORIES, collectTags, getAllPosts } from "@/lib/posts";
import { SITE } from "@/lib/site";

export const metadata: Metadata = {
  title: "블로그",
  description: "AI 에이전트 하네스와 오케스트레이션, 저장소 소개, AI 트렌드를 다루는 토비라이프 블로그입니다.",
  alternates: { canonical: "/blog/" },
  openGraph: { title: `${SITE.handle} 블로그`, url: "/blog/" },
};

const ANCHOR: Record<string, string> = {
  "에이전트 엔지니어링": "engineering",
  "저장소 소개": "repos",
  "AI 트렌드": "trends",
  "AI 실전": "practice",
};

export default function BlogIndex() {
  const posts = getAllPosts();
  const tags = collectTags(posts);
  const groups = CATEGORIES.map((c) => ({ category: c, posts: posts.filter((p) => p.category === c) })).filter((g) => g.posts.length);

  return (
    <PageShell>
      <section className="section container" aria-labelledby="blog-title">
        <h1 id="blog-title" className="page-title">
          블로그
        </h1>
        <p className="cmd mono" data-cmd="$ ls -lt posts/">
          $ ls -lt posts/
        </p>
        <p className="page-lead">AI 에이전트를 실제 시스템에 붙일 때 필요한 하네스와 오케스트레이션, 그리고 눈여겨볼 저장소와 흐름을 정리합니다.</p>
        <nav className="cat-nav mono" aria-label="분류">
          {groups.map((g) => (
            <a key={g.category} href={`#${ANCHOR[g.category]}`}>
              {g.category} ({g.posts.length})
            </a>
          ))}
        </nav>
      </section>

      {groups.map((g) => (
        <section key={g.category} id={ANCHOR[g.category]} className="section container" aria-labelledby={`h-${ANCHOR[g.category]}`}>
          <h2 id={`h-${ANCHOR[g.category]}`}>{g.category}</h2>
          <PostIndex posts={g.posts} />
        </section>
      ))}

      <section className="section container" aria-labelledby="tags-title">
        <h2 id="tags-title">태그</h2>
        <TagList tags={tags.map((t) => t.tag)} counts={new Map(tags.map((t) => [t.slug, t.count]))} />
      </section>
    </PageShell>
  );
}
