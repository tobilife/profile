import Link from "next/link";
import type { Post } from "@/lib/posts";

// Work described in the author's own migrated posts, plus one public repository.
const BUILT = [
  {
    name: "블로그 RAG 챗봇",
    text: "Next.js 챗봇에 임베딩 검색과 하이브리드 검색을 붙여 블로그 글을 찾아 답하게 했습니다.",
    href: "/blog/tobylife-blog-ai-rag/",
  },
  {
    name: "사내 문서 검색 RAG",
    text: "Ollama와 오픈소스 도구로 무료 사내 문서 검색 시스템을 구성하는 과정을 정리했습니다.",
    href: "/blog/rag-blog-post/",
  },
  {
    name: "Sim Studio 워크플로우",
    text: "코딩 없이 에이전트 워크플로우를 만들어 개발 자동화와 API 연동을 구현했습니다.",
    href: "/blog/sim-studio-complete-guide/",
  },
  {
    name: "tobibot-reports",
    text: "리포트와 대시보드를 웹으로 열람하는 공개 저장소입니다.",
    href: "https://github.com/tobilife/tobibot-reports",
  },
];

const day = (iso: string) => iso.slice(0, 10);

export function AiActivity({ recent }: { recent: Post[] }) {
  return (
    <section className="section container" aria-labelledby="ai-title">
      <h2 id="ai-title" className="reveal">
        AI 활동
      </h2>
      <p className="cmd mono" data-cmd="$ ls ~/projects">
        $ ls ~/projects
      </p>
      <ul className="built">
        {BUILT.map((b) => (
          <li key={b.name} className="reveal">
            {b.href.startsWith("http") ? (
              <a href={b.href} target="_blank" rel="noopener noreferrer">
                {b.name}
              </a>
            ) : (
              <Link href={b.href}>{b.name}</Link>
            )}
            <p>{b.text}</p>
          </li>
        ))}
      </ul>

      <p className="cmd mono" data-cmd="$ ls -t posts/ | head -3">
        $ ls -t posts/ | head -3
      </p>
      <ul className="index">
        {recent.map((p) => (
          <li key={p.slug} className="reveal">
            <time className="mono" dateTime={p.date}>
              {day(p.date)}
            </time>
            <span className="cat">{p.category}</span>
            <Link href={`/blog/${p.slug}/`}>{p.title}</Link>
          </li>
        ))}
      </ul>
      <p className="more">
        <Link href="/blog/">블로그 전체 보기</Link>
      </p>
    </section>
  );
}
