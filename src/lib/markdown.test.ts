import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

const html = async (md: string) => (await renderMarkdown(md)).html;

describe("renderMarkdown callouts", () => {
  it.each(["note", "tip", "important", "caution", "warning"])("renders :::%s as an aside", async (kind) => {
    const out = await html(`:::${kind}\n내용\n:::`);
    expect(out).toMatch(new RegExp(`<aside class="callout callout-${kind}"`));
    expect(out).toContain("내용");
  });

  it("keeps the list inside a summary callout", async () => {
    const out = await html(":::note\n- 첫째\n- 둘째\n:::");
    expect(out).toMatch(/<aside class="callout callout-note"[^>]*>[\s\S]*<li>첫째<\/li>[\s\S]*<\/aside>/);
  });

  it("renders an unknown container as plain content without throwing", async () => {
    const out = await html(":::foo\n내용\n:::");
    expect(out).toContain("내용");
    expect(out).not.toContain("callout-foo");
  });

  it("keeps a text directive like :name as plain text", async () => {
    expect(await html("시각은 10:30이고 비율은 3:1입니다")).toContain("10:30");
  });
});

describe("renderMarkdown links and images", () => {
  it("puts the base path in front of site-relative images and links", async () => {
    expect(await html("![a](/images/uploads/d1.png)")).toContain('src="/profile/images/uploads/d1.png"');
    expect(await html("[글](/blog/x/)")).toContain('href="/profile/blog/x/"');
  });

  it("opens external links in a new tab safely", async () => {
    const out = await html("[밖](https://a.com)");
    expect(out).toMatch(/rel="noopener noreferrer"/);
    expect(out).toMatch(/target="_blank"/);
  });

  it("renders the inline citation form used by the posts", async () => {
    const out = await html("문장입니다. [\\[Anthropic: Define success\\]](https://example.com/x)");
    expect(out).toContain('href="https://example.com/x"');
    expect(out).toContain("[Anthropic: Define success]");
  });
});

describe("renderMarkdown code and html", () => {
  it("keeps angle brackets inside code as text", async () => {
    const out = await html("```typescript\nconst a: Array<string> = []\n```");
    expect(out).toContain("&#x3C;");
    expect(out).not.toContain("<string>");
  });

  it("renders a code block with an unknown language", async () => {
    expect(await html("```weird\nhello\n```")).toContain("hello");
  });

  it("keeps a <br> in body text", async () => {
    expect(await html("첫 줄<br>둘째 줄")).toContain("<br>");
  });

  it("renders GFM tables", async () => {
    expect(await html("| a | b |\n|---|---|\n| 1 | 2 |")).toContain("<table>");
  });
});

describe("renderMarkdown headings", () => {
  it("returns h2 and h3 with ids for the table of contents", async () => {
    const { headings, html: out } = await renderMarkdown("## 가\n### 나\n#### 다");
    expect(headings).toEqual([
      { depth: 2, id: expect.any(String), text: "가" },
      { depth: 3, id: expect.any(String), text: "나" },
    ]);
    expect(out).toContain(`id="${headings[0].id}"`);
  });
});
