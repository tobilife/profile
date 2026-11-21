import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assertUniqueSlugs, collectTags, loadPosts, parsePost, selectPublished, tagToSlug, type Post } from "./posts";

const ok = [
  "---",
  "title: 제목",
  "date: 2025-05-27T10:01:00.000Z",
  "description: 설명",
  "category: AI 실전",
  "tags: [Sim Studio, Next.js, 검색 시스템]",
  "---",
  "본문",
].join("\n");

describe("parsePost", () => {
  it("reads front matter and uses the file name as the slug", () => {
    expect(parsePost("a-b.md", ok)).toMatchObject({
      slug: "a-b",
      title: "제목",
      description: "설명",
      category: "AI 실전",
      draft: false,
      tags: ["Sim Studio", "Next.js", "검색 시스템"],
      body: "본문",
    });
  });

  it("normalises a bare date to an ISO timestamp", () => {
    expect(parsePost("x.md", ok.replace("2025-05-27T10:01:00.000Z", "2025-04-13")).date).toBe(
      "2025-04-13T00:00:00.000Z",
    );
  });

  it("names the file and the field when a required field is missing", () => {
    expect(() => parsePost("bad.md", ok.replace("title: 제목\n", ""))).toThrow(/bad\.md.*title/);
    expect(() => parsePost("bad.md", ok.replace("description: 설명\n", ""))).toThrow(/bad\.md.*description/);
  });

  it("rejects a calendar date that does not exist instead of rolling it over", () => {
    expect(() => parsePost("bad.md", ok.replace("2025-05-27T10:01:00.000Z", "2026-02-30"))).toThrow(/bad\.md.*date/);
    expect(() => parsePost("bad.md", ok.replace("2025-05-27T10:01:00.000Z", "2026-13-45"))).toThrow(/bad\.md.*date/);
  });

  it("rejects an unparseable date", () => {
    expect(() => parsePost("bad.md", ok.replace("2025-05-27T10:01:00.000Z", "soon"))).toThrow(/bad\.md.*date/);
  });

  it("rejects an unknown category", () => {
    expect(() => parsePost("bad.md", ok.replace("AI 실전", "잡담"))).toThrow(/bad\.md.*category/);
  });

  it("rejects a file with no front matter", () => {
    expect(() => parsePost("bare.md", "본문만 있음")).toThrow(/bare\.md/);
  });

  it("accepts the engineering category", () => {
    expect(parsePost("e.md", ok.replace("AI 실전", "에이전트 엔지니어링")).category).toBe("에이전트 엔지니어링");
  });
});

describe("tagToSlug", () => {
  it("lowercases, and turns spaces and dots into dashes, keeping Hangul", () => {
    expect(tagToSlug("Sim Studio")).toBe("sim-studio");
    expect(tagToSlug("Next.js")).toBe("next-js");
    expect(tagToSlug("검색 시스템")).toBe("검색-시스템");
    expect(tagToSlug("  AI  Agent ")).toBe("ai-agent");
  });
});

const post = (over: Partial<Post>): Post => ({
  slug: "s",
  title: "t",
  date: "2025-01-01T00:00:00.000Z",
  description: "d",
  category: "AI 트렌드",
  tags: [],
  draft: false,
  body: "",
  ...over,
});

describe("selectPublished", () => {
  it("drops drafts and future posts and sorts newest first", () => {
    const now = new Date("2026-01-10T00:00:00.000Z");
    const result = selectPublished(
      [
        post({ slug: "old", date: "2025-01-01T00:00:00.000Z" }),
        post({ slug: "draft", date: "2025-06-01T00:00:00.000Z", draft: true }),
        post({ slug: "future", date: "2026-01-11T00:00:00.000Z" }),
        post({ slug: "new", date: "2026-01-09T00:00:00.000Z" }),
      ],
      now,
    );
    expect(result.map((p) => p.slug)).toEqual(["new", "old"]);
  });
});

describe("collectTags", () => {
  it("merges tags that differ only by case and counts them", () => {
    const tags = collectTags([post({ tags: ["AI", "RAG"] }), post({ tags: ["ai"] })]);
    expect(tags).toContainEqual({ tag: "AI", slug: "ai", count: 2 });
    expect(tags).toContainEqual({ tag: "RAG", slug: "rag", count: 1 });
  });
});

describe("assertUniqueSlugs", () => {
  // File names differing only by case collide on Windows/macOS but not on the Linux CI runner.
  it("throws naming both files when two posts share a slug", () => {
    expect(() =>
      assertUniqueSlugs([
        { file: "same.md", slug: "same" },
        { file: "Same.md", slug: "same" },
      ]),
    ).toThrow(/same\.md.*Same\.md/);
  });

  it("passes distinct slugs", () => {
    expect(() => assertUniqueSlugs([{ file: "a.md", slug: "a" }, { file: "b.md", slug: "b" }])).not.toThrow();
  });
});

describe("loadPosts", () => {
  it("lowercases the slug from the file name", () => {
    const dir = mkdtempSync(join(tmpdir(), "posts-"));
    writeFileSync(join(dir, "Mixed-Case.md"), ok);
    expect(loadPosts(dir).map((p) => p.slug)).toEqual(["mixed-case"]);
  });

  it("ignores files that are not markdown", () => {
    const dir = mkdtempSync(join(tmpdir(), "posts-"));
    writeFileSync(join(dir, "a.md"), ok);
    writeFileSync(join(dir, "notes.txt"), "x");
    expect(loadPosts(dir).map((p) => p.slug)).toEqual(["a"]);
  });
});
