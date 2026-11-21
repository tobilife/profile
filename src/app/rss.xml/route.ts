import { getAllPosts } from "@/lib/posts";
import { SITE, absoluteUrl } from "@/lib/site";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET() {
  const posts = getAllPosts();
  const items = posts
    .map((p) => {
      const url = absoluteUrl(`/blog/${p.slug}/`);
      return [
        "<item>",
        `<title>${esc(p.title)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        `<pubDate>${new Date(p.date).toUTCString()}</pubDate>`,
        `<category>${esc(p.category)}</category>`,
        `<description>${esc(p.description)}</description>`,
        "</item>",
      ].join("");
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
<title>${esc(SITE.handle)} 블로그</title>
<link>${absoluteUrl("/blog/")}</link>
<atom:link href="${absoluteUrl("/rss.xml")}" rel="self" type="application/rss+xml"/>
<description>AI 에이전트 하네스, 오케스트레이션, 저장소 소개, AI 트렌드</description>
<language>ko</language>
${posts[0] ? `<lastBuildDate>${new Date(posts[0].date).toUTCString()}</lastBuildDate>` : ""}
${items}
</channel>
</rss>
`;
  return new Response(xml, { headers: { "Content-Type": "application/rss+xml; charset=utf-8" } });
}
